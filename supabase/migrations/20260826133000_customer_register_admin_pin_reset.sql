-- =============================================================================
-- Customer self-registration (PIN) + shop-only PIN reset for forgotten PINs.
-- Edge Function customer-session action `register` uses set_customer_pin_for_profile.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- set_customer_pin_for_profile — service_role / Edge only (not client-callable)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_customer_pin_for_profile(
  p_profile_id uuid,
  p_pin text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role public.user_role;
  v_hash text;
BEGIN
  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_id is required';
  END IF;

  SELECT p.role
  INTO v_role
  FROM public.profiles p
  WHERE p.id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found: %', p_profile_id;
  END IF;

  IF v_role IN ('owner', 'staff') THEN
    RAISE EXCEPTION 'forbidden: shop accounts cannot use customer PIN';
  END IF;

  IF public.is_weak_customer_pin(p_pin) THEN
    RAISE EXCEPTION 'weak_pin: PIN must be at least 6 digits and not a simple pattern';
  END IF;

  v_hash := extensions.crypt(btrim(p_pin), extensions.gen_salt('bf'));

  INSERT INTO public.customer_credentials (
    profile_id, pin_hash, pin_set_at, failed_attempts, locked_until
  ) VALUES (
    p_profile_id, v_hash, timezone('utc', now()), 0, NULL
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    pin_hash = EXCLUDED.pin_hash,
    pin_set_at = EXCLUDED.pin_set_at,
    failed_attempts = 0,
    locked_until = NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.set_customer_pin_for_profile(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_customer_pin_for_profile(uuid, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- admin_reset_customer_pin — owner/staff clears PIN so customer can re-register
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reset_customer_pin(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_shop_user() THEN
    RAISE EXCEPTION 'shop_only: only owner or staff may reset a customer PIN';
  END IF;

  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_id is required';
  END IF;

  SELECT p.role
  INTO v_role
  FROM public.profiles p
  WHERE p.id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found: %', p_profile_id;
  END IF;

  IF v_role IN ('owner', 'staff') THEN
    RAISE EXCEPTION 'forbidden: cannot reset PIN for a shop account';
  END IF;

  DELETE FROM public.customer_credentials
  WHERE profile_id = p_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_customer_pin(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.set_customer_pin_for_profile(uuid, text) IS
  'Edge-only. Sets PIN for a customer profile after self-registration or walk-in without PIN.';
COMMENT ON FUNCTION public.admin_reset_customer_pin(uuid) IS
  'Shop-only. Removes stored PIN and lockout so the customer can create a new PIN.';
