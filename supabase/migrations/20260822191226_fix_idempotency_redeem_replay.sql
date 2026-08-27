-- Restore empty-item checklist on redeem_loan and mark idempotent
-- redeem/renew replays as already_redeemed / already_renewed.

-- ---------------------------------------------------------------------------
-- redeem_loan (+ optional p_idempotency_key)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.redeem_loan(uuid, date, text, uuid[], bigint, text, text, uuid);

CREATE OR REPLACE FUNCTION public.redeem_loan(
  p_loan_id uuid,
  p_redeemed_on date,
  p_released_to_name text,
  p_item_ids uuid[],
  p_final_payment_paise bigint DEFAULT 0,
  p_release_note text DEFAULT NULL,
  p_release_signature_url text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS TABLE (
  loan_id uuid,
  status public.loan_status,
  redeemed_on date,
  redeemed_by uuid,
  closure_balance_paise bigint,
  already_redeemed boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_loan public.loans%ROWTYPE;
  v_required uuid[];
  v_given uuid[];
  v_due bigint;
  v_principal bigint;
  v_accrued bigint;
  v_name text;
  v_cached jsonb;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'owner_only: only the owner may redeem a loan';
  END IF;

  v_cached := public.claim_mutation_idempotency(p_idempotency_key, 'redeem_loan');
  IF v_cached IS NOT NULL THEN
    loan_id := (v_cached->>'loan_id')::uuid;
    status := (v_cached->>'status')::public.loan_status;
    redeemed_on := (v_cached->>'redeemed_on')::date;
    redeemed_by := (v_cached->>'redeemed_by')::uuid;
    closure_balance_paise := (v_cached->>'closure_balance_paise')::bigint;
    -- Replay after a successful redeem is always "already done".
    already_redeemed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  v_name := btrim(COALESCE(p_released_to_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'released_to_name is required';
  END IF;

  IF p_final_payment_paise IS NULL OR p_final_payment_paise < 0 THEN
    RAISE EXCEPTION 'final payment cannot be negative';
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'loan not found: %', p_loan_id;
  END IF;

  IF v_loan.status = 'redeemed'::public.loan_status THEN
    loan_id := v_loan.id;
    status := v_loan.status;
    redeemed_on := v_loan.redeemed_on;
    redeemed_by := v_loan.redeemed_by;
    closure_balance_paise := v_loan.closure_balance_paise;
    already_redeemed := true;
    PERFORM public.store_mutation_idempotency(
      p_idempotency_key,
      jsonb_build_object(
        'loan_id', loan_id,
        'status', status,
        'redeemed_on', redeemed_on,
        'redeemed_by', redeemed_by,
        'closure_balance_paise', closure_balance_paise,
        'already_redeemed', true
      )
    );
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_loan.status <> 'active'::public.loan_status THEN
    RAISE EXCEPTION 'cannot redeem a loan that is not active (status=%)', v_loan.status;
  END IF;

  SELECT COALESCE(array_agg(i.id ORDER BY i.id), ARRAY[]::uuid[])
  INTO v_required
  FROM public.loan_items i
  WHERE i.loan_id = p_loan_id;

  IF cardinality(v_required) = 0 THEN
    RAISE EXCEPTION 'item_checklist: loan has no pledged items; cannot redeem';
  END IF;

  SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::uuid[])
  INTO v_given
  FROM unnest(COALESCE(p_item_ids, ARRAY[]::uuid[])) AS x;

  IF v_required IS DISTINCT FROM v_given THEN
    RAISE EXCEPTION 'item_checklist: every pledged item must be checked, and only those items';
  END IF;

  SELECT b.total_due_paise, b.outstanding_principal_paise, b.accrued_interest_paise
  INTO v_due, v_principal, v_accrued
  FROM public.loan_balances_as_of(p_loan_id, p_redeemed_on) b;

  IF p_final_payment_paise > 0 THEN
    INSERT INTO public.payments (loan_id, amount_paid_paise, paid_on)
    VALUES (p_loan_id, p_final_payment_paise, p_redeemed_on);
  END IF;

  SELECT b.outstanding_principal_paise, b.accrued_interest_paise
  INTO v_principal, v_accrued
  FROM public.loan_balances_as_of(p_loan_id, p_redeemed_on) b;

  IF v_principal > 0 OR v_accrued > 0 THEN
    RAISE EXCEPTION 'balance_remaining: loan still has % paise principal and % paise interest due',
      v_principal, v_accrued;
  END IF;

  UPDATE public.loans
  SET
    status = 'redeemed'::public.loan_status,
    redeemed_on = p_redeemed_on,
    redeemed_by = auth.uid(),
    released_to_name = v_name,
    release_note = p_release_note,
    closure_balance_paise = v_due,
    release_signature_url = p_release_signature_url
  WHERE id = p_loan_id
  RETURNING * INTO v_loan;

  loan_id := v_loan.id;
  status := v_loan.status;
  redeemed_on := v_loan.redeemed_on;
  redeemed_by := v_loan.redeemed_by;
  closure_balance_paise := v_loan.closure_balance_paise;
  already_redeemed := false;

  PERFORM public.store_mutation_idempotency(
    p_idempotency_key,
    jsonb_build_object(
      'loan_id', loan_id,
      'status', status,
      'redeemed_on', redeemed_on,
      'redeemed_by', redeemed_by,
      'closure_balance_paise', closure_balance_paise,
      'already_redeemed', false
    )
  );

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_loan(uuid, date, text, uuid[], bigint, text, text, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_loan(uuid, date, text, uuid[], bigint, text, text, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- renew_loan (+ optional p_idempotency_key)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.renew_loan(uuid, date, bigint, date, text, uuid);

CREATE OR REPLACE FUNCTION public.renew_loan(
  p_loan_id uuid,
  p_renewed_on date,
  p_interest_paid_paise bigint,
  p_new_maturity_on date,
  p_note text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS TABLE (
  renewal_id uuid,
  loan_id uuid,
  renewed_on date,
  interest_paid_paise bigint,
  new_maturity_on date,
  already_renewed boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_loan public.loans%ROWTYPE;
  v_existing public.loan_renewals%ROWTYPE;
  v_accrued bigint;
  v_due_on date;
  v_cached jsonb;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'owner_only: only the owner may renew a loan';
  END IF;

  v_cached := public.claim_mutation_idempotency(p_idempotency_key, 'renew_loan');
  IF v_cached IS NOT NULL THEN
    renewal_id := (v_cached->>'renewal_id')::uuid;
    loan_id := (v_cached->>'loan_id')::uuid;
    renewed_on := (v_cached->>'renewed_on')::date;
    interest_paid_paise := (v_cached->>'interest_paid_paise')::bigint;
    new_maturity_on := (v_cached->>'new_maturity_on')::date;
    already_renewed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_interest_paid_paise IS NULL OR p_interest_paid_paise < 0 THEN
    RAISE EXCEPTION 'interest payment cannot be negative';
  END IF;

  IF p_new_maturity_on <= p_renewed_on THEN
    RAISE EXCEPTION 'new maturity must be after the renewal date';
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'loan not found: %', p_loan_id;
  END IF;

  IF v_loan.status <> 'active'::public.loan_status THEN
    RAISE EXCEPTION 'cannot renew a loan that is not active (status=%)', v_loan.status;
  END IF;

  SELECT r.* INTO v_existing
  FROM public.loan_renewals r
  WHERE r.loan_id = p_loan_id AND r.renewed_on = p_renewed_on;

  IF FOUND THEN
    renewal_id := v_existing.id;
    loan_id := v_existing.loan_id;
    renewed_on := v_existing.renewed_on;
    interest_paid_paise := v_existing.interest_paid_paise;
    new_maturity_on := v_existing.new_maturity_on;
    already_renewed := true;
    PERFORM public.store_mutation_idempotency(
      p_idempotency_key,
      jsonb_build_object(
        'renewal_id', renewal_id,
        'loan_id', loan_id,
        'renewed_on', renewed_on,
        'interest_paid_paise', interest_paid_paise,
        'new_maturity_on', new_maturity_on,
        'already_renewed', true
      )
    );
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COALESCE(
    (
      SELECT r.new_maturity_on
      FROM public.loan_renewals r
      WHERE r.loan_id = p_loan_id
      ORDER BY r.renewed_on DESC, r.created_at DESC
      LIMIT 1
    ),
    (v_loan.disbursed_on + v_loan.simple_period_days)::date
  )
  INTO v_due_on;

  IF p_renewed_on <= v_due_on THEN
    RAISE EXCEPTION 'renewal is only offered after the simple period (due %)', v_due_on;
  END IF;

  SELECT b.accrued_interest_paise
  INTO v_accrued
  FROM public.loan_balances_as_of(p_loan_id, p_renewed_on) b;

  IF p_interest_paid_paise IS DISTINCT FROM v_accrued THEN
    RAISE EXCEPTION 'interest_only: payment must equal accrued interest (% paise), not %',
      v_accrued, p_interest_paid_paise;
  END IF;

  IF p_interest_paid_paise > 0 THEN
    INSERT INTO public.payments (loan_id, amount_paid_paise, paid_on)
    VALUES (p_loan_id, p_interest_paid_paise, p_renewed_on);
  END IF;

  INSERT INTO public.loan_renewals (
    loan_id, renewed_on, renewed_by, interest_paid_paise, new_maturity_on, note
  ) VALUES (
    p_loan_id, p_renewed_on, auth.uid(), p_interest_paid_paise, p_new_maturity_on, p_note
  )
  RETURNING * INTO v_existing;

  renewal_id := v_existing.id;
  loan_id := v_existing.loan_id;
  renewed_on := v_existing.renewed_on;
  interest_paid_paise := v_existing.interest_paid_paise;
  new_maturity_on := v_existing.new_maturity_on;
  already_renewed := false;

  PERFORM public.store_mutation_idempotency(
    p_idempotency_key,
    jsonb_build_object(
      'renewal_id', renewal_id,
      'loan_id', loan_id,
      'renewed_on', renewed_on,
      'interest_paid_paise', interest_paid_paise,
      'new_maturity_on', new_maturity_on,
      'already_renewed', false
    )
  );

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.renew_loan(uuid, date, bigint, date, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renew_loan(uuid, date, bigint, date, text, uuid)
  TO authenticated, service_role;

