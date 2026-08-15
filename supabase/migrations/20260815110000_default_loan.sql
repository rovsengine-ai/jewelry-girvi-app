-- =============================================================================
-- default_loan: owner-only forfeiture. The schema, RULES, notice generator,
-- and dashboard filter all agree a loan can be `defaulted`; nothing wrote it.
--
-- Mirrors redeem_loan: row lock, status re-check, immutable balance snapshot,
-- idempotent second call. Overdue-ness is decided only by loans_overdue_as_of.
-- Forfeiture eligibility is 6 calendar months after disbursed_on (RULES).
-- =============================================================================

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS defaulted_on date,
  ADD COLUMN IF NOT EXISTS defaulted_by uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS default_balance_paise bigint,
  ADD COLUMN IF NOT EXISTS default_reason text;

COMMENT ON COLUMN public.loans.default_balance_paise IS
  'Total due at the moment of forfeiture. Immutable audit figure: a later rate '
  'or term edit must never be able to rewrite what was owed when the loan defaulted.';

ALTER TABLE public.loans
  DROP CONSTRAINT IF EXISTS loans_default_balance_chk;
ALTER TABLE public.loans
  ADD CONSTRAINT loans_default_balance_chk
  CHECK (default_balance_paise IS NULL OR default_balance_paise >= 0);

ALTER TABLE public.loans
  DROP CONSTRAINT IF EXISTS loans_defaulted_audit_chk;
ALTER TABLE public.loans
  ADD CONSTRAINT loans_defaulted_audit_chk CHECK (
    status <> 'defaulted'::public.loan_status
    OR (
      defaulted_on IS NOT NULL
      AND defaulted_by IS NOT NULL
      AND default_balance_paise IS NOT NULL
      AND default_reason IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_loan_mutation_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.default_loan(
  p_loan_id uuid,
  p_defaulted_on date,
  p_reason text
)
RETURNS TABLE (
  loan_id uuid,
  status public.loan_status,
  defaulted_on date,
  defaulted_by uuid,
  default_balance_paise bigint,
  already_defaulted boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_loan public.loans%ROWTYPE;
  v_reason text;
  v_due bigint;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'owner_only: only the owner may default a loan';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'default_reason is required';
  END IF;

  IF p_defaulted_on IS NULL THEN
    RAISE EXCEPTION 'defaulted_on is required';
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'loan not found: %', p_loan_id;
  END IF;

  IF v_loan.status = 'defaulted'::public.loan_status THEN
    loan_id := v_loan.id;
    status := v_loan.status;
    defaulted_on := v_loan.defaulted_on;
    defaulted_by := v_loan.defaulted_by;
    default_balance_paise := v_loan.default_balance_paise;
    already_defaulted := true;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_loan.status <> 'active'::public.loan_status THEN
    RAISE EXCEPTION 'cannot default a loan that is not active (status=%)', v_loan.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.loans_overdue_as_of(p_defaulted_on) o
    WHERE o.loan_id = p_loan_id
  ) THEN
    RAISE EXCEPTION 'not_overdue: loan is not overdue as of %', p_defaulted_on;
  END IF;

  IF p_defaulted_on < (v_loan.disbursed_on + INTERVAL '6 months')::date THEN
    RAISE EXCEPTION 'forfeiture_too_early: defaulted_on must be at least 6 months after disbursed_on';
  END IF;

  SELECT b.total_due_paise
  INTO v_due
  FROM public.loan_balances_as_of(p_loan_id, p_defaulted_on) b;

  IF v_due IS NULL THEN
    RAISE EXCEPTION 'balance_missing: loan_balances_as_of returned no row';
  END IF;

  UPDATE public.loans
  SET
    status = 'defaulted'::public.loan_status,
    defaulted_on = p_defaulted_on,
    defaulted_by = auth.uid(),
    default_balance_paise = v_due,
    default_reason = v_reason
  WHERE id = p_loan_id
  RETURNING * INTO v_loan;

  loan_id := v_loan.id;
  status := v_loan.status;
  defaulted_on := v_loan.defaulted_on;
  defaulted_by := v_loan.defaulted_by;
  default_balance_paise := v_loan.default_balance_paise;
  already_defaulted := false;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.default_loan(uuid, date, text)
  TO authenticated, service_role;
