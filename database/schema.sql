-- =============================================================================
-- Jewelry Girvi App — PostgreSQL schema for Supabase
-- Run in Supabase SQL Editor or via supabase db push / migration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.user_role AS ENUM (
  'admin',
  'retail_customer',
  'merchant'
);

COMMENT ON TYPE public.user_role IS
  'Application roles: admin (full access), retail_customer (own data only), merchant (shop loans they manage).';

CREATE TYPE public.loan_status AS ENUM (
  'pending',    -- created, awaiting disbursement / approval
  'active',     -- disbursed, collateral held, interest accruing
  'overdue',    -- missed payment window, still recoverable
  'closed',     -- fully repaid, collateral returned
  'forfeited'   -- collateral retained after default
);

COMMENT ON TYPE public.loan_status IS
  'Loan lifecycle for jewelry girvi (pawn) transactions.';

CREATE TYPE public.payment_type AS ENUM (
  'interest',   -- partial month-to-month interest payment
  'principal',  -- principal reduction
  'full_settlement' -- final payment closing the loan
);

COMMENT ON TYPE public.payment_type IS
  'Classification of payment toward a girvi loan.';

-- ---------------------------------------------------------------------------
-- Utility functions
-- ---------------------------------------------------------------------------

-- Automatically maintain updated_at on row changes.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Trigger function: sets updated_at to current UTC timestamp before UPDATE.';

-- Returns the role of the currently authenticated user (NULL if no profile).
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.current_user_role() IS
  'RLS helper: fetches role for auth.uid() from profiles. SECURITY DEFINER to avoid policy recursion.';

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

COMMENT ON FUNCTION public.is_admin() IS
  'RLS helper: true when the authenticated user has admin role.';

CREATE OR REPLACE FUNCTION public.is_merchant()
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
      AND role = 'merchant'::public.user_role
  );
$$;

COMMENT ON FUNCTION public.is_merchant() IS
  'RLS helper: true when the authenticated user has merchant role.';

-- ---------------------------------------------------------------------------
-- profiles — one row per auth.users, extended app metadata
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role        public.user_role NOT NULL DEFAULT 'retail_customer',
  full_name   text,
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT profiles_phone_format_chk CHECK (
    phone IS NULL OR phone ~ '^[+]?[0-9]{7,15}$'
  )
);

COMMENT ON TABLE public.profiles IS
  'User profile linked 1:1 with Supabase Auth. Role drives RLS access.';

COMMENT ON COLUMN public.profiles.role IS
  'admin: full access | retail_customer: own rows only | merchant: loans they manage';

CREATE INDEX profiles_role_idx ON public.profiles (role);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- loans — jewelry girvi (pawn) records
-- ---------------------------------------------------------------------------
CREATE TABLE public.loans (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id             uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  merchant_id             uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  receipt_image_url       text,
  item_name               text NOT NULL,
  item_description        text,
  weight_grams            numeric(10, 3) NOT NULL,
  purity_karat            smallint,
  loan_amount             numeric(12, 2) NOT NULL,
  interest_rate_monthly   numeric(5, 4) NOT NULL,
  status                  public.loan_status NOT NULL DEFAULT 'pending',
  disbursed_at            timestamptz,
  due_date                date,
  closed_at               timestamptz,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at              timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT loans_weight_positive_chk CHECK (weight_grams > 0),
  CONSTRAINT loans_amount_positive_chk CHECK (loan_amount > 0),
  CONSTRAINT loans_interest_rate_chk CHECK (
    interest_rate_monthly >= 0 AND interest_rate_monthly <= 1
  ),
  CONSTRAINT loans_purity_karat_chk CHECK (
    purity_karat IS NULL OR (purity_karat >= 1 AND purity_karat <= 24)
  ),
  CONSTRAINT loans_customer_not_merchant_chk CHECK (customer_id <> merchant_id)
);

COMMENT ON TABLE public.loans IS
  'Jewelry girvi loans. merchant_id identifies the shop managing the loan; used for merchant RLS.';

COMMENT ON COLUMN public.loans.interest_rate_monthly IS
  'Decimal monthly rate, e.g. 0.0200 = 2% per month.';

COMMENT ON COLUMN public.loans.merchant_id IS
  'Profile (merchant role) who created/manages this loan at their shop.';

CREATE INDEX loans_customer_id_idx ON public.loans (customer_id);
CREATE INDEX loans_merchant_id_idx ON public.loans (merchant_id);
CREATE INDEX loans_status_idx ON public.loans (status);
CREATE INDEX loans_created_at_idx ON public.loans (created_at DESC);
CREATE INDEX loans_customer_status_idx ON public.loans (customer_id, status);

CREATE TRIGGER loans_set_updated_at
  BEFORE UPDATE ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments — partial month-to-month interest (and other) payments
-- ---------------------------------------------------------------------------
CREATE TABLE public.payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id         uuid NOT NULL REFERENCES public.loans (id) ON DELETE RESTRICT,
  amount          numeric(12, 2) NOT NULL,
  payment_type    public.payment_type NOT NULL DEFAULT 'interest',
  payment_date    date NOT NULL DEFAULT (timezone('utc', now()))::date,
  period_start    date,
  period_end      date,
  recorded_by     uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT payments_amount_positive_chk CHECK (amount > 0),
  CONSTRAINT payments_period_order_chk CHECK (
    period_start IS NULL
    OR period_end IS NULL
    OR period_start <= period_end
  )
);

COMMENT ON TABLE public.payments IS
  'Payments applied to loans, typically monthly interest; links to loan for customer/merchant visibility via RLS.';

COMMENT ON COLUMN public.payments.period_start IS
  'Optional interest period covered by this payment (inclusive).';

COMMENT ON COLUMN public.payments.period_end IS
  'Optional interest period covered by this payment (inclusive).';

CREATE INDEX payments_loan_id_idx ON public.payments (loan_id);
CREATE INDEX payments_payment_date_idx ON public.payments (payment_date DESC);
CREATE INDEX payments_loan_payment_date_idx ON public.payments (loan_id, payment_date DESC);

CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup (optional but recommended for Supabase Auth)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (
    NEW.id,
    COALESCE(
      (NEW.raw_user_meta_data ->> 'role')::public.user_role,
      'retail_customer'::public.user_role
    ),
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name'
    )
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates a profiles row when a new auth.users row is inserted. Role defaults to retail_customer.';

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- ---- profiles policies ----

-- Customers: read/update only their own profile.
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Prevent non-admins from elevating their own role.
    AND (
      role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
      OR public.is_admin()
    )
  );

-- Admins: full access to all profiles.
CREATE POLICY "profiles_admin_all"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Merchants: read own profile only (same as customer for profile row).
-- Covered by profiles_select_own; merchants do not see other users' profiles.

COMMENT ON POLICY "profiles_select_own" ON public.profiles IS
  'Retail customers and merchants can SELECT only their own profile row.';

COMMENT ON POLICY "profiles_admin_all" ON public.profiles IS
  'Admins have full CRUD on all profiles including role changes.';

-- ---- loans policies ----

-- Customers: read own loans only.
CREATE POLICY "loans_select_own"
  ON public.loans
  FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

-- Merchants: read and manage loans at their shop (merchant_id = self).
CREATE POLICY "loans_merchant_select"
  ON public.loans
  FOR SELECT
  TO authenticated
  USING (merchant_id = auth.uid() AND public.is_merchant());

CREATE POLICY "loans_merchant_insert"
  ON public.loans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    merchant_id = auth.uid()
    AND public.is_merchant()
  );

CREATE POLICY "loans_merchant_update"
  ON public.loans
  FOR UPDATE
  TO authenticated
  USING (merchant_id = auth.uid() AND public.is_merchant())
  WITH CHECK (merchant_id = auth.uid() AND public.is_merchant());

-- Admins: full access.
CREATE POLICY "loans_admin_all"
  ON public.loans
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON POLICY "loans_select_own" ON public.loans IS
  'Retail customers can SELECT only loans where they are the customer.';

COMMENT ON POLICY "loans_merchant_select" ON public.loans IS
  'Merchants can SELECT loans they manage (merchant_id = auth.uid()).';

COMMENT ON POLICY "loans_merchant_insert" ON public.loans IS
  'Merchants can create loans assigned to their shop.';

COMMENT ON POLICY "loans_merchant_update" ON public.loans IS
  'Merchants can update loans they manage (status, notes, etc.).';

COMMENT ON POLICY "loans_admin_all" ON public.loans IS
  'Admins have full CRUD on all loans.';

-- ---- payments policies ----

-- Customers: read payments on their own loans.
CREATE POLICY "payments_select_own"
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.loans l
      WHERE l.id = payments.loan_id
        AND l.customer_id = auth.uid()
    )
  );

-- Merchants: read and record payments on loans they manage.
CREATE POLICY "payments_merchant_select"
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (
    public.is_merchant()
    AND EXISTS (
      SELECT 1
      FROM public.loans l
      WHERE l.id = payments.loan_id
        AND l.merchant_id = auth.uid()
    )
  );

CREATE POLICY "payments_merchant_insert"
  ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_merchant()
    AND EXISTS (
      SELECT 1
      FROM public.loans l
      WHERE l.id = payments.loan_id
        AND l.merchant_id = auth.uid()
    )
  );

CREATE POLICY "payments_merchant_update"
  ON public.payments
  FOR UPDATE
  TO authenticated
  USING (
    public.is_merchant()
    AND EXISTS (
      SELECT 1
      FROM public.loans l
      WHERE l.id = payments.loan_id
        AND l.merchant_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_merchant()
    AND EXISTS (
      SELECT 1
      FROM public.loans l
      WHERE l.id = payments.loan_id
        AND l.merchant_id = auth.uid()
    )
  );

-- Admins: full access.
CREATE POLICY "payments_admin_all"
  ON public.payments
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON POLICY "payments_select_own" ON public.payments IS
  'Retail customers can SELECT payments for their own loans only.';

COMMENT ON POLICY "payments_merchant_insert" ON public.payments IS
  'Merchants record interest/principal payments on loans at their shop.';

COMMENT ON POLICY "payments_admin_all" ON public.payments IS
  'Admins have full CRUD on all payments.';

-- ---------------------------------------------------------------------------
-- Grants (Supabase roles)
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

GRANT USAGE ON TYPE public.user_role TO authenticated, service_role;
GRANT USAGE ON TYPE public.loan_status TO authenticated, service_role;
GRANT USAGE ON TYPE public.payment_type TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_merchant() TO authenticated, service_role;

-- Default privileges for future objects created in public schema.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
