-- =============================================================================
-- archive_loan: owner-only soft-hide. Payments, renewals, and term-changes all
-- reference loans with ON DELETE RESTRICT, so a client DELETE is a trap.
-- Archive never deletes a row. Status is unchanged; visibility is the four
-- archive columns. Staff and customers cannot see (or join to) an archived
-- loan; the owner can, and unarchive_loan restores it.
--
-- Mirrors redeem_loan / default_loan: owner_only, row lock, immutable
-- snapshot, idempotent second call. The mutation trigger now raises on every
-- DELETE and points at this RPC.
-- =============================================================================

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS archive_balance_paise bigint;

COMMENT ON COLUMN public.loans.archive_balance_paise IS
  'Total due at the moment of archive. Immutable audit figure: a later rate '
  'or term edit must never be able to rewrite what was owed when the loan '
  'was hidden. Cleared only by unarchive_loan.';

ALTER TABLE public.loans
  DROP CONSTRAINT IF EXISTS loans_archive_balance_chk;
ALTER TABLE public.loans
  ADD CONSTRAINT loans_archive_balance_chk
  CHECK (archive_balance_paise IS NULL OR archive_balance_paise >= 0);

-- All four NULL, or all four NOT NULL — same pairing idea as redemption,
-- stricter because archive is not a status and has no legacy exemption.
ALTER TABLE public.loans
  DROP CONSTRAINT IF EXISTS loans_archived_audit_chk;
ALTER TABLE public.loans
  ADD CONSTRAINT loans_archived_audit_chk CHECK (
    (
      archived_at IS NULL
      AND archived_by IS NULL
      AND archive_reason IS NULL
      AND archive_balance_paise IS NULL
    )
    OR (
      archived_at IS NOT NULL
      AND archived_by IS NOT NULL
      AND archive_reason IS NOT NULL
      AND length(btrim(archive_reason)) > 0
      AND archive_balance_paise IS NOT NULL
    )
  );

-- ---------------------------------------------------------------------------
-- Audit log for archive / unarchive. loan_term_changes.field is a closed
-- CHECK of term names, so it cannot hold this. Seeded as postgres (RLS
-- bypass); client writes go through the RPCs as owner.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_archive_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id                uuid NOT NULL REFERENCES public.loans (id) ON DELETE RESTRICT,
  action                 text NOT NULL,
  acted_by               uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  reason                 text,
  archive_balance_paise  bigint,
  created_at             timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT loan_archive_events_action_chk CHECK (action IN ('archive', 'unarchive')),
  CONSTRAINT loan_archive_events_balance_chk CHECK (
    archive_balance_paise IS NULL OR archive_balance_paise >= 0
  )
);

CREATE INDEX IF NOT EXISTS loan_archive_events_loan_id_idx
  ON public.loan_archive_events (loan_id, created_at DESC);

ALTER TABLE public.loan_archive_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loan_archive_events_select_owner" ON public.loan_archive_events;
CREATE POLICY "loan_archive_events_select_owner"
  ON public.loan_archive_events FOR SELECT TO authenticated
  USING (public.is_owner());

DROP POLICY IF EXISTS "loan_archive_events_insert_owner" ON public.loan_archive_events;
CREATE POLICY "loan_archive_events_insert_owner"
  ON public.loan_archive_events FOR INSERT TO authenticated
  WITH CHECK (public.is_owner() AND acted_by = auth.uid());

GRANT SELECT, INSERT ON public.loan_archive_events TO authenticated;
GRANT ALL ON public.loan_archive_events TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Mutation trigger: DELETE always raises (owner included). Staff cannot write
-- the archive columns, same as redemption / default audit fields.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_loan_mutation_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'loans cannot be deleted; call archive_loan instead';
  END IF;

  IF public.is_owner() THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_shop_user() THEN
    RAISE EXCEPTION 'not allowed to mutate loans';
  END IF;

  -- Staff may not end a loan by any route.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN (
       'redeemed'::public.loan_status,
       'closed'::public.loan_status,
       'defaulted'::public.loan_status
     )
  THEN
    RAISE EXCEPTION 'staff may not close, redeem or default loans';
  END IF;

  -- Staff may not write the redemption audit trail, even on an active loan.
  IF NEW.redeemed_on IS DISTINCT FROM OLD.redeemed_on
     OR NEW.redeemed_by IS DISTINCT FROM OLD.redeemed_by
     OR NEW.closure_balance_paise IS DISTINCT FROM OLD.closure_balance_paise
  THEN
    RAISE EXCEPTION 'staff may not write loan redemption fields';
  END IF;

  -- Staff may not write the forfeiture audit trail.
  IF NEW.defaulted_on IS DISTINCT FROM OLD.defaulted_on
     OR NEW.defaulted_by IS DISTINCT FROM OLD.defaulted_by
     OR NEW.default_balance_paise IS DISTINCT FROM OLD.default_balance_paise
     OR NEW.default_reason IS DISTINCT FROM OLD.default_reason
  THEN
    RAISE EXCEPTION 'staff may not write loan default fields';
  END IF;

  -- Staff may not write the archive audit trail.
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at
     OR NEW.archived_by IS DISTINCT FROM OLD.archived_by
     OR NEW.archive_reason IS DISTINCT FROM OLD.archive_reason
     OR NEW.archive_balance_paise IS DISTINCT FROM OLD.archive_balance_paise
  THEN
    RAISE EXCEPTION 'staff may not write loan archive fields';
  END IF;

  -- Staff may not edit frozen terms.
  IF NEW.interest_model IS DISTINCT FROM OLD.interest_model
     OR NEW.rate_bps IS DISTINCT FROM OLD.rate_bps
     OR NEW.simple_period_days IS DISTINCT FROM OLD.simple_period_days
     OR NEW.compound_every_days IS DISTINCT FROM OLD.compound_every_days
     OR NEW.grace_days IS DISTINCT FROM OLD.grace_days
     OR NEW.partial_period_mode IS DISTINCT FROM OLD.partial_period_mode
     OR NEW.round_up_threshold_days IS DISTINCT FROM OLD.round_up_threshold_days
  THEN
    RAISE EXCEPTION 'staff may not edit loan terms';
  END IF;

  RETURN NEW;
END;
$$;

-- Without a DELETE policy, RLS filters the row and the trigger never runs
-- (silent 0-row DELETE). USING (true) lets the statement see the row so the
-- trigger can raise. SELECT policies also apply to DELETE, so staff still
-- cannot target an archived loan (same silent 0-row as a missing id). Owner
-- can see archived rows, so their DELETE always raises. Staff DELETE of a
-- visible loan raises the same message.
DROP POLICY IF EXISTS "loans_owner_delete" ON public.loans;
DROP POLICY IF EXISTS "loans_delete_blocked" ON public.loans;
CREATE POLICY "loans_delete_blocked"
  ON public.loans FOR DELETE TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- archive_loan / unarchive_loan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_loan(
  p_loan_id uuid,
  p_reason text
)
RETURNS TABLE (
  loan_id uuid,
  archived_at timestamptz,
  archived_by uuid,
  archive_reason text,
  archive_balance_paise bigint,
  already_archived boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_loan public.loans%ROWTYPE;
  v_reason text;
  v_due bigint;
  v_today date;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'owner_only: only the owner may archive a loan';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'archive_reason is required';
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'loan not found: %', p_loan_id;
  END IF;

  IF v_loan.archived_at IS NOT NULL THEN
    loan_id := v_loan.id;
    archived_at := v_loan.archived_at;
    archived_by := v_loan.archived_by;
    archive_reason := v_loan.archive_reason;
    archive_balance_paise := v_loan.archive_balance_paise;
    already_archived := true;
    RETURN NEXT;
    RETURN;
  END IF;

  v_today := (timezone('Asia/Kolkata', now()))::date;

  SELECT b.total_due_paise
  INTO v_due
  FROM public.loan_balances_as_of(p_loan_id, v_today) b;

  IF v_due IS NULL THEN
    RAISE EXCEPTION 'balance_missing: loan_balances_as_of returned no row';
  END IF;

  UPDATE public.loans
  SET
    archived_at = timezone('utc', now()),
    archived_by = auth.uid(),
    archive_reason = v_reason,
    archive_balance_paise = v_due
  WHERE id = p_loan_id
  RETURNING * INTO v_loan;

  INSERT INTO public.loan_archive_events (
    loan_id, action, acted_by, reason, archive_balance_paise
  ) VALUES (
    v_loan.id, 'archive', auth.uid(), v_reason, v_due
  );

  loan_id := v_loan.id;
  archived_at := v_loan.archived_at;
  archived_by := v_loan.archived_by;
  archive_reason := v_loan.archive_reason;
  archive_balance_paise := v_loan.archive_balance_paise;
  already_archived := false;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.unarchive_loan(p_loan_id uuid)
RETURNS TABLE (
  loan_id uuid,
  unarchived boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_loan public.loans%ROWTYPE;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'owner_only: only the owner may unarchive a loan';
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'loan not found: %', p_loan_id;
  END IF;

  IF v_loan.archived_at IS NULL THEN
    RAISE EXCEPTION 'loan is not archived: %', p_loan_id;
  END IF;

  INSERT INTO public.loan_archive_events (
    loan_id, action, acted_by, reason, archive_balance_paise
  ) VALUES (
    v_loan.id, 'unarchive', auth.uid(), v_loan.archive_reason, v_loan.archive_balance_paise
  );

  UPDATE public.loans
  SET
    archived_at = NULL,
    archived_by = NULL,
    archive_reason = NULL,
    archive_balance_paise = NULL
  WHERE id = p_loan_id;

  loan_id := p_loan_id;
  unarchived := true;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_loan(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unarchive_loan(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- SELECT policies: owner sees archived loans; staff and customers do not.
-- Child tables join through loans so a payment / item / notice cannot leak.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "loans_select_own" ON public.loans;
CREATE POLICY "loans_select_own"
  ON public.loans FOR SELECT TO authenticated
  USING (customer_id = auth.uid() AND archived_at IS NULL);

DROP POLICY IF EXISTS "loans_shop_select" ON public.loans;
CREATE POLICY "loans_shop_select"
  ON public.loans FOR SELECT TO authenticated
  USING (
    public.is_shop_user()
    AND (archived_at IS NULL OR public.is_owner())
  );

DROP POLICY IF EXISTS "loan_items_select_own" ON public.loan_items;
CREATE POLICY "loan_items_select_own"
  ON public.loan_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = loan_items.loan_id
        AND l.customer_id = auth.uid()
        AND l.archived_at IS NULL
    )
  );

DROP POLICY IF EXISTS "loan_items_shop_select" ON public.loan_items;
CREATE POLICY "loan_items_shop_select"
  ON public.loan_items FOR SELECT TO authenticated
  USING (
    public.is_shop_user()
    AND EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = loan_items.loan_id
        AND (l.archived_at IS NULL OR public.is_owner())
    )
  );

DROP POLICY IF EXISTS "loan_item_photos_select_own" ON public.loan_item_photos;
CREATE POLICY "loan_item_photos_select_own"
  ON public.loan_item_photos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.loan_items i
      JOIN public.loans l ON l.id = i.loan_id
      WHERE i.id = loan_item_photos.loan_item_id
        AND l.customer_id = auth.uid()
        AND l.archived_at IS NULL
    )
  );

DROP POLICY IF EXISTS "loan_item_photos_shop_select" ON public.loan_item_photos;
CREATE POLICY "loan_item_photos_shop_select"
  ON public.loan_item_photos FOR SELECT TO authenticated
  USING (
    public.is_shop_user()
    AND EXISTS (
      SELECT 1
      FROM public.loan_items i
      JOIN public.loans l ON l.id = i.loan_id
      WHERE i.id = loan_item_photos.loan_item_id
        AND (l.archived_at IS NULL OR public.is_owner())
    )
  );

DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
CREATE POLICY "payments_select_own"
  ON public.payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = payments.loan_id
        AND l.customer_id = auth.uid()
        AND l.archived_at IS NULL
    )
  );

DROP POLICY IF EXISTS "payments_shop_select" ON public.payments;
CREATE POLICY "payments_shop_select"
  ON public.payments FOR SELECT TO authenticated
  USING (
    public.is_shop_user()
    AND EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = payments.loan_id
        AND (l.archived_at IS NULL OR public.is_owner())
    )
  );

DROP POLICY IF EXISTS "loan_notices_select_own" ON public.loan_notices;
CREATE POLICY "loan_notices_select_own"
  ON public.loan_notices FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = loan_notices.loan_id
        AND l.customer_id = auth.uid()
        AND l.archived_at IS NULL
    )
  );

DROP POLICY IF EXISTS "loan_notices_shop_select" ON public.loan_notices;
CREATE POLICY "loan_notices_shop_select"
  ON public.loan_notices FOR SELECT TO authenticated
  USING (
    public.is_shop_user()
    AND EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = loan_notices.loan_id
        AND (l.archived_at IS NULL OR public.is_owner())
    )
  );

DROP POLICY IF EXISTS "loan_renewals_select_own" ON public.loan_renewals;
CREATE POLICY "loan_renewals_select_own"
  ON public.loan_renewals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = loan_renewals.loan_id
        AND l.customer_id = auth.uid()
        AND l.archived_at IS NULL
    )
  );

DROP POLICY IF EXISTS "loan_renewals_shop_select" ON public.loan_renewals;
CREATE POLICY "loan_renewals_shop_select"
  ON public.loan_renewals FOR SELECT TO authenticated
  USING (
    public.is_shop_user()
    AND EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = loan_renewals.loan_id
        AND (l.archived_at IS NULL OR public.is_owner())
    )
  );

-- ---------------------------------------------------------------------------
-- Generators: an archived loan must not look overdue, yield, notify, or remind.
-- Signatures unchanged — CREATE OR REPLACE, no DROP.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.loans_overdue_as_of(
  p_as_of date DEFAULT ((timezone('Asia/Kolkata', now()))::date)
)
RETURNS TABLE (
  loan_id                      uuid,
  customer_id                  uuid,
  serial_number                text,
  disbursed_on                 date,
  due_on                       date,
  days_overdue                 integer,
  outstanding_principal_paise  bigint,
  accrued_interest_paise       bigint,
  total_due_paise              bigint,
  customer_name                text,
  phone_number                 text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.customer_id,
    l.serial_number,
    l.disbursed_on,
    d.due_on,
    (p_as_of - d.due_on)::integer,
    b.outstanding_principal_paise,
    b.accrued_interest_paise,
    b.total_due_paise,
    p.full_name,
    p.phone_number
  FROM public.loans l
  LEFT JOIN public.profiles p ON p.id = l.customer_id
  CROSS JOIN LATERAL (SELECT public.loan_current_due_on(l.id) AS due_on) d
  CROSS JOIN LATERAL public.loan_balances_as_of(l.id, p_as_of) b
  WHERE l.status = 'active'::public.loan_status
    AND l.archived_at IS NULL
    AND p_as_of > d.due_on
  ORDER BY d.due_on ASC;
$$;

CREATE OR REPLACE FUNCTION public.shop_rate_yield()
RETURNS TABLE (
  rate_bps                 integer,
  loan_count               bigint,
  principal_paise          bigint,
  one_period_yield_paise   bigint,
  six_period_yield_paise   bigint,
  twelve_period_yield_paise bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_owner() THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH per_loan AS (
    SELECT
      l.rate_bps,
      l.principal_paise,
      public.period_interest_paise(l.principal_paise, l.rate_bps) AS one_period
    FROM public.loans l
    WHERE l.status = 'active'::public.loan_status
      AND l.archived_at IS NULL
  )
  SELECT
    p.rate_bps,
    count(*)::bigint,
    coalesce(sum(p.principal_paise), 0)::bigint,
    coalesce(sum(p.one_period), 0)::bigint,
    coalesce(sum(p.one_period), 0)::bigint * 6,
    coalesce(sum(p.one_period), 0)::bigint * 12
  FROM per_loan p
  GROUP BY p.rate_bps
  ORDER BY p.rate_bps;
END;
$$;

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
  IF NOT public.is_shop_user() THEN
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

CREATE OR REPLACE FUNCTION public.customer_loan_reminder_schedule(
  p_as_of date DEFAULT ((timezone('Asia/Kolkata', now()))::date)
)
RETURNS TABLE (
  loan_id        uuid,
  serial_number  text,
  due_on         date,
  reminder_kind  text,
  fire_at        timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH active_own AS (
    SELECT
      l.id AS loan_id,
      l.serial_number,
      public.loan_current_due_on(l.id) AS due_on
    FROM public.loans l
    WHERE l.customer_id = auth.uid()
      AND l.status = 'active'::public.loan_status
      AND l.archived_at IS NULL
  ),
  slots AS (
    SELECT
      a.loan_id,
      a.serial_number,
      a.due_on,
      k.reminder_kind,
      ((a.due_on + k.day_offset) + time '09:00') AT TIME ZONE 'Asia/Kolkata' AS fire_at
    FROM active_own a
    CROSS JOIN (
      VALUES
        ('due_soon'::text, -15),
        ('due_today'::text, 0),
        ('overdue'::text, 1)
    ) AS k(reminder_kind, day_offset)
  ),
  clock AS (
    SELECT timezone('Asia/Kolkata', now()) AS local_now
  )
  SELECT s.loan_id, s.serial_number, s.due_on, s.reminder_kind, s.fire_at
  FROM slots s
  UNION ALL
  -- First overdue 09:00 already passed: schedule the next Kolkata 09:00.
  SELECT
    a.loan_id,
    a.serial_number,
    a.due_on,
    'overdue'::text,
    (
      CASE
        WHEN c.local_now < date_trunc('day', c.local_now) + interval '9 hours'
          THEN date_trunc('day', c.local_now) + interval '9 hours'
        ELSE date_trunc('day', c.local_now) + interval '1 day' + interval '9 hours'
      END
    ) AT TIME ZONE 'Asia/Kolkata'
  FROM active_own a
  CROSS JOIN clock c
  WHERE p_as_of > a.due_on
    AND ((a.due_on + 1) + time '09:00') AT TIME ZONE 'Asia/Kolkata' <= now();
$$;
