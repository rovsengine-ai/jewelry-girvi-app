-- Owner can hide all loan rows from staff, retail customers, and merchants.
-- Owner SELECT/write is unchanged. Turning the flag off restores the same RLS.
-- Do not edit 20260815150000_archive_loan.sql.

ALTER TABLE public.shop_defaults
  ADD COLUMN IF NOT EXISTS loans_concealed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.shop_defaults.loans_concealed IS
  'When true, staff and customers cannot SELECT (or insert) loans. Owner only.';

CREATE FUNCTION public.loans_are_concealed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT d.loans_concealed FROM public.shop_defaults d WHERE d.id = 1),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.loans_are_concealed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.loans_are_concealed()
  TO authenticated, service_role;

CREATE FUNCTION public.set_loans_concealed(p_concealed boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_value boolean;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'owner_only: only the owner may conceal or reveal loans';
  END IF;

  IF p_concealed IS NULL THEN
    RAISE EXCEPTION 'p_concealed is required';
  END IF;

  UPDATE public.shop_defaults
  SET loans_concealed = p_concealed
  WHERE id = 1
  RETURNING loans_concealed INTO v_value;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'shop_defaults row missing';
  END IF;

  RETURN v_value;
END;
$$;

REVOKE ALL ON FUNCTION public.set_loans_concealed(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_loans_concealed(boolean)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "loans_select_own" ON public.loans;
CREATE POLICY "loans_select_own"
  ON public.loans FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    AND archived_at IS NULL
    AND NOT public.loans_are_concealed()
  );

DROP POLICY IF EXISTS "loans_shop_select" ON public.loans;
CREATE POLICY "loans_shop_select"
  ON public.loans FOR SELECT TO authenticated
  USING (
    public.is_owner()
    OR (
      public.is_shop_user()
      AND archived_at IS NULL
      AND NOT public.loans_are_concealed()
    )
  );

DROP POLICY IF EXISTS "loans_shop_insert" ON public.loans;
CREATE POLICY "loans_shop_insert"
  ON public.loans FOR INSERT TO authenticated
  WITH CHECK (
    public.is_owner()
    OR (
      public.is_shop_user()
      AND NOT public.loans_are_concealed()
    )
  );

DROP POLICY IF EXISTS "loans_shop_update" ON public.loans;
CREATE POLICY "loans_shop_update"
  ON public.loans FOR UPDATE TO authenticated
  USING (
    public.is_owner()
    OR (
      public.is_shop_user()
      AND NOT public.loans_are_concealed()
    )
  )
  WITH CHECK (
    public.is_owner()
    OR (
      public.is_shop_user()
      AND NOT public.loans_are_concealed()
    )
  );

DROP POLICY IF EXISTS "payments_shop_insert" ON public.payments;
CREATE POLICY "payments_shop_insert"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_owner()
    OR (
      public.is_shop_user()
      AND NOT public.loans_are_concealed()
    )
  );

DROP POLICY IF EXISTS "loan_items_shop_insert" ON public.loan_items;
CREATE POLICY "loan_items_shop_insert"
  ON public.loan_items FOR INSERT TO authenticated
  WITH CHECK (
    public.is_owner()
    OR (
      public.is_shop_user()
      AND NOT public.loans_are_concealed()
    )
  );

DROP POLICY IF EXISTS "loan_items_shop_update" ON public.loan_items;
CREATE POLICY "loan_items_shop_update"
  ON public.loan_items FOR UPDATE TO authenticated
  USING (
    public.is_owner()
    OR (
      public.is_shop_user()
      AND NOT public.loans_are_concealed()
    )
  )
  WITH CHECK (
    public.is_owner()
    OR (
      public.is_shop_user()
      AND NOT public.loans_are_concealed()
    )
  );
