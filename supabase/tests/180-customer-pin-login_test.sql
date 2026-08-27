-- Customer PIN + login_token RPCs, exercised through real impersonated sessions
-- rather than by reading policy definitions. Style mirrors
-- 050-rls-and-permissions_test.sql.
begin;
select plan(17);

-- ---------------------------------------------------------------------------
-- Fixtures (created as the superuser test role, which bypasses RLS).
-- ---------------------------------------------------------------------------
select tests.create_supabase_user('cpl_owner');
select tests.create_supabase_user('cpl_staff');
select tests.create_supabase_user('cpl_cust');
select tests.create_supabase_user('cpl_other');

update public.profiles set role = 'owner'
  where id = tests.get_supabase_uid('cpl_owner');
update public.profiles set role = 'staff'
  where id = tests.get_supabase_uid('cpl_staff');
update public.profiles
  set role = 'retail_customer',
      phone_number = public.normalize_phone_e164('9000000203')
  where id = tests.get_supabase_uid('cpl_cust');
update public.profiles
  set role = 'retail_customer',
      phone_number = public.normalize_phone_e164('9000000204')
  where id = tests.get_supabase_uid('cpl_other');

insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values (
  'a1800000-0000-4000-8000-000000000001',
  tests.get_supabase_uid('cpl_cust'),
  'T180-CPL', 'Gold chain', 10.000, 'active',
  1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0,
  'min_month_then_pro_rata', 24
);

-- ---------------------------------------------------------------------------
-- 1-2. A customer must not touch credentials or issue QR grants.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('cpl_cust');

select throws_ok(
  $$ select pin_hash from public.customer_credentials $$,
  '42501',
  NULL,
  'a customer cannot SELECT customer_credentials'
);

select throws_ok(
  $$
    select public.issue_login_token(
      tests.get_supabase_uid('cpl_cust'),
      'a1800000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'shop_only: only owner or staff may issue a login token',
  'a customer cannot call issue_login_token'
);

-- ---------------------------------------------------------------------------
-- 3-6. Staff can issue; used and expired tokens share one refusal message.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('cpl_staff');

select lives_ok(
  $$
    select set_config(
      'test.cpl_token',
      public.issue_login_token(
        tests.get_supabase_uid('cpl_cust'),
        'a1800000-0000-4000-8000-000000000001'::uuid
      ),
      true
    )
  $$,
  'staff CAN issue a login token'
);

select lives_ok(
  $$
    select profile_id, loan_id
    from public.redeem_login_token(current_setting('test.cpl_token'))
  $$,
  'staff-issued token can be redeemed once'
);

select throws_ok(
  $$ select * from public.redeem_login_token(current_setting('test.cpl_token')) $$,
  'invalid_token: token is invalid or expired',
  'a used token is refused a second time'
);

select lives_ok(
  $$
    select set_config(
      'test.cpl_token_exp',
      public.issue_login_token(
        tests.get_supabase_uid('cpl_cust'),
        'a1800000-0000-4000-8000-000000000001'::uuid
      ),
      true
    )
  $$,
  'staff can issue a second token to force-expire'
);

-- Table owner only: clients have no UPDATE on login_tokens.
select tests.clear_authentication();
select set_config('role', 'postgres', true);

update public.login_tokens
set expires_at = timezone('utc', now()) - interval '1 minute'
where token = current_setting('test.cpl_token_exp');

select throws_ok(
  $$ select * from public.redeem_login_token(current_setting('test.cpl_token_exp')) $$,
  'invalid_token: token is invalid or expired',
  'an expired token is refused'
);

-- ---------------------------------------------------------------------------
-- 7-10. Weak PINs refused; set_customer_pin is self-only.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('cpl_cust');

select throws_ok(
  $$ select public.set_customer_pin('123456') $$,
  'weak_pin: PIN must be at least 6 digits and not a simple pattern',
  '123456 is rejected as weak'
);

select throws_ok(
  $$ select public.set_customer_pin('111111') $$,
  'weak_pin: PIN must be at least 6 digits and not a simple pattern',
  '111111 is rejected as weak'
);

select lives_ok(
  $$ select public.set_customer_pin('582914') $$,
  'customer CAN set a non-weak PIN for themselves'
);

select tests.clear_authentication();
select set_config('role', 'postgres', true);

select is(
  (select count(*)::integer from public.customer_credentials
    where profile_id = tests.get_supabase_uid('cpl_other')),
  0,
  'set_customer_pin cannot set another user''s PIN'
);

-- ---------------------------------------------------------------------------
-- 11-16. Wrong PIN increments; 5th failure locks; lockout blocks success.
-- ---------------------------------------------------------------------------
select results_eq(
  $$
    select ok from public.verify_customer_pin('9000000203', '000000')
  $$,
  $$ values (false) $$,
  'a wrong PIN is refused'
);

select is(
  (select failed_attempts from public.customer_credentials
    where profile_id = tests.get_supabase_uid('cpl_cust')),
  1,
  'a wrong PIN increments failed_attempts'
);

select lives_ok(
  $sql$
    select public.verify_customer_pin('9000000203', '000000') from generate_series(1, 4)
  $sql$,
  'four more wrong attempts reach the lock threshold'
);

select is(
  (select failed_attempts from public.customer_credentials
    where profile_id = tests.get_supabase_uid('cpl_cust')),
  5,
  'the 5th failure leaves failed_attempts at 5'
);

select ok(
  (select locked_until > timezone('utc', now())
    from public.customer_credentials
    where profile_id = tests.get_supabase_uid('cpl_cust')),
  'the 5th failure sets locked_until'
);

select results_eq(
  $$
    select ok from public.verify_customer_pin('9000000203', '582914')
  $$,
  $$ values (false) $$,
  'a correct PIN during lockout is still refused'
);

select * from finish();
rollback;
