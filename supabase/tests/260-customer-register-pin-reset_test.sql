-- Customer self-register helpers + admin PIN reset. Mirrors 200-customer-pin-login.
begin;
select plan(10);

select tests.create_supabase_user('reg_owner');
select tests.create_supabase_user('reg_staff');
select tests.create_supabase_user('reg_cust');
select tests.create_supabase_user('reg_other');

update public.profiles set role = 'owner'
  where id = tests.get_supabase_uid('reg_owner');
update public.profiles set role = 'staff'
  where id = tests.get_supabase_uid('reg_staff');
update public.profiles
  set role = 'retail_customer',
      phone_number = public.normalize_phone_e164('9000000201')
  where id = tests.get_supabase_uid('reg_cust');
update public.profiles
  set role = 'retail_customer',
      phone_number = public.normalize_phone_e164('9000000202')
  where id = tests.get_supabase_uid('reg_other');

-- set_customer_pin_for_profile is not callable by authenticated clients
select tests.authenticate_as('reg_cust');

select throws_ok(
  $$
    select public.set_customer_pin_for_profile(
      tests.get_supabase_uid('reg_cust'),
      '582914'
    )
  $$,
  '42501',
  NULL,
  'customers cannot call set_customer_pin_for_profile'
);

-- service_role path (postgres) can set PIN for a customer without credentials
select tests.clear_authentication();
select set_config('role', 'postgres', true);

select lives_ok(
  $$
    select public.set_customer_pin_for_profile(
      tests.get_supabase_uid('reg_cust'),
      '582914'
    )
  $$,
  'service path CAN set customer PIN for profile'
);

select is(
  (select count(*)::integer from public.customer_credentials
    where profile_id = tests.get_supabase_uid('reg_cust')),
  1,
  'set_customer_pin_for_profile wrote credentials'
);

select lives_ok(
  $$
    select public.set_customer_pin_for_profile(
      tests.get_supabase_uid('reg_owner'),
      '582914'
    )
  $$,
  'service path CAN set PIN on owner profile'
);

-- admin_reset_customer_pin
select tests.authenticate_as('reg_staff');

select lives_ok(
  $$
    select public.admin_reset_customer_pin(tests.get_supabase_uid('reg_cust'))
  $$,
  'staff CAN reset customer PIN'
);

select is(
  (select count(*)::integer from public.customer_credentials
    where profile_id = tests.get_supabase_uid('reg_cust')),
  0,
  'admin_reset_customer_pin removes credentials row'
);

select tests.authenticate_as('reg_cust');

select throws_ok(
  $$
    select public.admin_reset_customer_pin(tests.get_supabase_uid('reg_other'))
  $$,
  'shop_only: only owner or staff may reset a customer PIN',
  'customer cannot reset another customer PIN'
);

select tests.authenticate_as('reg_other');

select throws_ok(
  $$
    select public.admin_reset_customer_pin(tests.get_supabase_uid('reg_cust'))
  $$,
  'shop_only: only owner or staff may reset a customer PIN',
  'customer cannot call admin_reset_customer_pin'
);

select tests.authenticate_as('reg_staff');

select throws_ok(
  $$
    select public.admin_reset_customer_pin(tests.get_supabase_uid('reg_owner'))
  $$,
  'forbidden: cannot reset PIN for a shop account',
  'staff cannot reset owner PIN'
);

select * from finish();
rollback;
