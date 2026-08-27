-- =============================================================================
-- Phase 3: server-side loan balance / interest engine (integer paise only).
-- =============================================================================

ALTER TABLE public.shop_defaults
  ADD COLUMN IF NOT EXISTS merchant_rate_bps integer;

UPDATE public.shop_defaults
SET merchant_rate_bps = COALESCE(merchant_rate_bps, 150)
WHERE id = 1;

ALTER TABLE public.shop_defaults
  ALTER COLUMN merchant_rate_bps SET DEFAULT 150,
  ALTER COLUMN merchant_rate_bps SET NOT NULL;

ALTER TABLE public.shop_defaults
  DROP CONSTRAINT IF EXISTS shop_defaults_merchant_rate_bps_chk;

ALTER TABLE public.shop_defaults
  ADD CONSTRAINT shop_defaults_merchant_rate_bps_chk
  CHECK (merchant_rate_bps > 0 AND merchant_rate_bps <= 10000);

CREATE OR REPLACE FUNCTION public.div_round_half_up(p_numerator bigint, p_denominator bigint)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_denominator <= 0 THEN
    RAISE EXCEPTION 'denominator must be positive';
  END IF;
  IF p_numerator < 0 THEN
    RAISE EXCEPTION 'numerator must be non-negative for money math';
  END IF;
  RETURN (p_numerator + (p_denominator / 2)) / p_denominator;
END;
$$;

CREATE OR REPLACE FUNCTION public.period_interest_paise(p_principal bigint, p_rate_bps integer)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_principal <= 0 THEN 0::bigint
    ELSE public.div_round_half_up(p_principal * p_rate_bps::bigint, 10000)
  END;
$$;

CREATE OR REPLACE FUNCTION public.pro_rata_interest_paise(
  p_principal bigint,
  p_rate_bps integer,
  p_days integer
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_days <= 0 OR p_principal <= 0 THEN 0::bigint
    ELSE public.div_round_half_up(
      p_principal * p_rate_bps::bigint * p_days::bigint,
      30 * 10000
    )
  END;
$$;

-- Interest recognized over `p_days` from a period anchor (simple / non-compounding).
CREATE OR REPLACE FUNCTION public.simple_span_interest_paise(
  p_principal bigint,
  p_rate_bps integer,
  p_days integer,
  p_period_days integer,
  p_mode public.partial_period_mode
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_complete integer;
  v_remainder integer;
BEGIN
  IF p_days <= 0 OR p_principal <= 0 THEN
    RETURN 0;
  END IF;

  v_complete := p_days / p_period_days;
  v_remainder := p_days % p_period_days;

  IF p_mode = 'full_period'::public.partial_period_mode THEN
    RETURN (v_complete + CASE WHEN v_remainder > 0 THEN 1 ELSE 0 END)
      * public.period_interest_paise(p_principal, p_rate_bps);
  END IF;

  RETURN v_complete * public.period_interest_paise(p_principal, p_rate_bps)
    + public.pro_rata_interest_paise(p_principal, p_rate_bps, v_remainder);
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_loan_balances(
  p_principal_paise bigint,
  p_rate_bps integer,
  p_disbursed_on date,
  p_as_of date,
  p_interest_model public.interest_model,
  p_simple_period_days integer,
  p_compound_every_days integer,
  p_grace_days integer,
  p_partial_period_mode public.partial_period_mode,
  p_payments jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE (
  accrued_interest_paise bigint,
  outstanding_principal_paise bigint,
  total_due_paise bigint,
  interest_paid_paise bigint,
  principal_paid_paise bigint,
  overpayment_refunded_paise bigint
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_principal bigint := p_principal_paise;
  v_accrued bigint := 0;
  v_interest_paid bigint := 0;
  v_principal_paid bigint := 0;
  v_refunded bigint := 0;
  v_anchor date := p_disbursed_on;
  v_cursor date := p_disbursed_on;
  v_as_of date := p_as_of;
  v_capitalization_on date := p_disbursed_on + p_simple_period_days;
  v_compounded boolean := false;
  v_target date;
  v_days_prev integer;
  v_days_next integer;
  v_interest_prev bigint;
  v_interest_next bigint;
  v_period_days integer := p_compound_every_days;
  v_pay jsonb;
  v_pay_on date;
  v_pay_amt bigint;
  v_to_interest bigint;
  v_to_principal bigint;
  v_payments jsonb;
  v_period_interest bigint;
BEGIN
  IF p_grace_days <> 0 THEN
    NULL; -- reserved; RULES fix grace at 0
  END IF;

  IF v_as_of < p_disbursed_on THEN
    RAISE EXCEPTION 'as_of (%) before disbursed_on (%)', v_as_of, p_disbursed_on;
  END IF;

  v_payments := COALESCE(p_payments, '[]'::jsonb);
  v_payments := v_payments || jsonb_build_array(
    jsonb_build_object('paid_on', v_as_of::text, 'amount_paise', 0, 'is_as_of', true)
  );

  FOR v_pay IN
    SELECT value
    FROM jsonb_array_elements(v_payments) AS t(value)
    ORDER BY (value->>'paid_on')::date ASC,
             COALESCE((value->>'is_as_of')::boolean, false) ASC
  LOOP
    v_pay_on := (v_pay->>'paid_on')::date;
    v_pay_amt := COALESCE((v_pay->>'amount_paise')::bigint, 0);

    IF v_pay_on < p_disbursed_on OR v_pay_on > v_as_of THEN
      CONTINUE;
    END IF;

    v_target := v_pay_on;

    IF p_interest_model = 'merchant'::public.interest_model THEN
      v_days_prev := v_cursor - v_anchor;
      v_days_next := v_target - v_anchor;
      v_accrued := v_accrued
        + public.pro_rata_interest_paise(v_principal, p_rate_bps, v_days_next)
        - public.pro_rata_interest_paise(v_principal, p_rate_bps, v_days_prev);
      v_cursor := v_target;

    ELSE
      -- Retail: simple until capitalization day, then compound.
      IF NOT v_compounded THEN
        v_target := LEAST(v_pay_on, v_capitalization_on);

        v_days_prev := v_cursor - v_anchor;
        v_days_next := v_target - v_anchor;
        v_interest_prev := public.simple_span_interest_paise(
          v_principal, p_rate_bps, v_days_prev, v_period_days, p_partial_period_mode
        );
        v_interest_next := public.simple_span_interest_paise(
          v_principal, p_rate_bps, v_days_next, v_period_days, p_partial_period_mode
        );
        v_accrued := v_accrued + (v_interest_next - v_interest_prev);
        v_cursor := v_target;

        IF v_cursor = v_capitalization_on THEN
          v_principal := v_principal + v_accrued;
          v_accrued := 0;
          v_compounded := true;
          v_anchor := v_capitalization_on;
          v_cursor := v_capitalization_on;
        END IF;
      END IF;

      IF v_compounded AND v_cursor < v_pay_on THEN
        -- Complete compound periods from the period anchor; then set trailing accrued.
        WHILE v_anchor + v_period_days <= v_pay_on LOOP
          v_period_interest := public.period_interest_paise(v_principal, p_rate_bps);
          -- Open-period accrued is replaced by capitalization at the boundary.
          v_accrued := 0;
          v_principal := v_principal + v_period_interest;
          v_anchor := v_anchor + v_period_days;
          v_cursor := v_anchor;
        END LOOP;

        IF v_anchor < v_pay_on THEN
          v_accrued := public.simple_span_interest_paise(
            v_principal,
            p_rate_bps,
            v_pay_on - v_anchor,
            v_period_days,
            p_partial_period_mode
          );
          v_cursor := v_pay_on;
        END IF;
      END IF;
    END IF;

    IF v_pay_amt > 0 THEN
      v_to_interest := LEAST(v_pay_amt, v_accrued);
      v_accrued := v_accrued - v_to_interest;
      v_interest_paid := v_interest_paid + v_to_interest;
      v_pay_amt := v_pay_amt - v_to_interest;

      v_to_principal := LEAST(v_pay_amt, v_principal);
      v_principal := v_principal - v_to_principal;
      v_principal_paid := v_principal_paid + v_to_principal;
      v_pay_amt := v_pay_amt - v_to_principal;

      IF v_pay_amt > 0 THEN
        v_refunded := v_refunded + v_pay_amt;
      END IF;

      -- Restart accrual window on reduced balance.
      v_anchor := v_pay_on;
      v_cursor := v_pay_on;
    END IF;
  END LOOP;

  accrued_interest_paise := v_accrued;
  outstanding_principal_paise := v_principal;
  total_due_paise := v_principal + v_accrued;
  interest_paid_paise := v_interest_paid;
  principal_paid_paise := v_principal_paid;
  overpayment_refunded_paise := v_refunded;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.loan_balances_as_of(
  p_loan_id uuid,
  p_as_of date DEFAULT ((timezone('Asia/Kolkata', now()))::date)
)
RETURNS TABLE (
  accrued_interest_paise bigint,
  outstanding_principal_paise bigint,
  total_due_paise bigint,
  interest_paid_paise bigint,
  principal_paid_paise bigint,
  overpayment_refunded_paise bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_loan public.loans%ROWTYPE;
  v_payments jsonb;
BEGIN
  SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'loan not found: %', p_loan_id;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'paid_on', p.paid_on::text,
        'amount_paise', p.amount_paid_paise
      )
      ORDER BY p.paid_on ASC, p.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_payments
  FROM public.payments p
  WHERE p.loan_id = p_loan_id
    AND p.paid_on <= p_as_of;

  RETURN QUERY
  SELECT *
  FROM public.compute_loan_balances(
    v_loan.principal_paise,
    v_loan.rate_bps,
    v_loan.disbursed_on,
    p_as_of,
    v_loan.interest_model,
    v_loan.simple_period_days,
    v_loan.compound_every_days,
    v_loan.grace_days,
    v_loan.partial_period_mode,
    v_payments
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.div_round_half_up(bigint, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.period_interest_paise(bigint, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pro_rata_interest_paise(bigint, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.simple_span_interest_paise(bigint, integer, integer, integer, public.partial_period_mode) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_loan_balances(bigint, integer, date, date, public.interest_model, integer, integer, integer, public.partial_period_mode, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.loan_balances_as_of(uuid, date) TO authenticated, service_role;
