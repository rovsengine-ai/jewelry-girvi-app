-- Client-driven idempotency for create_loan / redeem_loan / renew_loan / log_payment.
-- A timeout + retry with the same UUID must return the original result and insert nothing.
-- Keys are optional (DEFAULT NULL) so existing call sites and pgTAP keep working.

CREATE TABLE IF NOT EXISTS public.mutation_idempotency (
  key uuid PRIMARY KEY,
  rpc_name text NOT NULL
    CHECK (rpc_name IN ('create_loan', 'redeem_loan', 'renew_loan', 'log_payment')),
  actor_id uuid NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS mutation_idempotency_rpc_created_idx
  ON public.mutation_idempotency (rpc_name, created_at DESC);

ALTER TABLE public.mutation_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mutation_idempotency_own" ON public.mutation_idempotency;
CREATE POLICY "mutation_idempotency_own"
  ON public.mutation_idempotency
  FOR ALL
  TO authenticated
  USING (actor_id = auth.uid())
  WITH CHECK (actor_id = auth.uid());

REVOKE ALL ON TABLE public.mutation_idempotency FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.mutation_idempotency TO authenticated, service_role;

-- Claim the key for this transaction. Returns a completed result jsonb when a
-- prior call already finished; NULL means the caller must proceed (row locked).
CREATE OR REPLACE FUNCTION public.claim_mutation_idempotency(
  p_key uuid,
  p_rpc_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_key IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.mutation_idempotency (key, rpc_name, actor_id, result)
  VALUES (p_key, p_rpc_name, auth.uid(), NULL)
  ON CONFLICT (key) DO NOTHING;

  SELECT m.result INTO v_result
  FROM public.mutation_idempotency m
  WHERE m.key = p_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'idempotency_claim_failed: could not claim key %', p_key;
  END IF;

  IF v_result IS NOT NULL THEN
    IF (
      SELECT m.rpc_name FROM public.mutation_idempotency m WHERE m.key = p_key
    ) IS DISTINCT FROM p_rpc_name THEN
      RAISE EXCEPTION 'idempotency_rpc_mismatch: key % was used for a different RPC', p_key;
    END IF;
    RETURN v_result;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_mutation_idempotency(
  p_key uuid,
  p_result jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_key IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.mutation_idempotency
  SET result = p_result
  WHERE key = p_key
    AND result IS NULL;

  IF NOT FOUND THEN
    -- Concurrent waiter already stored, or claim was skipped — ignore.
    NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mutation_idempotency(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_mutation_idempotency(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_mutation_idempotency(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.store_mutation_idempotency(uuid, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_loan (+ optional p_idempotency_key)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_loan(
  uuid, text, text, bigint, integer, date, public.interest_model, text, jsonb
);

CREATE FUNCTION public.create_loan(
  p_customer_id uuid,
  p_serial_number text,
  p_receipt_image_url text,
  p_principal_paise bigint,
  p_rate_bps integer,
  p_disbursed_on date,
  p_interest_model public.interest_model,
  p_digital_signature_url text,
  p_items jsonb,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS TABLE (
  loan_id uuid,
  item_ids uuid[]
)
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
  v_position smallint;
  v_item_name text;
  v_gross bigint;
  v_ornament text;
  v_metal text;
  v_purity smallint;
  v_item_id uuid;
  v_item_ids uuid[] := ARRAY[]::uuid[];
  v_constraint text;
  v_cached jsonb;
  v_cached_ids uuid[];
BEGIN
  IF NOT public.is_shop_user() THEN
    RAISE EXCEPTION 'shop_only: only shop users may create a loan';
  END IF;

  v_cached := public.claim_mutation_idempotency(p_idempotency_key, 'create_loan');
  IF v_cached IS NOT NULL THEN
    loan_id := (v_cached->>'loan_id')::uuid;
    SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[])
    INTO v_cached_ids
    FROM jsonb_array_elements_text(COALESCE(v_cached->'item_ids', '[]'::jsonb)) AS t(x);
    item_ids := v_cached_ids;
    RETURN NEXT;
    RETURN;
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

  BEGIN
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
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'loans_serial_number_idx' THEN
        RAISE EXCEPTION 'serial_exists: %', v_serial;
      END IF;
      RAISE;
  END;

  FOR v_item, v_position IN
    SELECT t.value, t.ordinality::smallint
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'items_invalid: each item must be a JSON object';
    END IF;

    v_ornament := btrim(COALESCE(v_item->>'ornament_type', ''));
    IF v_ornament = '' THEN
      RAISE EXCEPTION 'items_invalid: ornament_type is required';
    END IF;

    v_metal := btrim(COALESCE(v_item->>'metal', ''));
    IF v_metal NOT IN ('gold', 'silver') THEN
      RAISE EXCEPTION 'items_invalid: metal must be gold or silver';
    END IF;

    IF v_metal = 'silver' THEN
      v_purity := NULL;
    ELSE
      v_purity := NULLIF(v_item->>'purity_karat', '')::smallint;
    END IF;

    INSERT INTO public.loan_items (
      loan_id,
      position,
      ornament_type,
      description,
      metal,
      gross_weight_mg,
      net_weight_mg,
      purity_karat,
      stone_deduction_mg,
      quantity
    ) VALUES (
      v_loan_id,
      v_position,
      v_ornament,
      NULLIF(btrim(COALESCE(v_item->>'description', '')), ''),
      v_metal,
      (v_item->>'gross_weight_mg')::bigint,
      (v_item->>'net_weight_mg')::bigint,
      v_purity,
      COALESCE(NULLIF(v_item->>'stone_deduction_mg', '')::bigint, 0),
      COALESCE(NULLIF(v_item->>'quantity', '')::smallint, 1)
    )
    RETURNING id INTO v_item_id;

    v_item_ids := array_append(v_item_ids, v_item_id);
  END LOOP;

  PERFORM public.store_mutation_idempotency(
    p_idempotency_key,
    jsonb_build_object(
      'loan_id', v_loan_id,
      'item_ids', to_jsonb(v_item_ids)
    )
  );

  loan_id := v_loan_id;
  item_ids := v_item_ids;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_loan(
  uuid, text, text, bigint, integer, date, public.interest_model, text, jsonb, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_loan(
  uuid, text, text, bigint, integer, date, public.interest_model, text, jsonb, uuid
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- redeem_loan (+ optional p_idempotency_key)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.redeem_loan(uuid, date, text, uuid[], bigint, text, text);

CREATE FUNCTION public.redeem_loan(
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
DROP FUNCTION IF EXISTS public.renew_loan(uuid, date, bigint, date, text);

CREATE FUNCTION public.renew_loan(
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

-- ---------------------------------------------------------------------------
-- log_payment: shop insert with required idempotency key
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_payment(
  p_loan_id uuid,
  p_amount_paid_paise bigint,
  p_paid_on date,
  p_idempotency_key uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cached jsonb;
  v_payment_id uuid;
  v_loan public.loans%ROWTYPE;
BEGIN
  IF NOT public.is_shop_user() THEN
    RAISE EXCEPTION 'shop_only: only shop users may record a payment';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required: log_payment needs a client key';
  END IF;

  IF p_amount_paid_paise IS NULL OR p_amount_paid_paise <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero paise.';
  END IF;

  v_cached := public.claim_mutation_idempotency(p_idempotency_key, 'log_payment');
  IF v_cached IS NOT NULL THEN
    RETURN (v_cached->>'payment_id')::uuid;
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'loan not found: %', p_loan_id;
  END IF;

  IF v_loan.status <> 'active'::public.loan_status THEN
    RAISE EXCEPTION 'cannot record a payment on a loan that is not active (status=%)',
      v_loan.status;
  END IF;

  INSERT INTO public.payments (loan_id, amount_paid_paise, paid_on)
  VALUES (p_loan_id, p_amount_paid_paise, p_paid_on)
  RETURNING id INTO v_payment_id;

  PERFORM public.store_mutation_idempotency(
    p_idempotency_key,
    jsonb_build_object('payment_id', v_payment_id)
  );

  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_payment(uuid, bigint, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_payment(uuid, bigint, date, uuid)
  TO authenticated, service_role;

COMMENT ON TABLE public.mutation_idempotency IS
  'Client-generated UUID keys so a timeout + retry cannot double-apply create/redeem/renew/payment.';
