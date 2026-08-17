-- Customer face photo (distinct from ID document image).
-- Stored in the private kyc bucket at {customer_id}/photo/{filename}.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo_path text;

COMMENT ON COLUMN public.profiles.photo_path IS
  'Face photo object path in the private ''kyc'' bucket: {customer_id}/photo/... '
  'Not subject to the Aadhaar image ban (this is not an ID document copy).';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_photo_path_chk;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_photo_path_chk CHECK (
    photo_path IS NULL
    OR photo_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/photo/[A-Za-z0-9._-]+$'
  );
