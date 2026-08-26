-- Shop staff/owners sign in with PIN (same customer_credentials table).
-- Bootstrap production owner accounts for initial go-live.

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
  v_hash text;
BEGIN
  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_profile_id) THEN
    RAISE EXCEPTION 'profile not found: %', p_profile_id;
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

COMMENT ON FUNCTION public.set_customer_pin_for_profile(uuid, text) IS
  'Edge-only. Sets PIN for any profile (customer, staff, or owner).';

-- Idempotent bootstrap: two owner phones with shared initial PIN.
DO $$
DECLARE
  v_phones text[] := ARRAY['9415850704', '7860757617'];
  v_names text[] := ARRAY['Shop Owner', 'Shop Owner'};
  v_pin text := '800992';
  v_idx integer;
  v_phone_raw text;
  v_phone_e164 text;
  v_auth_phone text;
  v_user_id uuid;
  v_name text;
BEGIN
  FOR v_idx IN 1..array_length(v_phones, 1) LOOP
    v_phone_raw := v_phones[v_idx];
    v_phone_e164 := public.normalize_phone_e164(v_phone_raw);
    v_auth_phone := ltrim(v_phone_e164, '+');
    v_name := v_names[v_idx];

    SELECT p.id
    INTO v_user_id
    FROM public.profiles p
    WHERE p.phone_number = v_phone_e164;

    IF v_user_id IS NULL THEN
      v_user_id := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        encrypted_password,
        email_confirmed_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change,
        email_change_token_current,
        phone_change,
        phone_change_token,
        reauthentication_token,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        phone,
        phone_confirmed_at,
        is_sso_user,
        is_anonymous
      )
      VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        extensions.crypt('bootstrap-unused', extensions.gen_salt('bf')),
        NULL,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '{"provider":"phone","providers":["phone"]}'::jsonb,
        jsonb_build_object('role', 'owner', 'full_name', v_name),
        timezone('utc', now()),
        timezone('utc', now()),
        v_auth_phone,
        timezone('utc', now()),
        false,
        false
      )
      ON CONFLICT (id) DO UPDATE SET
        phone = EXCLUDED.phone,
        phone_confirmed_at = COALESCE(auth.users.phone_confirmed_at, EXCLUDED.phone_confirmed_at),
        raw_user_meta_data = EXCLUDED.raw_user_meta_data,
        updated_at = timezone('utc', now());

      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      )
      VALUES (
        v_user_id,
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'phone', v_auth_phone),
        'phone',
        v_auth_phone,
        timezone('utc', now()),
        timezone('utc', now()),
        timezone('utc', now())
      )
      ON CONFLICT (provider, provider_id) DO NOTHING;
    END IF;

    UPDATE public.profiles
    SET
      role = 'owner',
      full_name = COALESCE(NULLIF(btrim(full_name), ''), v_name),
      phone_number = v_phone_e164
    WHERE id = v_user_id;

    PERFORM public.set_customer_pin_for_profile(v_user_id, v_pin);
  END LOOP;
END $$;
