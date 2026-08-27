-- =============================================================================
-- edit_loan_terms: owner-only atomic write of frozen terms + loan_term_changes.
-- Staff are refused. No term edit can occur without a matching audit row.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.edit_loan_terms(
  p_loan_id uuid,
  p_rate_bps integer,
  p_interest_model public.interest_model,
  p_simple_period_days integer,
  p_compound_every_days integer,
  p_grace_days integer,
  p_partial_period_mode public.partial_period_mode,
  p_round_up_threshold_days integer,
  p_reason text
)
RETURNS TABLE (
  loan_id uuid,
  change_count integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_loan public.loans%ROWTYPE;
  v_reason text;
  v_count integer := 0;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'owner_only: only the owner may edit loan terms';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'term_change_reason is required';
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'loan not found: %', p_loan_id;
  END IF;

  IF v_loan.rate_bps IS DISTINCT FROM p_rate_bps THEN
    INSERT INTO public.loan_term_changes (
      loan_id, changed_by, field, old_value, new_value, reason
    ) VALUES (
      p_loan_id, auth.uid(), 'rate_bps', v_loan.rate_bps::text, p_rate_bps::text, v_reason
    );
    v_count := v_count + 1;
  END IF;

  IF v_loan.interest_model IS DISTINCT FROM p_interest_model THEN
    INSERT INTO public.loan_term_changes (
      loan_id, changed_by, field, old_value, new_value, reason
    ) VALUES (
      p_loan_id, auth.uid(), 'interest_model', v_loan.interest_model::text, p_interest_model::text, v_reason
    );
    v_count := v_count + 1;
  END IF;

  IF v_loan.simple_period_days IS DISTINCT FROM p_simple_period_days THEN
    INSERT INTO public.loan_term_changes (
      loan_id, changed_by, field, old_value, new_value, reason
    ) VALUES (
      p_loan_id, auth.uid(), 'simple_period_days',
      v_loan.simple_period_days::text, p_simple_period_days::text, v_reason
    );
    v_count := v_count + 1;
  END IF;

  IF v_loan.compound_every_days IS DISTINCT FROM p_compound_every_days THEN
    INSERT INTO public.loan_term_changes (
      loan_id, changed_by, field, old_value, new_value, reason
    ) VALUES (
      p_loan_id, auth.uid(), 'compound_every_days',
      v_loan.compound_every_days::text, p_compound_every_days::text, v_reason
    );
    v_count := v_count + 1;
  END IF;

  IF v_loan.grace_days IS DISTINCT FROM p_grace_days THEN
    INSERT INTO public.loan_term_changes (
      loan_id, changed_by, field, old_value, new_value, reason
    ) VALUES (
      p_loan_id, auth.uid(), 'grace_days', v_loan.grace_days::text, p_grace_days::text, v_reason
    );
    v_count := v_count + 1;
  END IF;

  IF v_loan.partial_period_mode IS DISTINCT FROM p_partial_period_mode THEN
    INSERT INTO public.loan_term_changes (
      loan_id, changed_by, field, old_value, new_value, reason
    ) VALUES (
      p_loan_id, auth.uid(), 'partial_period_mode',
      v_loan.partial_period_mode::text, p_partial_period_mode::text, v_reason
    );
    v_count := v_count + 1;
  END IF;

  IF v_loan.round_up_threshold_days IS DISTINCT FROM p_round_up_threshold_days THEN
    INSERT INTO public.loan_term_changes (
      loan_id, changed_by, field, old_value, new_value, reason
    ) VALUES (
      p_loan_id, auth.uid(), 'round_up_threshold_days',
      v_loan.round_up_threshold_days::text, p_round_up_threshold_days::text, v_reason
    );
    v_count := v_count + 1;
  END IF;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'no_term_change: nothing to update';
  END IF;

  UPDATE public.loans
  SET
    rate_bps = p_rate_bps,
    interest_model = p_interest_model,
    simple_period_days = p_simple_period_days,
    compound_every_days = p_compound_every_days,
    grace_days = p_grace_days,
    partial_period_mode = p_partial_period_mode,
    round_up_threshold_days = p_round_up_threshold_days
  WHERE id = p_loan_id;

  loan_id := p_loan_id;
  change_count := v_count;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_loan_terms(
  uuid,
  integer,
  public.interest_model,
  integer,
  integer,
  integer,
  public.partial_period_mode,
  integer,
  text
) TO authenticated, service_role;
