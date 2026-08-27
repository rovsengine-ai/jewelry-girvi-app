-- Tighten shop/service guards: auth.role() = 'service_role' was not reliable
-- under test JWTs and could allow customers past the gate.
-- Do not edit 20260823140000_profile_push_tokens.sql.

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
    NULL;
  ELSIF auth.uid() IS NULL AND current_user = 'service_role' THEN
    NULL;
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
