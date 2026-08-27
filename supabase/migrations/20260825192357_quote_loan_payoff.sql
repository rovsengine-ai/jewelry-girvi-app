-- =============================================================================
-- Quote a hypothetical payoff from amount + dates. Shop owner and staff only.
-- Arithmetic is compute_loan_balances; this RPC only loads shop defaults,
-- gates the caller, and returns a breakdown. No loan row is written.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.quote_loan_payoff(
  p_principal_paise bigint,
  p_disbursed_on date,
  p_as_of date DEFAULT ((timezone('Asia/Kolkata', now()))::date),
  p_interest_model public.interest_model DEFAULT NULL
)
RETURNS TABLE (
  principal_paise bigint,
  accrued_interest_paise bigint,
  total_due_paise bigint,
  days_elapsed integer,
  complete_periods integer,
  remainder_days integer,
  remainder_rounded_up boolean,
  first_month_floor_applied boolean,
  capitalized boolean,
  period_interest_paise bigint,
  rate_bps integer,
  interest_model public.interest_model,
  partial_period_mode public.partial_period_mode,
  round_up_threshold_days integer,
  simple_period_days integer,
  disbursed_on date,
  as_of date,
  why_code text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_defaults public.shop_defaults%ROWTYPE;
  v_model public.interest_model;
  v_rate integer;
  v_as_of date;
  v_days integer;
  v_period integer;
  v_complete integer;
  v_remainder integer;
  v_balances record;
  v_why text;
  v_capitalized boolean;
  v_floor boolean;
  v_round_up boolean;
BEGIN
  IF NOT public.is_shop_user() THEN
    RAISE EXCEPTION 'shop_only: only owner or staff may quote a payoff';
  END IF;

  IF p_principal_paise IS NULL OR p_principal_paise <= 0 THEN
    RAISE EXCEPTION 'principal must be greater than zero';
  END IF;

  IF p_disbursed_on IS NULL THEN
    RAISE EXCEPTION 'pledge date is required';
  END IF;

  SELECT * INTO v_defaults FROM public.shop_defaults WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'shop_defaults row missing';
  END IF;

  v_as_of := COALESCE(p_as_of, (timezone('Asia/Kolkata', now()))::date);
  v_model := COALESCE(p_interest_model, v_defaults.interest_model);
  v_rate := CASE
    WHEN v_model = 'merchant'::public.interest_model THEN v_defaults.merchant_rate_bps
    ELSE v_defaults.rate_bps
  END;
  v_period := v_defaults.compound_every_days;

  SELECT * INTO v_balances
  FROM public.compute_loan_balances(
    p_principal_paise,
    v_rate,
    p_disbursed_on,
    v_as_of,
    v_model,
    v_defaults.simple_period_days,
    v_defaults.compound_every_days,
    v_defaults.grace_days,
    v_defaults.partial_period_mode,
    '[]'::jsonb,
    v_defaults.round_up_threshold_days
  );

  v_days := v_as_of - p_disbursed_on;
  v_complete := v_days / v_period;
  v_remainder := v_days % v_period;
  v_capitalized := v_model = 'retail'::public.interest_model
    AND v_days >= v_defaults.simple_period_days;
  v_floor := v_model = 'retail'::public.interest_model
    AND v_defaults.partial_period_mode = 'min_month_then_pro_rata'::public.partial_period_mode
    AND v_days > 0
    AND v_days < v_period;
  v_round_up := v_model = 'retail'::public.interest_model
    AND v_defaults.partial_period_mode = 'min_month_then_pro_rata'::public.partial_period_mode
    AND v_days > 0
    AND v_remainder >= v_defaults.round_up_threshold_days;

  IF v_days = 0 THEN
    v_why := 'same_day';
  ELSIF v_model = 'merchant'::public.interest_model THEN
    v_why := 'merchant_per_day';
  ELSIF v_capitalized THEN
    v_why := 'compounded';
  ELSIF v_defaults.partial_period_mode = 'full_period'::public.partial_period_mode THEN
    v_why := 'full_period';
  ELSIF v_floor AND NOT v_round_up THEN
    v_why := 'first_month_floor';
  ELSIF v_round_up THEN
    v_why := 'remainder_round_up';
  ELSIF v_remainder = 0 THEN
    v_why := 'exact_periods';
  ELSE
    v_why := 'pro_rata_remainder';
  END IF;

  principal_paise := v_balances.outstanding_principal_paise;
  accrued_interest_paise := v_balances.accrued_interest_paise;
  total_due_paise := v_balances.total_due_paise;
  days_elapsed := v_days;
  complete_periods := v_complete;
  remainder_days := v_remainder;
  remainder_rounded_up := v_round_up;
  first_month_floor_applied := v_floor;
  capitalized := v_capitalized;
  period_interest_paise := public.period_interest_paise(p_principal_paise, v_rate);
  rate_bps := v_rate;
  interest_model := v_model;
  partial_period_mode := v_defaults.partial_period_mode;
  round_up_threshold_days := v_defaults.round_up_threshold_days;
  simple_period_days := v_defaults.simple_period_days;
  disbursed_on := p_disbursed_on;
  as_of := v_as_of;
  why_code := v_why;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.quote_loan_payoff(bigint, date, date, public.interest_model) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_loan_payoff(bigint, date, date, public.interest_model) TO authenticated, service_role;
