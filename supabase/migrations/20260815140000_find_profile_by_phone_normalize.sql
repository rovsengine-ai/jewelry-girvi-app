-- find_profile_by_phone must use the same canonicaliser as insert/OTP.
-- toE164India and normalize_phone_e164 already agree (see 150-phone-normalize).
-- Do not change the leading-zero mangling in this pass.

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
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_profile_by_phone(text) TO authenticated;
