-- update_shop_defaults: owner-only; staff refused; existing loans untouched.
begin;
select plan(5);

select tests.create_supabase_user('sd_owner');
select tests.create_supabase_user('sd_staff');
select tests.create_supabase_user('sd_cust');

update public.profiles set role = 'owner'  where id = tests.get_supabase_uid('sd_owner');
update public.profiles set role = 'staff'  where id = tests.get_supabase_uid('sd_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('sd_cust');

insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values (
  'ff000000-0000-4000-8000-000000000001', tests.get_supabase_uid('sd_cust'),
  'T140-A', 'Gold chain', 10.000, 'active',
  1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24
);

select tests.authenticate_as('sd_staff');

select throws_ok(
  $$
    select rate_bps from public.update_shop_defaults(
      400,
      'pro_rata'::public.partial_period_mode,
      20,
      180,
      30,
      0
    )
  $$,
  'owner_only: only the owner may edit shop defaults',
  'staff cannot update shop defaults'
);

select tests.authenticate_as('sd_cust');

select throws_ok(
  $$
    select rate_bps from public.update_shop_defaults(
      400,
      'pro_rata'::public.partial_period_mode,
      20,
      180,
      30,
      0
    )
  $$,
  'owner_only: only the owner may edit shop defaults',
  'a customer cannot update shop defaults'
);

select tests.authenticate_as('sd_owner');

select results_eq(
  $$
    select rate_bps, round_up_threshold_days, partial_period_mode::text
    from public.update_shop_defaults(
      400,
      'pro_rata'::public.partial_period_mode,
      20,
      180,
      30,
      0
    )
  $$,
  $$ values (400, 20, 'pro_rata') $$,
  'owner can update shop defaults'
);

select is(
  (select rate_bps from public.shop_defaults where id = 1),
  400,
  'the single shop_defaults row was written'
);

select is(
  (select rate_bps from public.loans
    where id = 'ff000000-0000-4000-8000-000000000001'),
  300,
  'changing shop defaults does not rewrite an existing loan'
);

select tests.clear_authentication();
select * from finish();
rollback;
