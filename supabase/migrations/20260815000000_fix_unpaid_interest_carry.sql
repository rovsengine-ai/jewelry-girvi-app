-- =============================================================================
-- Defect A: unpaid accrued interest was destroyed instead of carried/capitalized.
--
-- The previous body kept a single `v_accrued` bucket. A payment smaller than the
-- accrued interest left a remainder in that bucket, and the remainder was then
-- either zeroed at a compound boundary or -- more often -- overwritten by the
-- unconditional assignment that recomputes the trailing span from the (moved)
-- period anchor. Either way the customer's part-payment bought nothing.
--
-- This replacement splits accrual into two buckets:
--   v_carried : interest already charged for a window that a payment closed,
--               still unpaid. Capitalizes at a compound boundary (RULES.md:
--               "unpaid accrued interest CAPITALIZES into principal"), and is
--               never overwritten by later recomputation.
--   v_open    : interest accruing in the currently open window. Safe to
--               recompute from the anchor, because it is always re-derived for
--               the same window.
--
-- accrued_interest_paise is reported as v_carried + v_open, so the external
-- contract of the function is unchanged.
--
-- Anchor-reset behaviour on payment is deliberately left exactly as it was:
-- that is the separate `partial_period_mode = full_period` business-rule
-- question (Defect B) and is not decided here.
-- =============================================================================

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
  v_carried bigint := 0;
  v_open bigint := 0;
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
      -- Simple per-day forever; principal is never increased.
      v_days_prev := v_cursor - v_anchor;
      v_days_next := v_target - v_anchor;
      v_open := v_open
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
        v_open := v_open + (v_interest_next - v_interest_prev);
        v_cursor := v_target;

        IF v_cursor = v_capitalization_on THEN
          v_principal := v_principal + v_carried + v_open;
          v_carried := 0;
          v_open := 0;
          v_compounded := true;
          v_anchor := v_capitalization_on;
          v_cursor := v_capitalization_on;
        END IF;
      END IF;

      IF v_compounded AND v_cursor < v_pay_on THEN
        WHILE v_anchor + v_period_days <= v_pay_on LOOP
          -- The open window has completed, so its charge is one whole period.
          v_period_interest := public.period_interest_paise(v_principal, p_rate_bps);
          v_principal := v_principal + v_carried + v_period_interest;
          v_carried := 0;
          v_open := 0;
          v_anchor := v_anchor + v_period_days;
          v_cursor := v_anchor;
        END LOOP;

        IF v_anchor < v_pay_on THEN
          v_open := public.simple_span_interest_paise(
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
      v_to_interest := LEAST(v_pay_amt, v_carried);
      v_carried := v_carried - v_to_interest;
      v_interest_paid := v_interest_paid + v_to_interest;
      v_pay_amt := v_pay_amt - v_to_interest;

      v_to_interest := LEAST(v_pay_amt, v_open);
      v_open := v_open - v_to_interest;
      v_interest_paid := v_interest_paid + v_to_interest;
      v_pay_amt := v_pay_amt - v_to_interest;

      v_to_principal := LEAST(v_pay_amt, v_principal);
      v_principal := v_principal - v_to_principal;
      v_principal_paid := v_principal_paid + v_to_principal;
      v_pay_amt := v_pay_amt - v_to_principal;

      IF v_pay_amt > 0 THEN
        v_refunded := v_refunded + v_pay_amt;
      END IF;

      -- Restart the accrual window on the reduced balance. Interest already
      -- charged for the window being closed remains owed.
      v_carried := v_carried + v_open;
      v_open := 0;
      v_anchor := v_pay_on;
      v_cursor := v_pay_on;
    END IF;
  END LOOP;

  accrued_interest_paise := v_carried + v_open;
  outstanding_principal_paise := v_principal;
  total_due_paise := v_principal + v_carried + v_open;
  interest_paid_paise := v_interest_paid;
  principal_paid_paise := v_principal_paid;
  overpayment_refunded_paise := v_refunded;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_loan_balances(
  bigint, integer, date, date, public.interest_model,
  integer, integer, integer, public.partial_period_mode, jsonb
) TO authenticated, service_role;
