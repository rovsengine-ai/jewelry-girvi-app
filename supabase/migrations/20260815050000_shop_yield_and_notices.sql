-- =============================================================================
-- Stage 4: owner yield grouped by actual rate_bps, notice generation,
--          overdue rows carry the phone number the shop will call.
-- =============================================================================

-- Shared due-date: latest renewal maturity, else disbursed_on + simple_period_days.
CREATE OR REPLACE FUNCTION public.loan_current_due_on(p_loan_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT r.new_maturity_on
      FROM public.loan_renewals r
      WHERE r.loan_id = p_loan_id
      ORDER BY r.renewed_on DESC, r.created_at DESC
      LIMIT 1
    ),
    (
      SELECT (l.disbursed_on + l.simple_period_days)::date
      FROM public.loans l
      WHERE l.id = p_loan_id
    )
  );
$$;

-- Adding columns changes the return type; CREATE OR REPLACE cannot do that.
DROP FUNCTION IF EXISTS public.loans_overdue_as_of(date);

CREATE FUNCTION public.loans_overdue_as_of(
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
    AND p_as_of > d.due_on
  ORDER BY d.due_on ASC;
$$;

-- Projected simple yield on ORIGINAL principal, grouped by the rates that
-- actually exist. Replaces the RN projectYieldPaise helper, which hard-coded
-- 300 and 400 bps and truncated in JavaScript.
-- one_period uses period_interest_paise (half-up). 6P/12P are that figure
-- multiplied — a projection, not a compound replay.
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

-- Idempotent in-app notice generation. scheduled_for is the date the notice is
-- ABOUT (the due date, or due+30 for forfeiture), so re-running on later days
-- does not spam. Unique (loan_id, notice_type, scheduled_for) is the lock.
--
-- Windows (calendar days, shop timezone date passed in):
--   due_soon:            15 days before due_on through due_on inclusive
--   overdue:             p_as_of > due_on
--   renewal_offer:       same as overdue (RULES.md: interest-only after 6 months)
--   forfeiture_warning:  p_as_of >= due_on + 30
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

GRANT EXECUTE ON FUNCTION public.loan_current_due_on(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.loans_overdue_as_of(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shop_rate_yield() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_loan_notices(date) TO authenticated, service_role;
