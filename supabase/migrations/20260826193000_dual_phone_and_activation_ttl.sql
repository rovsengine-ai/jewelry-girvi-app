-- Allow one customer profile and one shop profile to share the same mobile number.
-- Also extend customer activation QR lifetime and make PIN verification phone-aware.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_phone_number_key;

DROP INDEX IF EXISTS public.profiles_phone_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_number_customer_uidx
  ON public.profiles (phone_number)
  WHERE phone_number IS NOT NULL
    AND role IN ('retail_customer', 'merchant');

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_number_shop_uidx
  ON public.profiles (phone_number)
  WHERE phone_number IS NOT NULL
    AND role IN ('owner', 'staff');

CREATE OR REPLACE FUNCTION public.find_profile_by_phone(p_phone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.profiles
  WHERE phone_number = public.normalize_phone_e164(p_phone)
  ORDER BY
    CASE WHEN role IN ('retail_customer', 'merchant') THEN 0 ELSE 1 END,
    created_at ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.issue_login_token(
  p_profile_id uuid,
  p_loan_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_shop_user() THEN
    RAISE EXCEPTION 'shop_only: only owner or staff may issue a login token';
  END IF;

  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
    RAISE EXCEPTION 'profile not found: %', p_profile_id;
  END IF;

  IF p_loan_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.loans
      WHERE id = p_loan_id
        AND customer_id = p_profile_id
    ) THEN
      RAISE EXCEPTION 'loan does not belong to profile';
    END IF;
  END IF;

  v_token := public.generate_opaque_token(32);

  INSERT INTO public.login_tokens (
    token, profile_id, loan_id, expires_at, created_by
  ) VALUES (
    v_token,
    p_profile_id,
    p_loan_id,
    timezone('utc', now()) + interval '30 minutes',
    auth.uid()
  );

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_customer_pin(
  p_phone text,
  p_pin text
)
RETURNS TABLE (
  ok boolean,
  profile_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_phone text;
  v_now timestamptz := timezone('utc', now());
  v_candidate_count integer := 0;
  v_single_profile_id uuid;
  v_match_profile_id uuid;
BEGIN
  ok := false;
  profile_id := NULL;

  v_phone := public.normalize_phone_e164(p_phone);
  IF v_phone IS NULL OR p_pin IS NULL OR btrim(p_pin) = '' THEN
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT count(*)
  INTO v_candidate_count
  FROM public.customer_credentials c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.phone_number = v_phone;

  IF v_candidate_count = 0 THEN
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT c.profile_id
  INTO v_match_profile_id
  FROM public.customer_credentials c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.phone_number = v_phone
    AND (c.locked_until IS NULL OR c.locked_until <= v_now)
    AND c.pin_hash = extensions.crypt(btrim(p_pin), c.pin_hash)
  ORDER BY CASE WHEN p.role IN ('owner', 'staff') THEN 0 ELSE 1 END, p.created_at ASC
  LIMIT 1;

  IF v_match_profile_id IS NOT NULL THEN
    UPDATE public.customer_credentials
    SET failed_attempts = 0,
        locked_until = NULL
    WHERE customer_credentials.profile_id = v_match_profile_id;

    ok := true;
    profile_id := v_match_profile_id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_candidate_count = 1 THEN
    SELECT c.profile_id
    INTO v_single_profile_id
    FROM public.customer_credentials c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.phone_number = v_phone
    LIMIT 1;

    IF v_single_profile_id IS NOT NULL THEN
      UPDATE public.customer_credentials
      SET
        failed_attempts = customer_credentials.failed_attempts + 1,
        locked_until = CASE
          WHEN customer_credentials.failed_attempts + 1 >= 5
            THEN v_now + interval '15 minutes'
          ELSE NULL
        END
      WHERE customer_credentials.profile_id = v_single_profile_id;
    END IF;
  END IF;

  RETURN NEXT;
END;
$$;
