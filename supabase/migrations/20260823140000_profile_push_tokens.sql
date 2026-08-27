-- Expo push tokens per profile + idempotent push claim on loan_notices.
-- Push is remote delivery for generate_loan_notices rows; SMS/WhatsApp stay forbidden.
-- Do not edit prior migrations.

-- ---------------------------------------------------------------------------
-- profile_push_tokens — one row per device token; owner-only RLS
-- ---------------------------------------------------------------------------
CREATE TABLE public.profile_push_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  expo_push_token text NOT NULL,
  platform        text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT profile_push_tokens_platform_chk CHECK (platform IN ('ios', 'android')),
  CONSTRAINT profile_push_tokens_token_nonempty_chk CHECK (char_length(btrim(expo_push_token)) >= 16)
);

CREATE UNIQUE INDEX profile_push_tokens_profile_token_uidx
  ON public.profile_push_tokens (profile_id, expo_push_token);

CREATE INDEX profile_push_tokens_profile_id_idx
  ON public.profile_push_tokens (profile_id);

COMMENT ON TABLE public.profile_push_tokens IS
  'Expo push tokens for native apps. Web push is out of scope (iOS browser push needs Home Screen install).';

ALTER TABLE public.profile_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_push_tokens_select_own"
  ON public.profile_push_tokens FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "profile_push_tokens_insert_own"
  ON public.profile_push_tokens FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "profile_push_tokens_update_own"
  ON public.profile_push_tokens FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "profile_push_tokens_delete_own"
  ON public.profile_push_tokens FOR DELETE TO authenticated
  USING (profile_id = auth.uid());

REVOKE ALL ON TABLE public.profile_push_tokens FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profile_push_tokens
  TO authenticated;
GRANT ALL ON TABLE public.profile_push_tokens TO service_role;

-- ---------------------------------------------------------------------------
-- loan_notices: track Expo push separately from in_app sent_at
-- ---------------------------------------------------------------------------
ALTER TABLE public.loan_notices
  ADD COLUMN IF NOT EXISTS push_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_ticket_id text;

COMMENT ON COLUMN public.loan_notices.push_sent_at IS
  'Set when this notice is claimed for Expo push. NULL = not yet pushed. Claim is the idempotency latch.';
COMMENT ON COLUMN public.loan_notices.push_ticket_id IS
  'Expo push ticket id after a successful (or attempted) send.';

CREATE INDEX IF NOT EXISTS loan_notices_push_pending_idx
  ON public.loan_notices (created_at)
  WHERE push_sent_at IS NULL;

-- ---------------------------------------------------------------------------
-- generate_loan_notices: allow service_role for cron / edge (still shop for JWTs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_loan_notices(
  p_as_of date DEFAULT ((timezone('Asia/Kolkata', now()))::date)
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_n integer;
BEGIN
  IF public.is_shop_user() THEN
    NULL; -- shop JWT
  ELSIF auth.uid() IS NULL AND current_user = 'service_role' THEN
    NULL; -- Edge / cron with service_role key
  ELSE
    RAISE EXCEPTION 'shop_only: only shop users may generate notices';
  END IF;

  INSERT INTO public.loan_notices (
    loan_id, notice_type, scheduled_for, sent_at, channel, delivery_status, payload
  )
  SELECT
    l.id,
    'due_soon',
    d.due_on,
    timezone('utc', now()),
    'in_app',
    'sent',
    jsonb_build_object('due_on', d.due_on, 'days_until_due', (d.due_on - p_as_of))
  FROM public.loans l
  CROSS JOIN LATERAL (SELECT public.loan_current_due_on(l.id) AS due_on) d
  WHERE l.status = 'active'::public.loan_status
    AND l.archived_at IS NULL
    AND p_as_of <= d.due_on
    AND p_as_of >= (d.due_on - 15)
  ON CONFLICT (loan_id, notice_type, scheduled_for) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_inserted := v_inserted + v_n;

  INSERT INTO public.loan_notices (
    loan_id, notice_type, scheduled_for, sent_at, channel, delivery_status, payload
  )
  SELECT
    o.loan_id,
    'overdue',
    o.due_on,
    timezone('utc', now()),
    'in_app',
    'sent',
    jsonb_build_object(
      'due_on', o.due_on,
      'days_overdue', o.days_overdue,
      'total_due_paise', o.total_due_paise
    )
  FROM public.loans_overdue_as_of(p_as_of) o
  ON CONFLICT (loan_id, notice_type, scheduled_for) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_inserted := v_inserted + v_n;

  INSERT INTO public.loan_notices (
    loan_id, notice_type, scheduled_for, sent_at, channel, delivery_status, payload
  )
  SELECT
    o.loan_id,
    'renewal_offer',
    o.due_on,
    timezone('utc', now()),
    'in_app',
    'sent',
    jsonb_build_object(
      'due_on', o.due_on,
      'days_overdue', o.days_overdue,
      'accrued_interest_paise', o.accrued_interest_paise
    )
  FROM public.loans_overdue_as_of(p_as_of) o
  ON CONFLICT (loan_id, notice_type, scheduled_for) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_inserted := v_inserted + v_n;

  INSERT INTO public.loan_notices (
    loan_id, notice_type, scheduled_for, sent_at, channel, delivery_status, payload
  )
  SELECT
    o.loan_id,
    'forfeiture_warning',
    (o.due_on + 30),
    timezone('utc', now()),
    'in_app',
    'sent',
    jsonb_build_object(
      'due_on', o.due_on,
      'days_overdue', o.days_overdue,
      'total_due_paise', o.total_due_paise
    )
  FROM public.loans_overdue_as_of(p_as_of) o
  WHERE o.days_overdue >= 30
  ON CONFLICT (loan_id, notice_type, scheduled_for) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_inserted := v_inserted + v_n;

  RETURN v_inserted;
END;
$$;

-- ---------------------------------------------------------------------------
-- Claim pending pushes (idempotent latch on push_sent_at)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_pending_loan_notice_pushes(
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  notice_id uuid,
  loan_id uuid,
  customer_id uuid,
  notice_type text,
  serial_number text,
  expo_push_tokens text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := COALESCE(p_limit, 100);
BEGIN
  IF v_limit < 1 THEN
    v_limit := 1;
  ELSIF v_limit > 500 THEN
    v_limit := 500;
  END IF;

  IF public.is_shop_user() THEN
    NULL;
  ELSIF auth.uid() IS NULL AND current_user = 'service_role' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'shop_or_service_only: only shop users or service_role may claim notice pushes';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT n.id
    FROM public.loan_notices n
    WHERE n.push_sent_at IS NULL
    ORDER BY n.created_at ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.loan_notices n
    SET push_sent_at = timezone('utc', now())
    FROM picked p
    WHERE n.id = p.id
      AND n.push_sent_at IS NULL
    RETURNING n.id, n.loan_id, n.notice_type
  )
  SELECT
    c.id,
    c.loan_id,
    l.customer_id,
    c.notice_type,
    l.serial_number,
    COALESCE(
      (
        SELECT array_agg(t.expo_push_token ORDER BY t.updated_at DESC)
        FROM public.profile_push_tokens t
        WHERE t.profile_id = l.customer_id
      ),
      ARRAY[]::text[]
    )
  FROM claimed c
  INNER JOIN public.loans l ON l.id = c.loan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_loan_notice_pushes(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pending_loan_notice_pushes(integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.claim_pending_loan_notice_pushes(integer) IS
  'Atomically claims loan_notices for Expo push via push_sent_at. Retries see zero rows for already-claimed ids.';

-- ---------------------------------------------------------------------------
-- Upsert own Expo token (profile_id forced to auth.uid())
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_own_push_token(
  p_expo_push_token text,
  p_platform text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_token text := btrim(COALESCE(p_expo_push_token, ''));
  v_platform text := lower(btrim(COALESCE(p_platform, '')));
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated: sign in before registering a push token';
  END IF;

  IF v_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'invalid_platform: only ios and android push tokens are stored';
  END IF;

  IF char_length(v_token) < 16 THEN
    RAISE EXCEPTION 'invalid_token: expo push token is too short';
  END IF;

  INSERT INTO public.profile_push_tokens (profile_id, expo_push_token, platform)
  VALUES (v_uid, v_token, v_platform)
  ON CONFLICT (profile_id, expo_push_token) DO UPDATE
    SET platform = EXCLUDED.platform,
        updated_at = timezone('utc', now())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_own_push_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_own_push_token(text, text)
  TO authenticated;

COMMENT ON FUNCTION public.upsert_own_push_token(text, text) IS
  'Registers the caller''s Expo push token. Web/platform other than ios|android is refused.';
