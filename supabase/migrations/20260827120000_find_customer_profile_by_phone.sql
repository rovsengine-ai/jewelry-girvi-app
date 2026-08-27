-- Girvis belong to a customer profile, not a shop login.
-- Many loans per customer phone; one loan has one customer_id (one phone).
-- find_profile_by_phone still prefers shop for PIN login.

CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits text;
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN
    RETURN NULL;
  END IF;

  digits := regexp_replace(p, '\D', '', 'g');

  IF length(digits) = 11 AND left(digits, 1) = '0' THEN
    digits := substr(digits, 2);
  END IF;

  IF left(digits, 2) = '91' AND length(digits) = 12 THEN
    RETURN '+' || digits;
  END IF;

  IF length(digits) = 10 THEN
    RETURN '+91' || digits;
  END IF;

  IF digits = '' THEN
    RETURN NULL;
  END IF;

  RETURN '+' || digits;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_customer_profile_by_phone(p_phone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.profiles
  WHERE phone_number = public.normalize_phone_e164(p_phone)
    AND role IN ('retail_customer', 'merchant')
  ORDER BY created_at ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.find_customer_profile_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_customer_profile_by_phone(text) TO authenticated;
