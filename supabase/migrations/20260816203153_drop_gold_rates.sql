-- Remove shop gold quotes and frozen market valuation.
-- Do not edit 20260815100000_gold_rates_valuation.sql.

DROP TRIGGER IF EXISTS loan_items_apply_valuation ON public.loan_items;

DROP FUNCTION IF EXISTS public.loan_items_apply_valuation();
DROP FUNCTION IF EXISTS public.assess_gold_item_valuation(bigint, smallint, date);
DROP FUNCTION IF EXISTS public.resolve_gold_rate(date, smallint);
DROP FUNCTION IF EXISTS public.set_manual_gold_rate(date, integer, bigint);
DROP FUNCTION IF EXISTS public.gold_karat_to_millesimal(smallint);
DROP FUNCTION IF EXISTS public.invoke_refresh_gold_rate();

ALTER TABLE public.loan_items
  DROP COLUMN IF EXISTS gold_rate_id,
  DROP COLUMN IF EXISTS valuation_paise;

DROP TABLE IF EXISTS public.gold_rates;
