-- Loan QR landing (/g/<public_token>): public mask only (last 4 of serial).
-- Full loan rows stay behind loans_select_own / loans_shop_select RLS.
-- Do not edit prior migrations.

CREATE OR REPLACE FUNCTION public.loan_receipt_mask_by_public_token(p_token text)
RETURNS TABLE (serial_last4 text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := btrim(COALESCE(p_token, ''));
BEGIN
  -- Opaque lookup only. Never return amount, name, items, dates, or ids.
  IF v_token = '' OR char_length(v_token) > 256 THEN
    RETURN;
  END IF;

  IF position('/' in v_token) > 0
     OR position(E'\\' in v_token) > 0
     OR position('..' in v_token) > 0
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT right(l.serial_number, 4)
  FROM public.loans l
  WHERE l.public_token = v_token
    AND l.archived_at IS NULL
    AND NOT public.loans_are_concealed()
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.loan_receipt_mask_by_public_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.loan_receipt_mask_by_public_token(text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.loan_receipt_mask_by_public_token(text) IS
  'Public loan QR landing: last 4 of serial_number only. No grant of full loan rows.';
