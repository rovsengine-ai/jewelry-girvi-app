-- Gold quotes and frozen market valuation are gone.
begin;
select plan(8);

select hasnt_table(
  'public',
  'gold_rates',
  'gold_rates table is dropped'
);

select hasnt_column(
  'public',
  'loan_items',
  'gold_rate_id',
  'loan_items has no gold_rate_id'
);

select hasnt_column(
  'public',
  'loan_items',
  'valuation_paise',
  'loan_items has no valuation_paise'
);

select hasnt_function(
  'public',
  'set_manual_gold_rate',
  'set_manual_gold_rate is dropped'
);

select hasnt_function(
  'public',
  'resolve_gold_rate',
  'resolve_gold_rate is dropped'
);

select hasnt_function(
  'public',
  'assess_gold_item_valuation',
  'assess_gold_item_valuation is dropped'
);

select hasnt_function(
  'public',
  'gold_karat_to_millesimal',
  'gold_karat_to_millesimal is dropped'
);

select hasnt_function(
  'public',
  'loan_items_apply_valuation',
  'loan_items_apply_valuation is dropped'
);

select * from finish();
rollback;
