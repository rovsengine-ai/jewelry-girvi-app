-- create_loan inserts the loan and pledged items atomically; redeem_loan
-- refuses a loan with zero loan_items rather than treating {} as a match.
begin;
select plan(8);

select tests.create_supabase_user('ac_owner');
select tests.create_supabase_user('ac_staff');
select tests.create_supabase_user('ac_cust');

update public.profiles set role = 'owner'  where id = tests.get_supabase_uid('ac_owner');
update public.profiles set role = 'staff'  where id = tests.get_supabase_uid('ac_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('ac_cust');

-- A loan with no loan_items, inserted as the test role (bypasses RLS) so we can
-- prove redeem_loan refuses the empty checklist. create_loan cannot produce this.
insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values (
  '09000000-0000-4000-8000-000000000099', tests.get_supabase_uid('ac_cust'),
  'T090-NOITEMS', 'Missing items', 10.000, 'active',
  1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24
);

-- ---------------------------------------------------------------------------
-- 1. A customer cannot create a loan.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('ac_cust');

select throws_ok(
  $$
    select public.create_loan(
      tests.get_supabase_uid('ac_cust'),
      'T090-CUST',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[{"metal":"gold","ornament_type":"Gold chain","gross_weight_mg":10000,"net_weight_mg":10000,"quantity":1}]'::jsonb
    )
  $$,
  'shop_only: only shop users may create a loan',
  'a customer cannot create_loan'
);

-- ---------------------------------------------------------------------------
-- 2-3. Staff creates two items in one call; deprecated loan columns copy item 1.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('ac_staff');

select lives_ok(
  $$
    select public.create_loan(
      tests.get_supabase_uid('ac_cust'),
      'T090-OK',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[
        {"metal":"gold","ornament_type":"Gold chain","gross_weight_mg":10500,"net_weight_mg":10000,"stone_deduction_mg":500,"quantity":1},
        {"metal":"gold","ornament_type":"Gold ring","gross_weight_mg":4000,"net_weight_mg":4000,"quantity":1}
      ]'::jsonb
    )
  $$,
  'staff can create a loan with two pledged items'
);

select results_eq(
  $$
    select l.item_name, l.weight_grams, l.simple_period_days, l.round_up_threshold_days,
           (select count(*) from public.loan_items i where i.loan_id = l.id)
    from public.loans l
    where l.serial_number = 'T090-OK'
  $$,
  $$ values ('Gold chain'::text, 10.500::numeric, 180, 24, 2::bigint) $$,
  'item 1 fills deprecated loan columns and shop defaults are copied'
);

-- ---------------------------------------------------------------------------
-- 4-5. Empty items: refused, and no loan row is left behind.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$
    select public.create_loan(
      tests.get_supabase_uid('ac_cust'),
      'T090-EMPTY',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[]'::jsonb
    )
  $$,
  'items_required: create_loan needs at least one pledged item',
  'create_loan refuses an empty items array'
);

select is_empty(
  $$ select id from public.loans where serial_number = 'T090-EMPTY' $$,
  'refusing empty items does not leave a loan row'
);

-- ---------------------------------------------------------------------------
-- 6-7. A bad second item rolls back the loan insert (CHECK net <= gross).
-- ---------------------------------------------------------------------------
select throws_ok(
  $$
    select public.create_loan(
      tests.get_supabase_uid('ac_cust'),
      'T090-BAD',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[
        {"metal":"gold","ornament_type":"Gold chain","gross_weight_mg":10000,"net_weight_mg":10000,"quantity":1},
        {"metal":"gold","ornament_type":"Gold ring","gross_weight_mg":4000,"net_weight_mg":5000,"quantity":1}
      ]'::jsonb
    )
  $$,
  'new row for relation "loan_items" violates check constraint "loan_items_net_not_over_gross_chk"',
  'a failing item insert aborts create_loan'
);

select is_empty(
  $$ select id from public.loans where serial_number = 'T090-BAD' $$,
  'a failing item insert rolls back the loan row'
);

-- ---------------------------------------------------------------------------
-- 8. redeem_loan refuses a loan that has no pledged items, even with [].
-- ---------------------------------------------------------------------------
select tests.authenticate_as('ac_owner');

select throws_ok(
  $$
    select * from public.redeem_loan(
      '09000000-0000-4000-8000-000000000099'::uuid,
      DATE '2024-01-31',
      'Asha Patil',
      ARRAY[]::uuid[],
      1030000
    )
  $$,
  'item_checklist: loan has no pledged items; cannot redeem',
  'redeem_loan refuses an empty pledged-item set'
);

select tests.clear_authentication();
select * from finish();
rollback;
