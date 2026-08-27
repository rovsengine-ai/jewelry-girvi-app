-- Stage 6.1: pledged items are gold or silver.
--
-- metal is nullable so historic loan_items rows stay valid. New loans must
-- send metal through create_loan — there is no DEFAULT 'gold'.

ALTER TABLE public.loan_items
  ADD COLUMN IF NOT EXISTS metal text;

ALTER TABLE public.loan_items
  DROP CONSTRAINT IF EXISTS loan_items_metal_chk;

ALTER TABLE public.loan_items
  ADD CONSTRAINT loan_items_metal_chk
  CHECK (metal IS NULL OR metal IN ('gold', 'silver'));

COMMENT ON COLUMN public.loan_items.metal IS
  'gold or silver. NULL only on rows that predate this column. create_loan requires it.';

-- Same RPC shape as 20260815070000 (jsonb items array). metal is now required
-- on every element so Stage 6.1 does not invent a second create-loan signature.
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
  v_metal text;
  v_purity smallint;
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
      v_ornament,
      NULLIF(btrim(COALESCE(v_item->>'description', '')), ''),
      v_metal,
      (v_item->>'gross_weight_mg')::bigint,
      (v_item->>'net_weight_mg')::bigint,
      v_purity,
      COALESCE(NULLIF(v_item->>'stone_deduction_mg', '')::bigint, 0),
      COALESCE(NULLIF(v_item->>'quantity', '')::smallint, 1)
    );
  END LOOP;

  RETURN v_loan_id;
END;
$$;
