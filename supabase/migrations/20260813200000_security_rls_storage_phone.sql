-- =============================================================================
-- Phase 4: stricter RLS (owner vs staff), private receipts storage, E.164 phones
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Canonical E.164 phone helper + backfill
-- ---------------------------------------------------------------------------
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

UPDATE public.profiles
SET phone_number = public.normalize_phone_e164(phone_number)
WHERE phone_number IS NOT NULL
  AND phone_number IS DISTINCT FROM public.normalize_phone_e164(phone_number);

-- ---------------------------------------------------------------------------
-- 2. Owner/staff loan mutation guard (terms + close)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_loan_mutation_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT public.is_owner() THEN
      RAISE EXCEPTION 'only owner may delete loans';
    END IF;
    RETURN OLD;
  END IF;

  IF public.is_owner() THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_shop_user() THEN
    RAISE EXCEPTION 'not allowed to mutate loans';
  END IF;

  -- staff may not close / redeem
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'closed' THEN
    RAISE EXCEPTION 'staff may not close or redeem loans';
  END IF;

  -- staff may not edit frozen terms
  IF NEW.interest_model IS DISTINCT FROM OLD.interest_model
     OR NEW.rate_bps IS DISTINCT FROM OLD.rate_bps
     OR NEW.simple_period_days IS DISTINCT FROM OLD.simple_period_days
     OR NEW.compound_every_days IS DISTINCT FROM OLD.compound_every_days
     OR NEW.grace_days IS DISTINCT FROM OLD.grace_days
     OR NEW.partial_period_mode IS DISTINCT FROM OLD.partial_period_mode
  THEN
    RAISE EXCEPTION 'staff may not edit loan terms';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loans_enforce_mutation_permissions ON public.loans;
CREATE TRIGGER loans_enforce_mutation_permissions
  BEFORE UPDATE OR DELETE ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_loan_mutation_permissions();

-- ---------------------------------------------------------------------------
-- 3. Replace broad shop ALL policies with scoped ones
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_shop_all" ON public.profiles;
DROP POLICY IF EXISTS "loans_shop_all" ON public.loans;
DROP POLICY IF EXISTS "payments_shop_all" ON public.payments;

CREATE POLICY "loans_shop_select"
  ON public.loans FOR SELECT TO authenticated
  USING (public.is_shop_user());

CREATE POLICY "loans_shop_insert"
  ON public.loans FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_user());

CREATE POLICY "loans_shop_update"
  ON public.loans FOR UPDATE TO authenticated
  USING (public.is_shop_user())
  WITH CHECK (public.is_shop_user());

CREATE POLICY "loans_owner_delete"
  ON public.loans FOR DELETE TO authenticated
  USING (public.is_owner());

CREATE POLICY "payments_shop_select"
  ON public.payments FOR SELECT TO authenticated
  USING (public.is_shop_user());

CREATE POLICY "payments_shop_insert"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_user());

CREATE POLICY "payments_owner_delete"
  ON public.payments FOR DELETE TO authenticated
  USING (public.is_owner());

-- ---------------------------------------------------------------------------
-- 4. Private receipts bucket + path-namespaced storage policies
--    Object path: {customer_id}/{receipts|signatures}/...
-- ---------------------------------------------------------------------------
UPDATE storage.buckets
SET public = false
WHERE id = 'receipts';

DROP POLICY IF EXISTS "receipts_public_read" ON storage.objects;
DROP POLICY IF EXISTS "receipts_shop_insert" ON storage.objects;
DROP POLICY IF EXISTS "receipts_shop_update" ON storage.objects;
DROP POLICY IF EXISTS "receipts_shop_delete" ON storage.objects;

CREATE POLICY "receipts_shop_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND public.is_shop_user());

CREATE POLICY "receipts_customer_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "receipts_shop_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND public.is_shop_user()
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

CREATE POLICY "receipts_shop_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'receipts' AND public.is_shop_user())
  WITH CHECK (
    bucket_id = 'receipts'
    AND public.is_shop_user()
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

CREATE POLICY "receipts_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND public.is_owner());
