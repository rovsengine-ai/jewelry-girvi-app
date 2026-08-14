-- =============================================================================
-- Stage 3: owner-only redeem_loan / renew_loan RPCs, and overdue-after-renewal.
--
-- closeLoanIfFullyPaid used to flip status='closed' from the client after a
-- payment. That skipped the item-release checklist and never wrote the audit
-- snapshot. These RPCs are the only legal way to end or renew a loan.
-- =============================================================================

-- Optional second signature captured at the counter when goods go back.
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS release_signature_url text;

-- Two taps on the same renewal day must not insert two rows / two payments.
CREATE UNIQUE INDEX IF NOT EXISTS loan_renewals_loan_id_renewed_on_idx
  ON public.loan_renewals (loan_id, renewed_on);

-- ---------------------------------------------------------------------------
-- redeem_loan: lock the row, snapshot the due figure, take the last payment,
-- require every pledged item to be checked, then write the audit columns.
-- A second call on an already-redeemed loan returns the original snapshot
-- and inserts nothing (idempotent). It does not rewrite history.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_loan(
  p_loan_id uuid,
  p_redeemed_on date,
  p_released_to_name text,
  p_item_ids uuid[],
  p_final_payment_paise bigint DEFAULT 0,
  p_release_note text DEFAULT NULL,
  p_release_signature_url text DEFAULT NULL
)
RETURNS TABLE (
  loan_id uuid,
  status public.loan_status,
  redeemed_on date,
  redeemed_by uuid,
  closure_balance_paise bigint,
  already_redeemed boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_loan public.loans%ROWTYPE;
  v_required uuid[];
  v_given uuid[];
  v_due bigint;
  v_principal bigint;
  v_accrued bigint;
  v_name text;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'owner_only: only the owner may redeem a loan';
  END IF;

  v_name := btrim(COALESCE(p_released_to_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'released_to_name is required';
  END IF;

  IF p_final_payment_paise IS NULL OR p_final_payment_paise < 0 THEN
    RAISE EXCEPTION 'final payment cannot be negative';
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'loan not found: %', p_loan_id;
  END IF;

  IF v_loan.status = 'redeemed'::public.loan_status THEN
    loan_id := v_loan.id;
    status := v_loan.status;
    redeemed_on := v_loan.redeemed_on;
    redeemed_by := v_loan.redeemed_by;
    closure_balance_paise := v_loan.closure_balance_paise;
    already_redeemed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_loan.status <> 'active'::public.loan_status THEN
    RAISE EXCEPTION 'cannot redeem a loan that is not active (status=%)', v_loan.status;
  END IF;

  SELECT COALESCE(array_agg(i.id ORDER BY i.id), ARRAY[]::uuid[])
  INTO v_required
  FROM public.loan_items i
  WHERE i.loan_id = p_loan_id;

  SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::uuid[])
  INTO v_given
  FROM unnest(COALESCE(p_item_ids, ARRAY[]::uuid[])) AS x;

  IF v_required IS DISTINCT FROM v_given THEN
    RAISE EXCEPTION 'item_checklist: every pledged item must be checked, and only those items';
  END IF;

  SELECT b.total_due_paise, b.outstanding_principal_paise, b.accrued_interest_paise
  INTO v_due, v_principal, v_accrued
  FROM public.loan_balances_as_of(p_loan_id, p_redeemed_on) b;

  IF p_final_payment_paise > 0 THEN
    INSERT INTO public.payments (loan_id, amount_paid_paise, paid_on)
    VALUES (p_loan_id, p_final_payment_paise, p_redeemed_on);
  END IF;

  SELECT b.outstanding_principal_paise, b.accrued_interest_paise
  INTO v_principal, v_accrued
  FROM public.loan_balances_as_of(p_loan_id, p_redeemed_on) b;

  IF v_principal > 0 OR v_accrued > 0 THEN
    RAISE EXCEPTION 'balance_remaining: loan still has % paise principal and % paise interest due',
      v_principal, v_accrued;
  END IF;

  UPDATE public.loans
  SET
    status = 'redeemed'::public.loan_status,
    redeemed_on = p_redeemed_on,
    redeemed_by = auth.uid(),
    released_to_name = v_name,
    release_note = p_release_note,
    closure_balance_paise = v_due,
    release_signature_url = p_release_signature_url
  WHERE id = p_loan_id
  RETURNING * INTO v_loan;

  loan_id := v_loan.id;
  status := v_loan.status;
  redeemed_on := v_loan.redeemed_on;
  redeemed_by := v_loan.redeemed_by;
  closure_balance_paise := v_loan.closure_balance_paise;
  already_redeemed := false;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- renew_loan: interest-only payment + a new maturity, only after the simple
-- phase. Idempotent on (loan_id, renewed_on).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.renew_loan(
  p_loan_id uuid,
  p_renewed_on date,
  p_interest_paid_paise bigint,
  p_new_maturity_on date,
  p_note text DEFAULT NULL
)
RETURNS TABLE (
  renewal_id uuid,
  loan_id uuid,
  renewed_on date,
  interest_paid_paise bigint,
  new_maturity_on date,
  already_renewed boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_loan public.loans%ROWTYPE;
  v_existing public.loan_renewals%ROWTYPE;
  v_accrued bigint;
  v_due_on date;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'owner_only: only the owner may renew a loan';
  END IF;

  IF p_interest_paid_paise IS NULL OR p_interest_paid_paise < 0 THEN
    RAISE EXCEPTION 'interest payment cannot be negative';
  END IF;

  IF p_new_maturity_on <= p_renewed_on THEN
    RAISE EXCEPTION 'new maturity must be after the renewal date';
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'loan not found: %', p_loan_id;
  END IF;

  IF v_loan.status <> 'active'::public.loan_status THEN
    RAISE EXCEPTION 'cannot renew a loan that is not active (status=%)', v_loan.status;
  END IF;

  SELECT r.* INTO v_existing
  FROM public.loan_renewals r
  WHERE r.loan_id = p_loan_id AND r.renewed_on = p_renewed_on;

  IF FOUND THEN
    renewal_id := v_existing.id;
    loan_id := v_existing.loan_id;
    renewed_on := v_existing.renewed_on;
    interest_paid_paise := v_existing.interest_paid_paise;
    new_maturity_on := v_existing.new_maturity_on;
    already_renewed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COALESCE(
    (
      SELECT r.new_maturity_on
      FROM public.loan_renewals r
      WHERE r.loan_id = p_loan_id
      ORDER BY r.renewed_on DESC, r.created_at DESC
      LIMIT 1
    ),
    (v_loan.disbursed_on + v_loan.simple_period_days)::date
  )
  INTO v_due_on;

  -- RULES.md: interest-only renewal is offered after the 180-day (simple)
  -- period, i.e. strictly past the current due date.
  IF p_renewed_on <= v_due_on THEN
    RAISE EXCEPTION 'renewal is only offered after the simple period (due %)', v_due_on;
  END IF;

  SELECT b.accrued_interest_paise
  INTO v_accrued
  FROM public.loan_balances_as_of(p_loan_id, p_renewed_on) b;

  IF p_interest_paid_paise IS DISTINCT FROM v_accrued THEN
    RAISE EXCEPTION 'interest_only: payment must equal accrued interest (% paise), not %',
      v_accrued, p_interest_paid_paise;
  END IF;

  IF p_interest_paid_paise > 0 THEN
    INSERT INTO public.payments (loan_id, amount_paid_paise, paid_on)
    VALUES (p_loan_id, p_interest_paid_paise, p_renewed_on);
  END IF;

  INSERT INTO public.loan_renewals (
    loan_id, renewed_on, renewed_by, interest_paid_paise, new_maturity_on, note
  ) VALUES (
    p_loan_id, p_renewed_on, auth.uid(), p_interest_paid_paise, p_new_maturity_on, p_note
  )
  RETURNING * INTO v_existing;

  renewal_id := v_existing.id;
  loan_id := v_existing.loan_id;
  renewed_on := v_existing.renewed_on;
  interest_paid_paise := v_existing.interest_paid_paise;
  new_maturity_on := v_existing.new_maturity_on;
  already_renewed := false;
  RETURN NEXT;
END;
$$;

-- A renewal that only wrote loan_renewals would still look overdue, because
-- the original due date is disbursed_on + simple_period_days. Honour the
-- latest new_maturity_on when one exists.
CREATE OR REPLACE FUNCTION public.loans_overdue_as_of(
  p_as_of date DEFAULT ((timezone('Asia/Kolkata', now()))::date)
)
RETURNS TABLE (
  loan_id                      uuid,
  customer_id                  uuid,
  serial_number                text,
  disbursed_on                 date,
  due_on                       date,
  days_overdue                 integer,
  outstanding_principal_paise  bigint,
  accrued_interest_paise       bigint,
  total_due_paise              bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    l.id,
    l.customer_id,
    l.serial_number,
    l.disbursed_on,
    d.due_on,
    (p_as_of - d.due_on)::integer,
    b.outstanding_principal_paise,
    b.accrued_interest_paise,
    b.total_due_paise
  FROM public.loans l
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (
        SELECT r.new_maturity_on
        FROM public.loan_renewals r
        WHERE r.loan_id = l.id
        ORDER BY r.renewed_on DESC, r.created_at DESC
        LIMIT 1
      ),
      (l.disbursed_on + l.simple_period_days)::date
    ) AS due_on
  ) d
  CROSS JOIN LATERAL public.loan_balances_as_of(l.id, p_as_of) b
  WHERE l.status = 'active'::public.loan_status
    AND p_as_of > d.due_on
  ORDER BY d.due_on ASC;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_loan(uuid, date, text, uuid[], bigint, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.renew_loan(uuid, date, bigint, date, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.loans_overdue_as_of(date)
  TO authenticated, service_role;
