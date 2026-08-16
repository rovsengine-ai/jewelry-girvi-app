-- =============================================================================
-- unredeem_loan: owner-only revert of a mistaken redemption back to active.
-- Clears the redemption audit columns, reverses the closing payment (latest
-- payment on redeemed_on), and writes loan_unredeem_events. Staff are refused.
-- Archived loans must be unarchived first so the live book stays consistent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.loan_unredeem_events (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id                     uuid NOT NULL REFERENCES public.loans (id) ON DELETE RESTRICT,
  acted_by                    uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  reason                      text NOT NULL,
  previous_redeemed_on        date NOT NULL,
  previous_closure_balance_paise bigint NOT NULL,
  reversed_payment_id         uuid,
  created_at                  timestamptz NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT loan_unredeem_events_reason_chk CHECK (length(btrim(reason)) > 0),
  CONSTRAINT loan_unredeem_events_balance_chk CHECK (previous_closure_balance_paise >= 0)
);

CREATE INDEX IF NOT EXISTS loan_unredeem_events_loan_id_idx
  ON public.loan_unredeem_events (loan_id, created_at DESC);

ALTER TABLE public.loan_unredeem_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loan_unredeem_events_select_owner" ON public.loan_unredeem_events;
CREATE POLICY "loan_unredeem_events_select_owner"
  ON public.loan_unredeem_events FOR SELECT TO authenticated
  USING (public.is_owner());

DROP POLICY IF EXISTS "loan_unredeem_events_insert_owner" ON public.loan_unredeem_events;
CREATE POLICY "loan_unredeem_events_insert_owner"
  ON public.loan_unredeem_events FOR INSERT TO authenticated
  WITH CHECK (public.is_owner() AND acted_by = auth.uid());

GRANT SELECT, INSERT ON public.loan_unredeem_events TO authenticated;
GRANT ALL ON public.loan_unredeem_events TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.unredeem_loan(
  p_loan_id uuid,
  p_reason text
)
RETURNS TABLE (
  loan_id uuid,
  status public.loan_status,
  reversed_payment_id uuid
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_loan public.loans%ROWTYPE;
  v_reason text;
  v_payment_id uuid;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'owner_only: only the owner may revert a redemption';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'unredeem_reason is required';
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'loan not found: %', p_loan_id;
  END IF;

  IF v_loan.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'unarchive the loan before reverting redemption';
  END IF;

  IF v_loan.status <> 'redeemed'::public.loan_status THEN
    RAISE EXCEPTION 'cannot unredeem a loan that is not redeemed (status=%)', v_loan.status;
  END IF;

  IF v_loan.redeemed_on IS NULL OR v_loan.closure_balance_paise IS NULL THEN
    RAISE EXCEPTION 'redeemed loan is missing audit columns: %', p_loan_id;
  END IF;

  SELECT p.id
  INTO v_payment_id
  FROM public.payments p
  WHERE p.loan_id = p_loan_id
    AND p.paid_on = v_loan.redeemed_on
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT 1;

  IF v_payment_id IS NOT NULL THEN
    DELETE FROM public.payments WHERE id = v_payment_id;
  END IF;

  INSERT INTO public.loan_unredeem_events (
    loan_id,
    acted_by,
    reason,
    previous_redeemed_on,
    previous_closure_balance_paise,
    reversed_payment_id
  ) VALUES (
    v_loan.id,
    auth.uid(),
    v_reason,
    v_loan.redeemed_on,
    v_loan.closure_balance_paise,
    v_payment_id
  );

  UPDATE public.loans
  SET
    status = 'active'::public.loan_status,
    redeemed_on = NULL,
    redeemed_by = NULL,
    released_to_name = NULL,
    release_note = NULL,
    closure_balance_paise = NULL,
    release_signature_url = NULL
  WHERE id = p_loan_id;

  loan_id := p_loan_id;
  status := 'active'::public.loan_status;
  reversed_payment_id := v_payment_id;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unredeem_loan(uuid, text)
  TO authenticated, service_role;
