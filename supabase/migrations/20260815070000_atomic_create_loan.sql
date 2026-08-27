-- =============================================================================
-- Defect C: create the loan and its pledged items in one transaction, and
-- refuse to redeem a loan that has no loan_items rows.
--
-- createLoanWithCustomer used to INSERT loans and then a separate loan_items
-- row. If the second call failed, redeem_loan saw v_required = '{}' and an
-- empty checklist passed. The RPC accepts an array of items so Stage 6.1 can
-- send more than one ornament without a second create-loan shape.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_loan(
  p_customer_id uuid,
  p_serial_number text,
  p_receipt_image_url text,
  p_principal_paise bigint,
  p_rate_bps integer,
  p_disbursed_on date,
  p_interest_model public.interest_model,
  p_digital_signature_url text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_defaults public.shop_defaults%ROWTYPE;
  v_loan_id uuid;
  v_serial text;
  v_first jsonb;
  v_item jsonb;
  v_item_name text;
  v_gross bigint;
  v_ornament text;
BEGIN
  IF NOT public.is_shop_user() THEN
    RAISE EXCEPTION 'shop_only: only shop users may create a loan';
  END IF;

  v_serial := btrim(COALESCE(p_serial_number, ''));
  IF v_serial = '' THEN
    RAISE EXCEPTION 'serial_number is required';
  END IF;

  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_customer_id) THEN
    RAISE EXCEPTION 'customer not found: %', p_customer_id;
  END IF;

  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'items_required: create_loan needs at least one pledged item';
  END IF;

  SELECT * INTO v_defaults
  FROM public.shop_defaults
  WHERE id = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'shop_defaults row missing';
  END IF;

  v_first := p_items -> 0;
  IF v_first IS NULL OR jsonb_typeof(v_first) <> 'object' THEN
    RAISE EXCEPTION 'items_invalid: each item must be a JSON object';
  END IF;

  v_item_name := btrim(COALESCE(v_first->>'ornament_type', ''));
  IF v_item_name = '' THEN
    RAISE EXCEPTION 'items_invalid: ornament_type is required';
  END IF;

  BEGIN
    v_gross := (v_first->>'gross_weight_mg')::bigint;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'items_invalid: gross_weight_mg must be an integer milligram count';
  END;

  IF v_gross IS NULL OR v_gross <= 0 THEN
    RAISE EXCEPTION 'items_invalid: gross_weight_mg must be a positive milligram count';
  END IF;

  INSERT INTO public.loans (
    customer_id,
    serial_number,
    receipt_image_url,
    item_name,
    weight_grams,
    principal_paise,
    rate_bps,
    disbursed_on,
    interest_model,
    simple_period_days,
    compound_every_days,
    grace_days,
    partial_period_mode,
    round_up_threshold_days,
    status,
    digital_signature_url
  ) VALUES (
    p_customer_id,
    v_serial,
    p_receipt_image_url,
    v_item_name,
    (v_gross::numeric / 1000),
    p_principal_paise,
    p_rate_bps,
    p_disbursed_on,
    p_interest_model,
    v_defaults.simple_period_days,
    v_defaults.compound_every_days,
    v_defaults.grace_days,
    v_defaults.partial_period_mode,
    v_defaults.round_up_threshold_days,
    'active'::public.loan_status,
    p_digital_signature_url
  )
  RETURNING id INTO v_loan_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'items_invalid: each item must be a JSON object';
    END IF;

    v_ornament := btrim(COALESCE(v_item->>'ornament_type', ''));
    IF v_ornament = '' THEN
      RAISE EXCEPTION 'items_invalid: ornament_type is required';
    END IF;

    INSERT INTO public.loan_items (
      loan_id,
      ornament_type,
      description,
      gross_weight_mg,
      net_weight_mg,
      purity_karat,
      stone_deduction_mg,
      quantity
    ) VALUES (
      v_loan_id,
      v_ornament,
      NULLIF(btrim(COALESCE(v_item->>'description', '')), ''),
      (v_item->>'gross_weight_mg')::bigint,
      (v_item->>'net_weight_mg')::bigint,
      NULLIF(v_item->>'purity_karat', '')::smallint,
      COALESCE(NULLIF(v_item->>'stone_deduction_mg', '')::bigint, 0),
      COALESCE(NULLIF(v_item->>'quantity', '')::smallint, 1)
    );
  END LOOP;

  RETURN v_loan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_loan(
  uuid, text, text, bigint, integer, date, public.interest_model, text, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_loan(
  uuid, text, text, bigint, integer, date, public.interest_model, text, jsonb
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- redeem_loan: same as 20260815040000, plus refuse an empty pledged-item set.
-- '{}' matching '{}' used to pass; a loan with no items cannot be redeemed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_loan(
  p_loan_id uuid,
  p_redeemed_on date,
  p_released_to_name text,
  p_item_ids uuid[],
  p_final_payment_paise bigint DEFAULT 0,
  p_release_note text DEFAULT NULL,
  p_release_signature_url text DEFAULT NULL
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
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'owner_only: only the owner may redeem a loan';
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
  RETURN NEXT;
END;
$$;
