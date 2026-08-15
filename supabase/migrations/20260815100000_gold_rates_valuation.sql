-- Gate D: gold valuation frozen at create time from gold_rates.
-- Owner decision (2026-08-15): silver is weight-only (no millesimal, no
-- valuation). Live feed is GoldAPI or metals.dev, always labelled not IBJA,
-- plus an owner manual override. Bands are millesimal 999 / 916 / 750 (18K =
-- 75%), not karat/24 on a 24K price. Wastage none. LTV none — principal stays
-- whatever staff types; valuation is an assessed figure, not a cap.

CREATE TABLE public.gold_rates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quoted_on             date NOT NULL,
  purity_millesimal     smallint NOT NULL,
  source                text NOT NULL,
  price_per_10g_paise   bigint NOT NULL,
  fetched_at            timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by            uuid REFERENCES public.profiles (id),
  CONSTRAINT gold_rates_millesimal_chk CHECK (
    purity_millesimal IN (999, 916, 750, 585, 417)
  ),
  CONSTRAINT gold_rates_source_chk CHECK (
    source IN ('goldapi', 'metals_dev', 'manual')
  ),
  CONSTRAINT gold_rates_price_chk CHECK (price_per_10g_paise > 0),
  CONSTRAINT gold_rates_quoted_purity_source_key
    UNIQUE (quoted_on, purity_millesimal, source)
);

COMMENT ON TABLE public.gold_rates IS
  'Shop gold quotes. NEVER IBJA. Feed rows come from GoldAPI or metals.dev; '
  'source=manual is an owner override. UI must label every figure not IBJA.';

COMMENT ON COLUMN public.gold_rates.price_per_10g_paise IS
  'Integer paise per 10 grams of this millesimal. Newspaper unit. Not IBJA.';

CREATE INDEX gold_rates_quoted_on_idx
  ON public.gold_rates (quoted_on, purity_millesimal);

ALTER TABLE public.gold_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gold_rates_shop_select"
  ON public.gold_rates FOR SELECT TO authenticated
  USING (public.is_shop_user());

CREATE POLICY "gold_rates_owner_insert"
  ON public.gold_rates FOR INSERT TO authenticated
  WITH CHECK (public.is_owner());

CREATE POLICY "gold_rates_owner_update"
  ON public.gold_rates FOR UPDATE TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY "gold_rates_owner_delete"
  ON public.gold_rates FOR DELETE TO authenticated
  USING (public.is_owner());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gold_rates TO authenticated;
GRANT ALL ON public.gold_rates TO postgres, service_role;

ALTER TABLE public.loan_items
  ADD COLUMN gold_rate_id uuid REFERENCES public.gold_rates (id);

COMMENT ON COLUMN public.loan_items.gold_rate_id IS
  'Rate row frozen into valuation_paise at insert. NULL when unvalued '
  '(silver, unassessed gold, or no quote for disbursed_on).';

COMMENT ON COLUMN public.loan_items.valuation_paise IS
  'Assessed gold value frozen at insert. NULL when purity is NULL (including '
  'all silver). Not a loan cap. Wastage and LTV are not applied.';

-- Karat → millesimal. 22K is 916 not 22/24. 18K is 750 (75%). Unknown karat
-- returns NULL so we never invent a band.
CREATE FUNCTION public.gold_karat_to_millesimal(p_karat smallint)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_karat
    WHEN 24 THEN 999::smallint
    WHEN 22 THEN 916::smallint
    WHEN 18 THEN 750::smallint
    WHEN 14 THEN 585::smallint
    WHEN 10 THEN 417::smallint
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.gold_karat_to_millesimal(smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gold_karat_to_millesimal(smallint)
  TO authenticated, service_role;

-- Pick the rate row for a shop date + millesimal. Manual beats any feed.
-- SETOF so a miss is zero rows (RETURNS gold_rates would yield a null composite).
CREATE FUNCTION public.resolve_gold_rate(
  p_quoted_on date,
  p_millesimal smallint
)
RETURNS SETOF public.gold_rates
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT g.*
  FROM public.gold_rates g
  WHERE g.quoted_on = p_quoted_on
    AND g.purity_millesimal = p_millesimal
  ORDER BY (g.source = 'manual') DESC, g.fetched_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_gold_rate(date, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_gold_rate(date, smallint)
  TO authenticated, service_role;

-- Half-up once. Matching-band price: net_mg × price_10g / 10_000.
-- Derived from 999: net_mg × millesimal × price_999_10g / 10_000_000.
CREATE FUNCTION public.assess_gold_item_valuation(
  p_net_weight_mg bigint,
  p_purity_karat smallint,
  p_as_of date
)
RETURNS TABLE (
  valuation_paise bigint,
  gold_rate_id uuid
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_m smallint;
  v_exact public.gold_rates%ROWTYPE;
  v_base public.gold_rates%ROWTYPE;
BEGIN
  IF p_net_weight_mg IS NULL OR p_net_weight_mg <= 0 OR p_purity_karat IS NULL THEN
    RETURN;
  END IF;

  v_m := public.gold_karat_to_millesimal(p_purity_karat);
  IF v_m IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_exact FROM public.resolve_gold_rate(p_as_of, v_m);
  IF v_exact.id IS NOT NULL THEN
    valuation_paise := public.div_round_half_up(
      p_net_weight_mg * v_exact.price_per_10g_paise,
      10000
    );
    gold_rate_id := v_exact.id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_m = 999 THEN
    RETURN;
  END IF;

  SELECT * INTO v_base FROM public.resolve_gold_rate(p_as_of, 999::smallint);
  IF v_base.id IS NULL THEN
    RETURN;
  END IF;

  valuation_paise := public.div_round_half_up(
    p_net_weight_mg * v_m::bigint * v_base.price_per_10g_paise,
    10000000
  );
  gold_rate_id := v_base.id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.assess_gold_item_valuation(bigint, smallint, date)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assess_gold_item_valuation(bigint, smallint, date)
  TO authenticated, service_role;

CREATE FUNCTION public.loan_items_apply_valuation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_as_of date;
  v_row record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.valuation_paise IS DISTINCT FROM NEW.valuation_paise
       OR OLD.gold_rate_id IS DISTINCT FROM NEW.gold_rate_id THEN
      RAISE EXCEPTION 'valuation_frozen: pledged item valuation cannot be changed after insert';
    END IF;
    RETURN NEW;
  END IF;

  NEW.valuation_paise := NULL;
  NEW.gold_rate_id := NULL;

  IF NEW.metal IS DISTINCT FROM 'gold' OR NEW.purity_karat IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.disbursed_on INTO v_as_of
  FROM public.loans l
  WHERE l.id = NEW.loan_id;

  IF v_as_of IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.valuation_paise, a.gold_rate_id
  INTO v_row
  FROM public.assess_gold_item_valuation(
    NEW.net_weight_mg,
    NEW.purity_karat,
    v_as_of
  ) AS a;

  IF v_row.gold_rate_id IS NOT NULL THEN
    NEW.valuation_paise := v_row.valuation_paise;
    NEW.gold_rate_id := v_row.gold_rate_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loan_items_apply_valuation ON public.loan_items;
CREATE TRIGGER loan_items_apply_valuation
  BEFORE INSERT OR UPDATE ON public.loan_items
  FOR EACH ROW
  EXECUTE FUNCTION public.loan_items_apply_valuation();

REVOKE ALL ON FUNCTION public.loan_items_apply_valuation() FROM PUBLIC;

-- Owner types a newspaper-style ₹/10g figure (already paise) for one band.
CREATE FUNCTION public.set_manual_gold_rate(
  p_quoted_on date,
  p_millesimal integer,
  p_price_per_10g_paise bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'owner_only: only the owner may set a manual gold rate';
  END IF;

  IF p_quoted_on IS NULL THEN
    RAISE EXCEPTION 'quoted_on is required';
  END IF;

  IF p_millesimal NOT IN (999, 916, 750, 585, 417) THEN
    RAISE EXCEPTION 'millesimal must be 999, 916, 750, 585, or 417';
  END IF;

  IF p_price_per_10g_paise IS NULL OR p_price_per_10g_paise <= 0 THEN
    RAISE EXCEPTION 'price_per_10g_paise must be a positive integer';
  END IF;

  INSERT INTO public.gold_rates (
    quoted_on,
    purity_millesimal,
    source,
    price_per_10g_paise,
    created_by
  ) VALUES (
    p_quoted_on,
    p_millesimal,
    'manual',
    p_price_per_10g_paise,
    auth.uid()
  )
  ON CONFLICT (quoted_on, purity_millesimal, source)
  DO UPDATE SET
    price_per_10g_paise = EXCLUDED.price_per_10g_paise,
    fetched_at = timezone('utc', now()),
    created_by = EXCLUDED.created_by
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_manual_gold_rate(date, integer, bigint)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_manual_gold_rate(date, integer, bigint)
  TO authenticated, service_role;
