-- Gold valuation: millesimal bands, silver never valued, missing rate does
-- not block create_loan, valuation freezes at insert.
--
-- Worked example (hand-computed):
--   24K quote = 151493 rupees / 10g = 15,149,300 paise / 10g
--   10.000 g net = 10_000 mg, 22K → 916
--   derived: div_round_half_up(10000 * 916 * 15149300, 10000000)
--          = 13,876,758.8 → 13,876,759 paise
--   18K → 750 (75%): div_round_half_up(10000 * 750 * 15149300, 10000000)
--          = 11,361,975 paise
--   matching 916 row 13,876,800 paise/10g: div_round_half_up(10000 * 13876800, 10000)
--          = 13,876,800 paise
begin;
select plan(16);

select tests.create_supabase_user('gr_owner');
select tests.create_supabase_user('gr_staff');
select tests.create_supabase_user('gr_cust');

update public.profiles set role = 'owner' where id = tests.get_supabase_uid('gr_owner');
update public.profiles set role = 'staff' where id = tests.get_supabase_uid('gr_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('gr_cust');

select is(public.gold_karat_to_millesimal(24::smallint), 999::smallint, '24K → 999');
select is(public.gold_karat_to_millesimal(22::smallint), 916::smallint, '22K → 916 not 22/24');
select is(public.gold_karat_to_millesimal(18::smallint), 750::smallint, '18K → 750 (75%)');
select is(public.gold_karat_to_millesimal(21::smallint), NULL::smallint, 'unmapped karat is not invented');

insert into public.gold_rates (
  id, quoted_on, purity_millesimal, source, price_per_10g_paise
) values (
  '12000000-0000-4000-8000-000000000999',
  DATE '2024-01-01',
  999,
  'goldapi',
  15149300
);

select is(
  public.div_round_half_up(10000::bigint * 916 * 15149300, 10000000),
  13876759::bigint,
  '10g 22K derived from 999: 13,876,759 paise'
);

select is(
  public.div_round_half_up(10000::bigint * 750 * 15149300, 10000000),
  11361975::bigint,
  '10g 18K (75%) derived from 999: 11,361,975 paise'
);

select tests.authenticate_as('gr_staff');

select lives_ok(
  $$
    select public.create_loan(
      tests.get_supabase_uid('gr_cust'),
      'T120-NORATE',
      null,
      1000000,
      300,
      DATE '2024-06-01',
      'retail'::public.interest_model,
      null,
      '[{"metal":"gold","ornament_type":"Chain","gross_weight_mg":10000,"net_weight_mg":10000,"purity_karat":22,"quantity":1}]'::jsonb
    )
  $$,
  'missing rate never blocks create_loan'
);

select is(
  (
    select i.valuation_paise
    from public.loan_items i
    join public.loans l on l.id = i.loan_id
    where l.serial_number = 'T120-NORATE'
  ),
  NULL::bigint,
  'gold with no quote for disbursed_on stays unvalued'
);

select lives_ok(
  $$
    select public.create_loan(
      tests.get_supabase_uid('gr_cust'),
      'T120-VALUED',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[
        {"metal":"gold","ornament_type":"Chain","gross_weight_mg":10000,"net_weight_mg":10000,"purity_karat":22,"quantity":1},
        {"metal":"gold","ornament_type":"Bangle","gross_weight_mg":10000,"net_weight_mg":10000,"purity_karat":18,"quantity":1},
        {"metal":"gold","ornament_type":"Unset","gross_weight_mg":10000,"net_weight_mg":10000,"purity_karat":null,"quantity":1},
        {"metal":"silver","ornament_type":"Payal","gross_weight_mg":40000,"net_weight_mg":40000,"purity_karat":22,"quantity":1}
      ]'::jsonb
    )
  $$,
  'create_loan with a 999 quote values mapped gold and skips the rest'
);

select results_eq(
  $$
    select i.ornament_type, i.valuation_paise, i.purity_karat
    from public.loan_items i
    join public.loans l on l.id = i.loan_id
    where l.serial_number = 'T120-VALUED'
    order by i.position
  $$,
  $$ values
    ('Chain'::text, 13876759::bigint, 22::smallint),
    ('Bangle'::text, 11361975::bigint, 18::smallint),
    ('Unset'::text, NULL::bigint, NULL::smallint),
    ('Payal'::text, NULL::bigint, NULL::smallint)
  $$,
  '22K and 18K freeze from 999; unassessed gold and silver stay NULL'
);

select throws_ok(
  $$
    update public.loan_items
    set valuation_paise = 1
    where loan_id = (
      select id from public.loans where serial_number = 'T120-VALUED' limit 1
    )
  $$,
  'valuation_frozen: pledged item valuation cannot be changed after insert',
  'frozen valuation cannot be rewritten'
);

select tests.clear_authentication();
select tests.authenticate_as('gr_cust');

select throws_ok(
  $$
    select public.set_manual_gold_rate(DATE '2024-01-01', 999, 10000000)
  $$,
  'owner_only: only the owner may set a manual gold rate',
  'customers cannot write a manual rate'
);

select tests.clear_authentication();
select tests.authenticate_as('gr_staff');

select throws_ok(
  $$
    select public.set_manual_gold_rate(DATE '2024-01-01', 999, 10000000)
  $$,
  'owner_only: only the owner may set a manual gold rate',
  'staff cannot write a manual rate'
);

select tests.clear_authentication();
select tests.authenticate_as('gr_owner');

select lives_ok(
  $$
    select public.set_manual_gold_rate(DATE '2024-01-02', 916, 13876800)
  $$,
  'owner may set a 916 manual override'
);

select tests.clear_authentication();
select tests.authenticate_as('gr_staff');

select lives_ok(
  $$
    select public.create_loan(
      tests.get_supabase_uid('gr_cust'),
      'T120-MANUAL916',
      null,
      1000000,
      300,
      DATE '2024-01-02',
      'retail'::public.interest_model,
      null,
      '[{"metal":"gold","ornament_type":"Ring","gross_weight_mg":10000,"net_weight_mg":10000,"purity_karat":22,"quantity":1}]'::jsonb
    )
  $$,
  'manual 916 band is used when present'
);

select is(
  (
    select i.valuation_paise
    from public.loan_items i
    join public.loans l on l.id = i.loan_id
    where l.serial_number = 'T120-MANUAL916'
  ),
  13876800::bigint,
  'matching 916 row: 10g → 13,876,800 paise (no extra 22/24)'
);

select tests.clear_authentication();
select * from finish();
rollback;
