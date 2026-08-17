-- Duplicate serials raise serial_exists:; find_loan_by_serial is shop-only
-- and still returns archived rows.
begin;
select plan(11);

select tests.create_supabase_user('sn_owner');
select tests.create_supabase_user('sn_staff');
select tests.create_supabase_user('sn_cust');

update public.profiles set role = 'owner'  where id = tests.get_supabase_uid('sn_owner');
update public.profiles set role = 'staff'  where id = tests.get_supabase_uid('sn_staff');
update public.profiles
set role = 'retail_customer', full_name = 'Asha Patil'
where id = tests.get_supabase_uid('sn_cust');

insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days,
  redeemed_on, closure_balance_paise
) values (
  '18000000-0000-4000-8000-000000000001', tests.get_supabase_uid('sn_cust'),
  'T180-R', 'Gold chain', 10.000, 'redeemed',
  1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24,
  DATE '2024-01-31', 1030000
);

insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values (
  '18000000-0000-4000-8000-000000000002', tests.get_supabase_uid('sn_cust'),
  'T180-ARCH', 'Gold ring', 4.000, 'active',
  500000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24
);

select tests.authenticate_as('sn_staff');

select lives_ok(
  $$
    select * from public.create_loan(
      tests.get_supabase_uid('sn_cust'),
      'T180-A',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[{"metal":"gold","ornament_type":"Chain","gross_weight_mg":10000,"net_weight_mg":10000,"quantity":1}]'::jsonb
    )
  $$,
  'staff can create the first serial'
);

select throws_ok(
  $$
    select * from public.create_loan(
      tests.get_supabase_uid('sn_cust'),
      'T180-A',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[{"metal":"gold","ornament_type":"Chain","gross_weight_mg":10000,"net_weight_mg":10000,"quantity":1}]'::jsonb
    )
  $$,
  'serial_exists: T180-A',
  'second create_loan with the same serial raises serial_exists'
);

select lives_ok(
  $$
    select * from public.create_loan(
      tests.get_supabase_uid('sn_cust'),
      '102031',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[{"metal":"gold","ornament_type":"Chain","gross_weight_mg":10000,"net_weight_mg":10000,"quantity":1}]'::jsonb
    )
  $$,
  'staff can create trimmed serial 102031'
);

select throws_ok(
  $$
    select * from public.create_loan(
      tests.get_supabase_uid('sn_cust'),
      ' 102031 ',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[{"metal":"gold","ornament_type":"Chain","gross_weight_mg":10000,"net_weight_mg":10000,"quantity":1}]'::jsonb
    )
  $$,
  'serial_exists: 102031',
  'padded serial collides with the trimmed stored value'
);

select throws_ok(
  $$
    select * from public.create_loan(
      tests.get_supabase_uid('sn_cust'),
      'T180-R',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[{"metal":"gold","ornament_type":"Chain","gross_weight_mg":10000,"net_weight_mg":10000,"quantity":1}]'::jsonb
    )
  $$,
  'serial_exists: T180-R',
  'a redeemed loan serial cannot be reused'
);

select tests.authenticate_as('sn_owner');

select lives_ok(
  $$
    select * from public.archive_loan(
      '18000000-0000-4000-8000-000000000002'::uuid,
      'Books closed'
    )
  $$,
  'owner can archive T180-ARCH'
);

select tests.authenticate_as('sn_staff');

select throws_ok(
  $$
    select * from public.create_loan(
      tests.get_supabase_uid('sn_cust'),
      'T180-ARCH',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[{"metal":"gold","ornament_type":"Chain","gross_weight_mg":10000,"net_weight_mg":10000,"quantity":1}]'::jsonb
    )
  $$,
  'serial_exists: T180-ARCH',
  'an archived loan serial cannot be reused'
);

select tests.authenticate_as('sn_cust');

select throws_ok(
  $$ select * from public.find_loan_by_serial('T180-A') $$,
  'shop_only: only shop users may look up a loan by serial',
  'a customer cannot find_loan_by_serial'
);

select tests.authenticate_as('sn_staff');

select results_eq(
  $$
    select serial_number, status::text, is_archived, customer_name
    from public.find_loan_by_serial('T180-A')
  $$,
  $$ values ('T180-A'::text, 'active'::text, false, 'Asha Patil'::text) $$,
  'staff can find a live serial'
);

select results_eq(
  $$
    select loan_id, serial_number, status::text, is_archived, customer_name
    from public.find_loan_by_serial('T180-ARCH')
  $$,
  $$ values (
    '18000000-0000-4000-8000-000000000002'::uuid,
    'T180-ARCH'::text,
    'active'::text,
    true,
    'Asha Patil'::text
  ) $$,
  'find_loan_by_serial returns an archived loan for staff'
);

select results_eq(
  $$
    select serial_number
    from public.find_loan_by_serial(' 102031 ')
  $$,
  $$ values ('102031'::text) $$,
  'find_loan_by_serial trims before matching'
);

select * from finish();
rollback;
