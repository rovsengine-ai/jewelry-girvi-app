-- Customer PIN + login_token RPCs. Style mirrors 050-rls-and-permissions.
-- Covers: no client SELECT on credentials; shop-only issue; token expiry/reuse;
-- PIN lockout; weak PIN rejection; set_customer_pin is self-only.
begin;
select plan(25);

select tests.create_supabase_user('pin_owner');
select tests.create_supabase_user('pin_staff');
select tests.create_supabase_user('pin_cust');
select tests.create_supabase_user('pin_other');

update public.profiles set role = 'owner'
  where id = tests.get_supabase_uid('pin_owner');
update public.profiles set role = 'staff'
  where id = tests.get_supabase_uid('pin_staff');
update public.profiles
  set role = 'retail_customer',
      phone_number = public.normalize_phone_e164('9000000103')
  where id = tests.get_supabase_uid('pin_cust');
update public.profiles
  set role = 'retail_customer',
      phone_number = public.normalize_phone_e164('9000000104')
  where id = tests.get_supabase_uid('pin_other');

insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values (
  'f0000000-0000-4000-8000-000000000001',
  tests.get_supabase_uid('pin_cust'),
  'T200-1', 'Gold chain', 10.000, 'active',
  1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0,
  'min_month_then_pro_rata', 24
);

-- ---------------------------------------------------------------------------
-- Schema: RLS on, public_token backfilled.
-- ---------------------------------------------------------------------------
select is(
  (select relrowsecurity from pg_class where oid = 'public.customer_credentials'::regclass),
  true,
  'RLS is enabled on public.customer_credentials'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.login_tokens'::regclass),
  true,
  'RLS is enabled on public.login_tokens'
);

select isnt(
  (select public_token from public.loans
    where id = 'f0000000-0000-4000-8000-000000000001'),
  NULL,
  'existing loans receive a public_token backfill'
);

select ok(
  length((
    select public_token from public.loans
    where id = 'f0000000-0000-4000-8000-000000000001'
  )) >= 32,
  'public_token is long enough to be non-enumerable'
);

-- ---------------------------------------------------------------------------
-- Customer cannot read credentials; cannot issue tokens.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('pin_cust');

select throws_ok(
  $$ select pin_hash from public.customer_credentials $$,
  '42501',
  NULL,
  'a customer cannot SELECT customer_credentials'
);

select throws_ok(
  $$
    select public.issue_login_token(
      tests.get_supabase_uid('pin_cust'),
      'f0000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'shop_only: only owner or staff may issue a login token',
  'a customer cannot call issue_login_token'
);

-- ---------------------------------------------------------------------------
-- Staff can issue; redeem once; second redeem / expired share one error.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('pin_staff');

select lives_ok(
  $$
    select set_config(
      'test.pin_token',
      public.issue_login_token(
        tests.get_supabase_uid('pin_cust'),
        'f0000000-0000-4000-8000-000000000001'::uuid
      ),
      true
    )
  $$,
  'staff CAN issue a login token'
);

select ok(
  length(current_setting('test.pin_token')) >= 32,
  'issued token is at least 32 characters'
);

select results_eq(
  $$
    select profile_id, loan_id
    from public.redeem_login_token(current_setting('test.pin_token'))
  $$,
  $$
    values (
      tests.get_supabase_uid('pin_cust'),
      'f0000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'redeem_login_token returns profile_id and loan_id'
);

select throws_ok(
  $$ select * from public.redeem_login_token(current_setting('test.pin_token')) $$,
  'invalid_token: token is invalid or expired',
  'a used token is refused a second time'
);

select throws_ok(
  $$ select * from public.redeem_login_token('this-token-does-not-exist-xxxxxxxxxxxx') $$,
  'invalid_token: token is invalid or expired',
  'an unknown token uses the same error as a used token'
);

select lives_ok(
  $$
    select set_config(
      'test.pin_token_exp',
      public.issue_login_token(
        tests.get_supabase_uid('pin_cust'),
        'f0000000-0000-4000-8000-000000000001'::uuid
      ),
      true
    )
  $$,
  'staff can issue a second token to expire'
);

-- Back to the table owner so we can force-expire without a client UPDATE grant.
select tests.clear_authentication();
select set_config('role', 'postgres', true);

update public.login_tokens
set expires_at = timezone('utc', now()) - interval '1 minute'
where token = current_setting('test.pin_token_exp');

select throws_ok(
  $$ select * from public.redeem_login_token(current_setting('test.pin_token_exp')) $$,
  'invalid_token: token is invalid or expired',
  'an expired token is refused with the same error'
);

-- ---------------------------------------------------------------------------
-- set_customer_pin: weak patterns refused; self-only.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('pin_cust');

select throws_ok(
  $$ select public.set_customer_pin('123456') $$,
  'weak_pin: PIN must be at least 6 digits and not a simple pattern',
  'ascending 123456 is rejected as weak'
);

select throws_ok(
  $$ select public.set_customer_pin('111111') $$,
  'weak_pin: PIN must be at least 6 digits and not a simple pattern',
  'all-same-digit 111111 is rejected as weak'
);

select throws_ok(
  $$ select public.set_customer_pin('654321') $$,
  'weak_pin: PIN must be at least 6 digits and not a simple pattern',
  'descending 654321 is rejected as weak'
);

select lives_ok(
  $$ select public.set_customer_pin('582914') $$,
  'customer CAN set a non-weak PIN for themselves'
);

select tests.clear_authentication();
select set_config('role', 'postgres', true);

select is(
  (select count(*)::integer from public.customer_credentials
    where profile_id = tests.get_supabase_uid('pin_cust')),
  1,
  'set_customer_pin wrote a row for the calling customer'
);

select is(
  (select count(*)::integer from public.customer_credentials
    where profile_id = tests.get_supabase_uid('pin_other')),
  0,
  'set_customer_pin cannot set another user''s PIN (no row for other)'
);

-- ---------------------------------------------------------------------------
-- verify_customer_pin: failures increment; 5th locks; lockout blocks success.
-- ---------------------------------------------------------------------------
select results_eq(
  $$
    select ok, profile_id
    from public.verify_customer_pin('9000000103', '000000')
  $$,
  $$ values (false, NULL::uuid) $$,
  'wrong PIN returns ok=false and no profile_id'
);

select is(
  (select failed_attempts from public.customer_credentials
    where profile_id = tests.get_supabase_uid('pin_cust')),
  1,
  'a wrong PIN increments failed_attempts'
);

-- Four more wrong attempts (2..5) via a single statement.
select lives_ok(
  $sql$
    select public.verify_customer_pin('9000000103', '000000') from generate_series(1, 4)
  $sql$,
  'four more wrong attempts reach the lock threshold'
);

select is(
  (select failed_attempts from public.customer_credentials
    where profile_id = tests.get_supabase_uid('pin_cust')),
  5,
  'the 5th failure leaves failed_attempts at 5'
);

select ok(
  (select locked_until > timezone('utc', now())
    from public.customer_credentials
    where profile_id = tests.get_supabase_uid('pin_cust')),
  'the 5th failure sets locked_until in the future'
);

select results_eq(
  $$
    select ok, profile_id
    from public.verify_customer_pin('9000000103', '582914')
  $$,
  $$ values (false, NULL::uuid) $$,
  'a correct PIN during lockout is still refused'
);

select * from finish();
rollback;
