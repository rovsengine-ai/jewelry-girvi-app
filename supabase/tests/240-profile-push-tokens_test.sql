-- profile_push_tokens RLS + claim_pending_loan_notice_pushes idempotency.
begin;
select plan(13);

select tests.create_supabase_user('push_owner');
select tests.create_supabase_user('push_staff');
select tests.create_supabase_user('push_cust_a');
select tests.create_supabase_user('push_cust_b');

update public.profiles set role = 'owner'
  where id = tests.get_supabase_uid('push_owner');
update public.profiles set role = 'staff'
  where id = tests.get_supabase_uid('push_staff');
update public.profiles
  set role = 'retail_customer',
      phone_number = public.normalize_phone_e164('9000000301')
  where id = tests.get_supabase_uid('push_cust_a');
update public.profiles
  set role = 'retail_customer',
      phone_number = public.normalize_phone_e164('9000000302')
  where id = tests.get_supabase_uid('push_cust_b');

insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values (
  'b4000000-0000-4000-8000-000000000001',
  tests.get_supabase_uid('push_cust_a'),
  'T240-PUSH', 'Gold chain', 10.000, 'active',
  1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0,
  'min_month_then_pro_rata', 24
);

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
select is(
  (select relrowsecurity from pg_class where oid = 'public.profile_push_tokens'::regclass),
  true,
  'RLS is enabled on public.profile_push_tokens'
);

-- ---------------------------------------------------------------------------
-- upsert_own_push_token: self only; wrong platform refused
-- ---------------------------------------------------------------------------
select tests.authenticate_as('push_cust_a');

select lives_ok(
  $$ select public.upsert_own_push_token('ExponentPushToken[aaaaaaaaaaaaaaaa]', 'android') $$,
  'customer A can register an Expo push token'
);

select throws_ok(
  $$ select public.upsert_own_push_token('ExponentPushToken[bbbbbbbbbbbbbbbb]', 'web') $$,
  'invalid_platform: only ios and android push tokens are stored',
  'web platform is refused (web push out of scope)'
);

select tests.authenticate_as('push_cust_b');

select is(
  (select count(*)::integer from public.profile_push_tokens),
  0,
  'customer B cannot SELECT customer A push tokens'
);

select throws_ok(
  $$
    insert into public.profile_push_tokens (profile_id, expo_push_token, platform)
    values (
      tests.get_supabase_uid('push_cust_a'),
      'ExponentPushToken[stolenstolenstolen]',
      'ios'
    )
  $$,
  '42501',
  NULL,
  'customer B cannot INSERT a token for customer A'
);

-- ---------------------------------------------------------------------------
-- claim_pending_loan_notice_pushes: customer refused; shop claims once
-- ---------------------------------------------------------------------------
select tests.authenticate_as('push_cust_a');

select throws_ok(
  $$ select * from public.claim_pending_loan_notice_pushes(10) $$,
  'shop_or_service_only: only shop users or service_role may claim notice pushes',
  'a customer cannot claim notice pushes'
);

select tests.authenticate_as('push_staff');

select is(
  public.generate_loan_notices(DATE '2024-06-14'),
  1,
  'staff generates one due_soon notice for the push fixture loan'
);

select results_eq(
  $$
    select notice_type, serial_number, cardinality(expo_push_tokens)
    from public.claim_pending_loan_notice_pushes(10)
  $$,
  $$ values ('due_soon'::text, 'T240-PUSH'::text, 1) $$,
  'first claim returns the notice with A''s push token'
);

select is_empty(
  $$ select * from public.claim_pending_loan_notice_pushes(10) $$,
  'second claim is empty — retried push must not double-send'
);

select is(
  (
    select count(*)::integer
    from public.loan_notices
    where loan_id = 'b4000000-0000-4000-8000-000000000001'
      and notice_type = 'due_soon'
      and push_sent_at IS NOT NULL
  ),
  1,
  'push_sent_at latches the spam-proof notice row'
);

-- generate again is still a no-op on the unique key
select is(
  public.generate_loan_notices(DATE '2024-06-14'),
  0,
  're-running generate_loan_notices does not insert a duplicate notice'
);

select is_empty(
  $$ select * from public.claim_pending_loan_notice_pushes(10) $$,
  'no new push claim after a no-op generate'
);

-- Owner can still upsert own token (shop phone is not a customer device, but RLS allows)
select tests.authenticate_as('push_owner');
select lives_ok(
  $$ select public.upsert_own_push_token('ExponentPushToken[ownownownownownown]', 'ios') $$,
  'owner may register a token on their own profile'
);

select * from finish();
rollback;
