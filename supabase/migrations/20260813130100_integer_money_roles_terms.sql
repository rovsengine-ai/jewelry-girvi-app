-- =============================================================================
-- Forward migration: integer paise / basis points, owner|staff roles, term tables.
-- Safe for DBs that already have the baseline schema and data.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums: interest_model, partial_period_mode; replace admin with owner|staff
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interest_model') THEN
    CREATE TYPE public.interest_model AS ENUM ('retail', 'merchant');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partial_period_mode') THEN
    CREATE TYPE public.partial_period_mode AS ENUM ('pro_rata', 'full_period');
  END IF;
END $$;

CREATE TYPE public.user_role_new AS ENUM (
  'owner',
  'staff',
  'retail_customer',
  'merchant'
);

-- Drop policies that reference is_admin() before we replace helpers/roles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
DROP POLICY IF EXISTS "loans_select_own" ON public.loans;
DROP POLICY IF EXISTS "loans_admin_all" ON public.loans;
DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_all" ON public.payments;
DROP POLICY IF EXISTS "receipts_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "receipts_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "receipts_admin_delete" ON storage.objects;

ALTER TABLE public.profiles
  ALTER COLUMN role DROP DEFAULT;

ALTER TABLE public.profiles
  ALTER COLUMN role TYPE public.user_role_new
  USING (
    CASE role::text
      WHEN 'admin' THEN 'owner'::public.user_role_new
      ELSE role::text::public.user_role_new
    END
  );

DROP FUNCTION IF EXISTS public.is_admin();
DROP TYPE public.user_role;
ALTER TYPE public.user_role_new RENAME TO user_role;

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'retail_customer'::public.user_role;

CREATE OR REPLACE FUNCTION public.is_shop_user()
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
      AND role IN ('owner'::public.user_role, 'staff'::public.user_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
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
      AND role = 'owner'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_role text;
  resolved_role public.user_role;
BEGIN
  meta_role := NEW.raw_user_meta_data ->> 'role';
  resolved_role := CASE
    WHEN meta_role = 'admin' THEN 'owner'::public.user_role
    WHEN meta_role IN ('owner', 'staff', 'retail_customer', 'merchant')
      THEN meta_role::public.user_role
    ELSE 'retail_customer'::public.user_role
  END;

  INSERT INTO public.profiles (id, role, full_name, phone_number)
  VALUES (
    NEW.id,
    resolved_role,
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

-- ---------------------------------------------------------------------------
-- 2. shop_defaults (single row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shop_defaults (
  id                    integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  interest_model        public.interest_model NOT NULL DEFAULT 'retail',
  rate_bps              integer NOT NULL DEFAULT 300
    CHECK (rate_bps > 0 AND rate_bps <= 10000),
  simple_period_days    integer NOT NULL DEFAULT 180
    CHECK (simple_period_days > 0),
  compound_every_days   integer NOT NULL DEFAULT 30
    CHECK (compound_every_days > 0),
  grace_days            integer NOT NULL DEFAULT 0
    CHECK (grace_days >= 0),
  partial_period_mode   public.partial_period_mode NOT NULL DEFAULT 'full_period',
  updated_at            timestamptz NOT NULL DEFAULT timezone('utc', now())
);

INSERT INTO public.shop_defaults (
  id, interest_model, rate_bps, simple_period_days, compound_every_days, grace_days, partial_period_mode
) VALUES (
  1, 'retail', 300, 180, 30, 0, 'full_period'
)
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER shop_defaults_set_updated_at
  BEFORE UPDATE ON public.shop_defaults
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.shop_defaults ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. loans → integer money + frozen terms + disbursed_on
-- ---------------------------------------------------------------------------
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS principal_paise bigint,
  ADD COLUMN IF NOT EXISTS rate_bps integer,
  ADD COLUMN IF NOT EXISTS disbursed_on date,
  ADD COLUMN IF NOT EXISTS interest_model public.interest_model,
  ADD COLUMN IF NOT EXISTS simple_period_days integer,
  ADD COLUMN IF NOT EXISTS compound_every_days integer,
  ADD COLUMN IF NOT EXISTS grace_days integer,
  ADD COLUMN IF NOT EXISTS partial_period_mode public.partial_period_mode;

UPDATE public.loans l
SET
  principal_paise = COALESCE(
    l.principal_paise,
    ROUND(l.loan_amount * 100)::bigint
  ),
  rate_bps = COALESCE(
    l.rate_bps,
    ROUND(l.interest_rate_monthly * 100)::integer
  ),
  disbursed_on = COALESCE(
    l.disbursed_on,
    (timezone('Asia/Kolkata', l.created_at))::date
  ),
  interest_model = COALESCE(
    l.interest_model,
    CASE
      WHEN p.role = 'merchant'::public.user_role THEN 'merchant'::public.interest_model
      ELSE 'retail'::public.interest_model
    END
  ),
  simple_period_days = COALESCE(l.simple_period_days, 180),
  compound_every_days = COALESCE(l.compound_every_days, 30),
  grace_days = COALESCE(l.grace_days, 0),
  partial_period_mode = COALESCE(l.partial_period_mode, 'full_period'::public.partial_period_mode)
FROM public.profiles p
WHERE p.id = l.customer_id;

UPDATE public.loans
SET
  principal_paise = COALESCE(principal_paise, 0),
  rate_bps = COALESCE(rate_bps, 300),
  disbursed_on = COALESCE(disbursed_on, (timezone('Asia/Kolkata', now()))::date),
  interest_model = COALESCE(interest_model, 'retail'::public.interest_model),
  simple_period_days = COALESCE(simple_period_days, 180),
  compound_every_days = COALESCE(compound_every_days, 30),
  grace_days = COALESCE(grace_days, 0),
  partial_period_mode = COALESCE(partial_period_mode, 'full_period'::public.partial_period_mode)
WHERE principal_paise IS NULL
   OR rate_bps IS NULL
   OR disbursed_on IS NULL
   OR interest_model IS NULL
   OR simple_period_days IS NULL
   OR compound_every_days IS NULL
   OR grace_days IS NULL
   OR partial_period_mode IS NULL;

ALTER TABLE public.loans
  ALTER COLUMN principal_paise SET NOT NULL,
  ALTER COLUMN rate_bps SET NOT NULL,
  ALTER COLUMN disbursed_on SET NOT NULL,
  ALTER COLUMN interest_model SET NOT NULL,
  ALTER COLUMN simple_period_days SET NOT NULL,
  ALTER COLUMN compound_every_days SET NOT NULL,
  ALTER COLUMN grace_days SET NOT NULL,
  ALTER COLUMN partial_period_mode SET NOT NULL;

ALTER TABLE public.loans
  DROP CONSTRAINT IF EXISTS loans_amount_positive_chk,
  DROP CONSTRAINT IF EXISTS loans_interest_rate_chk;

ALTER TABLE public.loans
  DROP COLUMN IF EXISTS loan_amount,
  DROP COLUMN IF EXISTS interest_rate_monthly;

ALTER TABLE public.loans
  ADD CONSTRAINT loans_principal_positive_chk CHECK (principal_paise > 0),
  ADD CONSTRAINT loans_rate_bps_chk CHECK (rate_bps > 0 AND rate_bps <= 10000),
  ADD CONSTRAINT loans_simple_period_days_chk CHECK (simple_period_days > 0),
  ADD CONSTRAINT loans_compound_every_days_chk CHECK (compound_every_days > 0),
  ADD CONSTRAINT loans_grace_days_chk CHECK (grace_days >= 0);

-- ---------------------------------------------------------------------------
-- 4. payments → amount_paid_paise + paid_on; drop payment_type
-- ---------------------------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS amount_paid_paise bigint,
  ADD COLUMN IF NOT EXISTS paid_on date;

UPDATE public.payments
SET
  amount_paid_paise = COALESCE(
    amount_paid_paise,
    ROUND(amount_paid * 100)::bigint
  ),
  paid_on = COALESCE(
    paid_on,
    (timezone('Asia/Kolkata', created_at))::date
  );

ALTER TABLE public.payments
  ALTER COLUMN amount_paid_paise SET NOT NULL,
  ALTER COLUMN paid_on SET NOT NULL;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_amount_positive_chk;

ALTER TABLE public.payments
  DROP COLUMN IF EXISTS amount_paid,
  DROP COLUMN IF EXISTS payment_type;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_amount_paise_positive_chk CHECK (amount_paid_paise > 0);

DROP TYPE IF EXISTS public.payment_type;

CREATE INDEX IF NOT EXISTS payments_paid_on_idx ON public.payments (paid_on DESC);

-- ---------------------------------------------------------------------------
-- 5. loan_term_changes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_term_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id     uuid NOT NULL REFERENCES public.loans (id) ON DELETE RESTRICT,
  changed_by  uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  changed_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),
  field       text NOT NULL,
  old_value   text,
  new_value   text,
  reason      text NOT NULL,
  CONSTRAINT loan_term_changes_field_chk CHECK (
    field IN (
      'interest_model',
      'rate_bps',
      'simple_period_days',
      'compound_every_days',
      'grace_days',
      'partial_period_mode'
    )
  )
);

CREATE INDEX IF NOT EXISTS loan_term_changes_loan_id_idx
  ON public.loan_term_changes (loan_id, changed_at DESC);

ALTER TABLE public.loan_term_changes ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. RLS (shop_user = owner|staff; finer owner-only rules in a later phase)
-- ---------------------------------------------------------------------------
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_shop_user());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_shop_user())
  WITH CHECK (
    public.is_shop_user()
    OR (
      id = auth.uid()
      AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

CREATE POLICY "profiles_shop_all"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_shop_user())
  WITH CHECK (public.is_shop_user());

CREATE POLICY "loans_select_own"
  ON public.loans FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY "loans_shop_all"
  ON public.loans FOR ALL TO authenticated
  USING (public.is_shop_user())
  WITH CHECK (public.is_shop_user());

CREATE POLICY "payments_select_own"
  ON public.payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = payments.loan_id AND l.customer_id = auth.uid()
    )
  );

CREATE POLICY "payments_shop_all"
  ON public.payments FOR ALL TO authenticated
  USING (public.is_shop_user())
  WITH CHECK (public.is_shop_user());

CREATE POLICY "shop_defaults_select_shop"
  ON public.shop_defaults FOR SELECT TO authenticated
  USING (public.is_shop_user());

CREATE POLICY "shop_defaults_update_owner"
  ON public.shop_defaults FOR UPDATE TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY "loan_term_changes_select_shop"
  ON public.loan_term_changes FOR SELECT TO authenticated
  USING (public.is_shop_user());

CREATE POLICY "loan_term_changes_insert_owner"
  ON public.loan_term_changes FOR INSERT TO authenticated
  WITH CHECK (public.is_owner() AND changed_by = auth.uid());

CREATE POLICY "receipts_shop_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND public.is_shop_user());

CREATE POLICY "receipts_shop_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'receipts' AND public.is_shop_user());

CREATE POLICY "receipts_shop_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND public.is_shop_user());

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON TYPE public.user_role TO authenticated, service_role;
GRANT USAGE ON TYPE public.interest_model TO authenticated, service_role;
GRANT USAGE ON TYPE public.partial_period_mode TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_shop_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_profile_by_phone(text) TO authenticated;
