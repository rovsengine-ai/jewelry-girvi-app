-- =============================================================================
-- update_shop_defaults: owner-only write of the single shop_defaults row.
--
-- v1 is one shop (CHECK id = 1). Screens must not .eq('id', 1); they call this
-- RPC. When a shops table lands, this function gains p_shop_id and that CHECK
-- is dropped in the same migration.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_shop_defaults(
  p_rate_bps integer,
  p_partial_period_mode public.partial_period_mode,
  p_round_up_threshold_days integer,
  p_simple_period_days integer,
  p_compound_every_days integer,
  p_grace_days integer
)
RETURNS public.shop_defaults
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.shop_defaults%ROWTYPE;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'owner_only: only the owner may edit shop defaults';
  END IF;

  UPDATE public.shop_defaults
  SET
    rate_bps = p_rate_bps,
    partial_period_mode = p_partial_period_mode,
    round_up_threshold_days = p_round_up_threshold_days,
    simple_period_days = p_simple_period_days,
    compound_every_days = p_compound_every_days,
    grace_days = p_grace_days
  WHERE id = 1
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'shop_defaults row missing';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_shop_defaults(
  integer,
  public.partial_period_mode,
  integer,
  integer,
  integer,
  integer
) TO authenticated, service_role;
