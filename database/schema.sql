-- =============================================================================
-- Jewelry Girvi App — PostgreSQL schema for Supabase
-- Run in Supabase SQL Editor or via supabase db push / migration.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.user_role AS ENUM (
  'admin',
  'retail_customer',
  'merchant'
);

CREATE TYPE public.payment_type AS ENUM (
  'interest',
  'principal'
);

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name     text,
  phone_number  text UNIQUE,
  address       text,
  role          public.user_role NOT NULL DEFAULT 'retail_customer',
  created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT profiles_phone_format_chk CHECK (
    phone_number IS NULL OR phone_number ~ '^[+]?[0-9]{7,15}$'
  )
);

CREATE INDEX profiles_role_idx ON public.profiles (role);
CREATE INDEX profiles_phone_number_idx ON public.profiles (phone_number);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- loans
-- ---------------------------------------------------------------------------
CREATE TABLE public.loans (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id             uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  serial_number           text NOT NULL,
  receipt_image_url       text,
  item_name               text NOT NULL,
  weight_grams            numeric(10, 3) NOT NULL,
  loan_amount             numeric(12, 2) NOT NULL,
  interest_rate_monthly   numeric(5, 2) NOT NULL,
  status                  text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  digital_signature_url   text,
  created_at              timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at              timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT loans_weight_positive_chk CHECK (weight_grams > 0),
  CONSTRAINT loans_amount_positive_chk CHECK (loan_amount > 0),
  CONSTRAINT loans_interest_rate_chk CHECK (
    interest_rate_monthly > 0 AND interest_rate_monthly <= 100
  )
);

CREATE UNIQUE INDEX loans_serial_number_idx ON public.loans (serial_number);
CREATE INDEX loans_customer_id_idx ON public.loans (customer_id);
CREATE INDEX loans_status_idx ON public.loans (status);
CREATE INDEX loans_created_at_idx ON public.loans (created_at DESC);

CREATE TRIGGER loans_set_updated_at
  BEFORE UPDATE ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
CREATE TABLE public.payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id       uuid NOT NULL REFERENCES public.loans (id) ON DELETE RESTRICT,
  amount_paid   numeric(12, 2) NOT NULL,
  payment_type  public.payment_type NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT payments_amount_positive_chk CHECK (amount_paid > 0)
);

CREATE INDEX payments_loan_id_idx ON public.payments (loan_id);
CREATE INDEX payments_created_at_idx ON public.payments (created_at DESC);

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, phone_number)
  VALUES (
    NEW.id,
    COALESCE(
      (NEW.raw_user_meta_data ->> 'role')::public.user_role,
      'retail_customer'::public.user_role
    ),
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name'
    ),
    COALESCE(NEW.phone, NEW.raw_user_meta_data ->> 'phone_number')
  )
  ON CONFLICT (id) DO UPDATE SET
    phone_number = COALESCE(EXCLUDED.phone_number, public.profiles.phone_number),
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Link phone on profile update (customer registers after admin created loan metadata)
CREATE OR REPLACE FUNCTION public.sync_profile_phone_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    UPDATE public.profiles
    SET phone_number = NEW.phone
    WHERE id = NEW.id
      AND (phone_number IS NULL OR phone_number = NEW.phone);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_phone_updated
  AFTER UPDATE OF phone ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_phone_from_auth();

-- Admin helper: resolve customer profile by phone (returns NULL if not registered)
CREATE OR REPLACE FUNCTION public.find_profile_by_phone(p_phone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.profiles
  WHERE phone_number = p_phone
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_profile_by_phone(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket for receipt & signature images
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (
    public.is_admin()
    OR (
      id = auth.uid()
      AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

CREATE POLICY "profiles_admin_all"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- loans: customers read own rows only; admins full access
CREATE POLICY "loans_select_own"
  ON public.loans FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY "loans_admin_all"
  ON public.loans FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- payments: customers read own loan payments; admins full access
CREATE POLICY "payments_select_own"
  ON public.payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = payments.loan_id AND l.customer_id = auth.uid()
    )
  );

CREATE POLICY "payments_admin_all"
  ON public.payments FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- storage policies for receipts bucket
CREATE POLICY "receipts_public_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'receipts');

CREATE POLICY "receipts_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND public.is_admin());

CREATE POLICY "receipts_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'receipts' AND public.is_admin());

CREATE POLICY "receipts_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND public.is_admin());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON TYPE public.user_role TO authenticated, service_role;
GRANT USAGE ON TYPE public.payment_type TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
