-- Owner conceal flag hides loans from staff, retail customers, and merchants.
begin;
select plan(12);

select tests.create_supabase_user('cl_owner');
select tests.create_supabase_user('cl_staff');
select tests.create_supabase_user('cl_retail');
select tests.create_supabase_user('cl_merchant');

update public.profiles set role = 'owner' where id = tests.get_supabase_uid('cl_owner');
update public.profiles set role = 'staff' where id = tests.get_supabase_uid('cl_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('cl_retail');
update public.profiles set role = 'merchant' where id = tests.get_supabase_uid('cl_merchant');

insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values
  (
    'c1000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('cl_retail'),
    'T190-R', 'Gold chain', 10.000, 'active',
    1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    tests.get_supabase_uid('cl_merchant'),
    'T190-M', 'Silver bar', 50.000, 'active',
    2000000, 150, DATE '2024-01-01', 'merchant', 180, 30, 0, 'pro_rata', 24
  );

select tests.authenticate_as('cl_staff');
select throws_ok(
  $$ select public.set_loans_concealed(true) $$,
  'owner_only: only the owner may conceal or reveal loans',
  'staff cannot conceal loans'
);

select tests.authenticate_as('cl_owner');
select is(
  public.set_loans_concealed(true),
  true,
  'owner can turn concealment on'
);

select tests.authenticate_as('cl_staff');
select is(
  public.loans_are_concealed(),
  true,
  'staff can read the conceal flag via RPC'
);
select is(
  (select count(*)::integer from public.loans),
  0,
  'staff sees no loans while concealed'
);
select throws_ok(
  $$
    insert into public.loans (
      customer_id, serial_number, item_name, weight_grams, status,
      principal_paise, rate_bps, disbursed_on, interest_model,
      simple_period_days, compound_every_days, grace_days,
      partial_period_mode, round_up_threshold_days
    ) values (
      tests.get_supabase_uid('cl_retail'),
      'T190-BLOCK', 'Blocked', 1.000, 'active',
      100000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "loans"',
  'staff cannot insert a loan while concealed'
);

select tests.authenticate_as('cl_retail');
select is(
  (select count(*)::integer from public.loans),
  0,
  'retail customer sees no loans while concealed'
);

select tests.authenticate_as('cl_merchant');
select is(
  (select count(*)::integer from public.loans),
  0,
  'merchant sees no loans while concealed'
);

select tests.authenticate_as('cl_owner');
select is(
  (select count(*)::integer from public.loans where serial_number like 'T190-%'),
  2,
  'owner still sees every loan while concealed'
);

select is(
  public.set_loans_concealed(false),
  false,
  'owner can turn concealment off'
);

select tests.authenticate_as('cl_staff');
select is(
  (select count(*)::integer from public.loans where serial_number like 'T190-%'),
  2,
  'staff sees loans again after reveal'
);

select tests.authenticate_as('cl_retail');
select is(
  (select count(*)::integer from public.loans where customer_id = tests.get_supabase_uid('cl_retail')),
  1,
  'retail customer sees own loan again after reveal'
);

select tests.authenticate_as('cl_merchant');
select is(
  (select count(*)::integer from public.loans where customer_id = tests.get_supabase_uid('cl_merchant')),
  1,
  'merchant sees own loan again after reveal'
);

select * from finish();
rollback;
