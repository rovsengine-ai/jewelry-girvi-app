-- =============================================================================
-- Customer login without SMS: counter QR grant + PIN, opaque loan public_token.
--
-- customer_credentials / login_tokens are never client-readable. Only SECURITY
-- DEFINER RPCs touch them. serial_number stays out of URLs (enumerable).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Opaque token helper (base64url, no padding). 32 bytes → ~43 chars.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_opaque_token(p_bytes integer DEFAULT 32)
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT rtrim(
    translate(encode(extensions.gen_random_bytes(p_bytes), 'base64'), '+/', '-_'),
    '='
  );
$$;

REVOKE ALL ON FUNCTION public.generate_opaque_token(integer) FROM PUBLIC;
-- Column DEFAULT runs as the inserting role (shop create_loan / direct INSERT).
GRANT EXECUTE ON FUNCTION public.generate_opaque_token(integer)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- loans.public_token — non-guessable URL id (not serial_number)
-- ---------------------------------------------------------------------------
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS public_token text;

ALTER TABLE public.loans DISABLE TRIGGER loans_enforce_mutation_permissions;

UPDATE public.loans
SET public_token = public.generate_opaque_token(32)
WHERE public_token IS NULL;

ALTER TABLE public.loans ENABLE TRIGGER loans_enforce_mutation_permissions;

ALTER TABLE public.loans
  ALTER COLUMN public_token SET DEFAULT public.generate_opaque_token(32);

ALTER TABLE public.loans
  ALTER COLUMN public_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS loans_public_token_uidx
  ON public.loans (public_token);

-- ---------------------------------------------------------------------------
-- customer_credentials — one row per profile; pin_hash never leaves SQL
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_credentials (
  profile_id       uuid PRIMARY KEY
                   REFERENCES public.profiles (id) ON DELETE CASCADE,
  pin_hash         text NOT NULL,
  pin_set_at       timestamptz NOT NULL DEFAULT timezone('utc', now()),
  failed_attempts  integer NOT NULL DEFAULT 0
                   CHECK (failed_attempts >= 0),
  locked_until     timestamptz
);

ALTER TABLE public.customer_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.customer_credentials FROM PUBLIC;
REVOKE ALL ON TABLE public.customer_credentials FROM anon;
REVOKE ALL ON TABLE public.customer_credentials FROM authenticated;
-- No policies: authenticated/anon cannot SELECT/INSERT/UPDATE/DELETE.
-- SECURITY DEFINER RPCs run as the table owner and bypass RLS.

-- ---------------------------------------------------------------------------
-- login_tokens — short-lived single-use QR grants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.login_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token        text NOT NULL,
  profile_id   uuid NOT NULL
               REFERENCES public.profiles (id) ON DELETE CASCADE,
  loan_id      uuid
               REFERENCES public.loans (id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  created_by   uuid NOT NULL
               REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT login_tokens_token_nonempty_chk CHECK (length(token) >= 32)
);

CREATE UNIQUE INDEX IF NOT EXISTS login_tokens_token_uidx
  ON public.login_tokens (token);

CREATE INDEX IF NOT EXISTS login_tokens_profile_id_idx
  ON public.login_tokens (profile_id);

ALTER TABLE public.login_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.login_tokens FROM PUBLIC;
REVOKE ALL ON TABLE public.login_tokens FROM anon;
REVOKE ALL ON TABLE public.login_tokens FROM authenticated;

-- ---------------------------------------------------------------------------
-- Weak-PIN check: <6 digits, all-same, ascending/descending runs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_weak_customer_pin(p_pin text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_pin text;
  v_len integer;
  v_i integer;
  v_asc boolean := true;
  v_desc boolean := true;
  v_prev integer;
  v_cur integer;
BEGIN
  IF p_pin IS NULL THEN
    RETURN true;
  END IF;

  v_pin := btrim(p_pin);
  IF v_pin !~ '^\d+$' THEN
    RETURN true;
  END IF;

  v_len := char_length(v_pin);
  IF v_len < 6 THEN
    RETURN true;
  END IF;

  IF v_pin = repeat(substr(v_pin, 1, 1), v_len) THEN
    RETURN true;
  END IF;

  v_prev := ascii(substr(v_pin, 1, 1));
  FOR v_i IN 2 .. v_len LOOP
    v_cur := ascii(substr(v_pin, v_i, 1));
    IF v_cur <> v_prev + 1 THEN
      v_asc := false;
    END IF;
    IF v_cur <> v_prev - 1 THEN
      v_desc := false;
    END IF;
    v_prev := v_cur;
  END LOOP;

  IF v_asc OR v_desc THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_weak_customer_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_weak_customer_pin(text) TO service_role;

-- ---------------------------------------------------------------------------
-- issue_login_token — owner/staff at the counter; 5-minute single-use QR
-- ---------------------------------------------------------------------------
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
    timezone('utc', now()) + interval '5 minutes',
    auth.uid()
  );

  RETURN v_token;
END;
$$;

-- ---------------------------------------------------------------------------
-- redeem_login_token — single failure message (no enumeration of reason)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_login_token(p_token text)
RETURNS TABLE (
  profile_id uuid,
  loan_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row public.login_tokens%ROWTYPE;
  v_now timestamptz := timezone('utc', now());
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RAISE EXCEPTION 'invalid_token: token is invalid or expired';
  END IF;

  SELECT t.*
  INTO v_row
  FROM public.login_tokens t
  WHERE t.token = btrim(p_token)
  FOR UPDATE;

  IF NOT FOUND
     OR v_row.used_at IS NOT NULL
     OR v_row.expires_at <= v_now
  THEN
    RAISE EXCEPTION 'invalid_token: token is invalid or expired';
  END IF;

  UPDATE public.login_tokens
  SET used_at = v_now
  WHERE id = v_row.id;

  profile_id := v_row.profile_id;
  loan_id := v_row.loan_id;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- set_customer_pin — calling user only; rejects weak PINs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_customer_pin(p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated: sign in before setting a PIN';
  END IF;

  IF public.is_weak_customer_pin(p_pin) THEN
    RAISE EXCEPTION 'weak_pin: PIN must be at least 6 digits and not a simple pattern';
  END IF;

  v_hash := extensions.crypt(btrim(p_pin), extensions.gen_salt('bf'));

  INSERT INTO public.customer_credentials (
    profile_id, pin_hash, pin_set_at, failed_attempts, locked_until
  ) VALUES (
    v_uid, v_hash, timezone('utc', now()), 0, NULL
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    pin_hash = EXCLUDED.pin_hash,
    pin_set_at = EXCLUDED.pin_set_at,
    failed_attempts = 0,
    locked_until = NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- verify_customer_pin — SQL phone normalize; lock after 5 failures / 15 min
-- ---------------------------------------------------------------------------
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
  v_profile_id uuid;
  v_cred public.customer_credentials%ROWTYPE;
  v_now timestamptz := timezone('utc', now());
  v_match boolean := false;
BEGIN
  ok := false;
  profile_id := NULL;

  v_profile_id := public.find_profile_by_phone(p_phone);
  IF v_profile_id IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT c.*
  INTO v_cred
  FROM public.customer_credentials c
  WHERE c.profile_id = v_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_cred.locked_until IS NOT NULL AND v_cred.locked_until > v_now THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_pin IS NOT NULL
     AND btrim(p_pin) <> ''
     AND v_cred.pin_hash = extensions.crypt(btrim(p_pin), v_cred.pin_hash)
  THEN
    v_match := true;
  END IF;

  IF v_match THEN
    UPDATE public.customer_credentials
    SET failed_attempts = 0,
        locked_until = NULL
    WHERE customer_credentials.profile_id = v_profile_id;

    ok := true;
    profile_id := v_profile_id;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.customer_credentials
  SET
    failed_attempts = customer_credentials.failed_attempts + 1,
    locked_until = CASE
      WHEN customer_credentials.failed_attempts + 1 >= 5
        THEN v_now + interval '15 minutes'
      ELSE NULL
    END
  WHERE customer_credentials.profile_id = v_profile_id;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_login_token(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_login_token(text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_customer_pin(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_customer_pin(text, text)
  TO anon, authenticated, service_role;

COMMENT ON TABLE public.customer_credentials IS
  'PIN hashes for SMS-free customer login. No client SELECT; SECURITY DEFINER RPCs only.';
COMMENT ON TABLE public.login_tokens IS
  'Counter-issued QR grants. Single use, 5-minute expiry. No client SELECT.';
COMMENT ON COLUMN public.loans.public_token IS
  'Opaque non-enumerable loan id for URLs. Never put serial_number in a URL.';
COMMENT ON FUNCTION public.issue_login_token(uuid, uuid) IS
  'Shop-only. Issues a 5-minute single-use login token for a customer at the counter.';
COMMENT ON FUNCTION public.redeem_login_token(text) IS
  'Marks a login token used. Same error for unknown, expired, or already-used.';
COMMENT ON FUNCTION public.set_customer_pin(text) IS
  'Sets the PIN for auth.uid() only. Rejects weak patterns.';
COMMENT ON FUNCTION public.verify_customer_pin(text, text) IS
  'Phone via normalize_phone_e164 / find_profile_by_phone. Locks 15 min after 5 failures.';
