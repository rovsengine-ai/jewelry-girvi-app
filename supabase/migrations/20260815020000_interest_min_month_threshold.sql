-- =============================================================================
-- Owner-decided interest rule (supersedes the accrual behaviour of
-- 20260813190000 and 20260815000000). Two changes, both money-affecting:
--
-- 1. New default accrual mode 'min_month_then_pro_rata':
--      * the first month of a loan is ALWAYS charged in full, however early the
--        customer redeems (minimum one month's interest);
--      * after that, complete months charge in full and the trailing remainder
--        is charged per day, EXCEPT that a remainder of at least
--        round_up_threshold_days (default 24) is rounded up to a whole month.
--    Worked example, 50,000 rupee loan at 300 bps (one month = 1500 rupees):
--      day  5 -> 1500 (first-month minimum)
--      day 25 -> 1500 (remainder 25 >= 24, rounds up)
--      day 30 -> 1500
--      day 33 -> 1650 (one month + 3 days at 50/day)
--      day 55 -> 3000 (one month + remainder 25 rounded up)
--    'full_period' (previous default) and 'pro_rata' remain selectable per loan.
--
-- 2. The 30-day month grid is anchored to the pledge date and a payment does
--    NOT restart it. Previously every payment moved the anchor, so under
--    'full_period' a customer who paid interest on day 7 and redeemed on day 33
--    was charged two whole months (3000) instead of 1650. Paying more often
--    made the loan more expensive.
--
-- Existing loans keep the terms frozen on their own row; only new loans pick up
-- the new default. Behaviour for loans with no payments is unchanged.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. round_up_threshold_days: a frozen, owner-editable loan term
-- ---------------------------------------------------------------------------
ALTER TABLE public.shop_defaults
  ADD COLUMN IF NOT EXISTS round_up_threshold_days integer;

UPDATE public.shop_defaults
SET round_up_threshold_days = COALESCE(round_up_threshold_days, 24)
WHERE id = 1;

ALTER TABLE public.shop_defaults
  ALTER COLUMN round_up_threshold_days SET DEFAULT 24,
  ALTER COLUMN round_up_threshold_days SET NOT NULL;

ALTER TABLE public.shop_defaults
  DROP CONSTRAINT IF EXISTS shop_defaults_round_up_threshold_days_chk;
ALTER TABLE public.shop_defaults
  ADD CONSTRAINT shop_defaults_round_up_threshold_days_chk
  CHECK (round_up_threshold_days >= 1 AND round_up_threshold_days <= 30);

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS round_up_threshold_days integer;

UPDATE public.loans
SET round_up_threshold_days = 24
WHERE round_up_threshold_days IS NULL;

ALTER TABLE public.loans
  ALTER COLUMN round_up_threshold_days SET DEFAULT 24,
  ALTER COLUMN round_up_threshold_days SET NOT NULL;

ALTER TABLE public.loans
  DROP CONSTRAINT IF EXISTS loans_round_up_threshold_days_chk;
ALTER TABLE public.loans
  ADD CONSTRAINT loans_round_up_threshold_days_chk
  CHECK (round_up_threshold_days >= 1 AND round_up_threshold_days <= 30);

-- New loans default to the owner's chosen mode. Existing rows are untouched.
ALTER TABLE public.shop_defaults
  ALTER COLUMN partial_period_mode
  SET DEFAULT 'min_month_then_pro_rata'::public.partial_period_mode;

ALTER TABLE public.loans
  ALTER COLUMN partial_period_mode
  SET DEFAULT 'min_month_then_pro_rata'::public.partial_period_mode;

UPDATE public.shop_defaults
SET partial_period_mode = 'min_month_then_pro_rata'::public.partial_period_mode
WHERE id = 1;

-- ---------------------------------------------------------------------------
-- 2. The new term is owner-editable and audited like every other term
-- ---------------------------------------------------------------------------
ALTER TABLE public.loan_term_changes
  DROP CONSTRAINT IF EXISTS loan_term_changes_field_chk;
ALTER TABLE public.loan_term_changes
  ADD CONSTRAINT loan_term_changes_field_chk CHECK (
    field IN (
      'interest_model',
      'rate_bps',
      'simple_period_days',
      'compound_every_days',
      'grace_days',
      'partial_period_mode',
      'round_up_threshold_days'
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_loan_mutation_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT public.is_owner() THEN
      RAISE EXCEPTION 'only owner may delete loans';
    END IF;
    RETURN OLD;
  END IF;

  IF public.is_owner() THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_shop_user() THEN
    RAISE EXCEPTION 'not allowed to mutate loans';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'closed' THEN
    RAISE EXCEPTION 'staff may not close or redeem loans';
  END IF;

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

-- ---------------------------------------------------------------------------
-- 3. Span maths. The 6-argument form is authoritative; the original
--    5-argument form stays as a wrapper so existing callers keep working.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.simple_span_interest_paise(
  p_principal bigint,
  p_rate_bps integer,
  p_days integer,
  p_period_days integer,
  p_mode public.partial_period_mode,
  p_round_up_threshold_days integer
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_complete integer;
  v_remainder integer;
  v_period bigint;
BEGIN
  IF p_days <= 0 OR p_principal <= 0 THEN
    RETURN 0;
  END IF;

  v_complete := p_days / p_period_days;
  v_remainder := p_days % p_period_days;
  v_period := public.period_interest_paise(p_principal, p_rate_bps);

  IF p_mode = 'full_period'::public.partial_period_mode THEN
    RETURN (v_complete + CASE WHEN v_remainder > 0 THEN 1 ELSE 0 END) * v_period;
  END IF;

  IF p_mode = 'min_month_then_pro_rata'::public.partial_period_mode THEN
    -- A trailing remainder at or past the threshold is charged as a whole
    -- month; anything shorter is charged per day. The first-month minimum is
    -- NOT applied here -- it is a loan-level floor, applied by
    -- simple_phase_interest_paise, so it does not re-trigger on every
    -- post-capitalization window.
    IF v_remainder >= p_round_up_threshold_days THEN
      RETURN (v_complete + 1) * v_period;
    END IF;
    RETURN v_complete * v_period
      + public.pro_rata_interest_paise(p_principal, p_rate_bps, v_remainder);
  END IF;

  -- pro_rata
  RETURN v_complete * v_period
    + public.pro_rata_interest_paise(p_principal, p_rate_bps, v_remainder);
END;
$$;

CREATE OR REPLACE FUNCTION public.simple_span_interest_paise(
  p_principal bigint,
  p_rate_bps integer,
  p_days integer,
  p_period_days integer,
  p_mode public.partial_period_mode
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.simple_span_interest_paise(
    p_principal, p_rate_bps, p_days, p_period_days, p_mode, 24
  );
$$;

-- Interest for the pre-capitalization phase, where the once-per-loan
-- "first month is always charged in full" floor applies. The floor belongs to
-- 'min_month_then_pro_rata' only: 'full_period' already charges a whole month
-- for any elapsed day, and 'pro_rata' means strictly per-day by definition.
CREATE OR REPLACE FUNCTION public.simple_phase_interest_paise(
  p_principal bigint,
  p_rate_bps integer,
  p_days integer,
  p_period_days integer,
  p_mode public.partial_period_mode,
  p_round_up_threshold_days integer
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_days <= 0 OR p_principal <= 0 THEN 0::bigint
    WHEN p_mode = 'min_month_then_pro_rata'::public.partial_period_mode THEN
      GREATEST(
        public.period_interest_paise(p_principal, p_rate_bps),
        public.simple_span_interest_paise(
          p_principal, p_rate_bps, p_days, p_period_days, p_mode,
          p_round_up_threshold_days
        )
      )
    ELSE
      public.simple_span_interest_paise(
        p_principal, p_rate_bps, p_days, p_period_days, p_mode,
        p_round_up_threshold_days
      )
  END;
$$;

-- ---------------------------------------------------------------------------
-- 4. The engine, rebuilt on a fixed month grid.
--
-- The loan's life is a sequence of windows that never move:
--   [pledge, pledge+180)  simple phase, one capitalization at the end
--   [pledge+180, +30), [+30, +60), ...  compound windows
-- Interest is recognised as the window progresses, and at each window close the
-- part still unpaid capitalizes into principal. A payment reduces what is owed;
-- it never moves a window boundary and never un-charges interest.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.compute_loan_balances(
  bigint, integer, date, date, public.interest_model,
  integer, integer, integer, public.partial_period_mode, jsonb
);

CREATE FUNCTION public.compute_loan_balances(
  p_principal_paise bigint,
  p_rate_bps integer,
  p_disbursed_on date,
  p_as_of date,
  p_interest_model public.interest_model,
  p_simple_period_days integer,
  p_compound_every_days integer,
  p_grace_days integer,
  p_partial_period_mode public.partial_period_mode,
  p_payments jsonb DEFAULT '[]'::jsonb,
  p_round_up_threshold_days integer DEFAULT 24
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
  v_owed bigint := 0;           -- interest charged and not yet paid
  v_win_charged bigint := 0;    -- gross interest recognised for the open window
  v_interest_paid bigint := 0;
  v_principal_paid bigint := 0;
  v_refunded bigint := 0;
  v_anchor date := p_disbursed_on;
  v_win_len integer := p_simple_period_days;
  v_simple_phase boolean := true;
  v_window_end date;
  v_target bigint;
  v_full bigint;
  v_pay jsonb;
  v_pay_on date;
  v_pay_amt bigint;
  v_to_interest bigint;
  v_to_principal bigint;
  v_payments jsonb;
BEGIN
  IF p_grace_days <> 0 THEN
    NULL; -- reserved; RULES fix grace at 0
  END IF;

  IF p_as_of < p_disbursed_on THEN
    RAISE EXCEPTION 'as_of (%) before disbursed_on (%)', p_as_of, p_disbursed_on;
  END IF;

  v_payments := COALESCE(p_payments, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object('paid_on', p_as_of::text, 'amount_paise', 0, 'is_as_of', true)
  );

  FOR v_pay IN
    SELECT value
    FROM jsonb_array_elements(v_payments) AS t(value)
    ORDER BY (value->>'paid_on')::date ASC,
             COALESCE((value->>'is_as_of')::boolean, false) ASC
  LOOP
    v_pay_on := (v_pay->>'paid_on')::date;
    v_pay_amt := COALESCE((v_pay->>'amount_paise')::bigint, 0);

    IF v_pay_on < p_disbursed_on OR v_pay_on > p_as_of THEN
      CONTINUE;
    END IF;

    IF p_interest_model = 'merchant'::public.interest_model THEN
      -- Simple per-day from the pledge date, forever. Never compounds, and no
      -- first-month minimum (docs/RULES.md, Merchant model).
      v_target := public.pro_rata_interest_paise(
        v_principal, p_rate_bps, v_pay_on - v_anchor
      );
      IF v_target > v_win_charged THEN
        v_owed := v_owed + (v_target - v_win_charged);
        v_win_charged := v_target;
      END IF;

    ELSE
      -- Close every window that ended on or before this date.
      LOOP
        v_window_end := v_anchor + v_win_len;
        EXIT WHEN v_pay_on < v_window_end;

        IF v_simple_phase THEN
          v_full := public.simple_phase_interest_paise(
            v_principal, p_rate_bps, v_win_len,
            p_compound_every_days, p_partial_period_mode, p_round_up_threshold_days
          );
        ELSE
          v_full := public.period_interest_paise(v_principal, p_rate_bps);
        END IF;

        IF v_full > v_win_charged THEN
          v_owed := v_owed + (v_full - v_win_charged);
        END IF;

        -- RULES: unpaid accrued interest CAPITALIZES into principal.
        v_principal := v_principal + v_owed;
        v_owed := 0;
        v_win_charged := 0;
        v_anchor := v_window_end;
        v_simple_phase := false;
        v_win_len := p_compound_every_days;
      END LOOP;

      -- Recognise progress inside the still-open window. Comparing against
      -- v_win_charged means interest already charged is never withdrawn, even
      -- if a principal payment lowered the balance mid-window.
      IF v_simple_phase THEN
        v_target := public.simple_phase_interest_paise(
          v_principal, p_rate_bps, v_pay_on - v_anchor,
          p_compound_every_days, p_partial_period_mode, p_round_up_threshold_days
        );
      ELSE
        v_target := public.simple_span_interest_paise(
          v_principal, p_rate_bps, v_pay_on - v_anchor,
          p_compound_every_days, p_partial_period_mode, p_round_up_threshold_days
        );
      END IF;

      IF v_target > v_win_charged THEN
        v_owed := v_owed + (v_target - v_win_charged);
        v_win_charged := v_target;
      END IF;
    END IF;

    IF v_pay_amt > 0 THEN
      v_to_interest := LEAST(v_pay_amt, v_owed);
      v_owed := v_owed - v_to_interest;
      v_interest_paid := v_interest_paid + v_to_interest;
      v_pay_amt := v_pay_amt - v_to_interest;

      v_to_principal := LEAST(v_pay_amt, v_principal);
      v_principal := v_principal - v_to_principal;
      v_principal_paid := v_principal_paid + v_to_principal;
      v_pay_amt := v_pay_amt - v_to_principal;

      IF v_pay_amt > 0 THEN
        v_refunded := v_refunded + v_pay_amt;
      END IF;

      -- The retail month grid is fixed to the pledge date and never moves.
      -- Merchant interest, however, is per-day on the balance actually held, so
      -- reducing principal starts a new accrual segment. An interest-only
      -- payment must not move it, or Defect B comes back for merchant loans.
      IF p_interest_model = 'merchant'::public.interest_model AND v_to_principal > 0 THEN
        v_anchor := v_pay_on;
        v_win_charged := 0;
      END IF;
    END IF;
  END LOOP;

  accrued_interest_paise := v_owed;
  outstanding_principal_paise := v_principal;
  total_due_paise := v_principal + v_owed;
  interest_paid_paise := v_interest_paid;
  principal_paid_paise := v_principal_paid;
  overpayment_refunded_paise := v_refunded;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. The RPC must pass the loan's own frozen threshold
-- ---------------------------------------------------------------------------
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
    v_payments,
    v_loan.round_up_threshold_days
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.simple_span_interest_paise(
  bigint, integer, integer, integer, public.partial_period_mode, integer
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.simple_phase_interest_paise(
  bigint, integer, integer, integer, public.partial_period_mode, integer
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_loan_balances(
  bigint, integer, date, date, public.interest_model,
  integer, integer, integer, public.partial_period_mode, jsonb, integer
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.loan_balances_as_of(uuid, date) TO authenticated, service_role;
