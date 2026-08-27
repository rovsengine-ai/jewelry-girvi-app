-- Customer B cannot read loan A by public_token (RLS). Mask RPC is last-4 only.
begin;
select plan(10);

select tests.create_supabase_user('g_owner');
select tests.create_supabase_user('g_cust_a');
select tests.create_supabase_user('g_cust_b');

update public.profiles set role = 'owner'
  where id = tests.get_supabase_uid('g_owner');
update public.profiles
  set role = 'retail_customer',
      phone_number = public.normalize_phone_e164('9000000201')
  where id = tests.get_supabase_uid('g_cust_a');
update public.profiles
  set role = 'retail_customer',
      phone_number = public.normalize_phone_e164('9000000202')
  where id = tests.get_supabase_uid('g_cust_b');

insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days,
  public_token
) values (
  'a3000000-0000-4000-8000-000000000001',
  tests.get_supabase_uid('g_cust_a'),
  'T230-ABCD', 'Gold chain', 10.000, 'active',
  1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0,
  'min_month_then_pro_rata', 24,
  'pubtok_customer_a_loan_qr_xxxxxxxx'
);

-- ---------------------------------------------------------------------------
-- Mask RPC: last 4 only; unknown token is empty (no existence leak beyond that).
-- ---------------------------------------------------------------------------
select tests.clear_authentication();

select results_eq(
  $$ select serial_last4 from public.loan_receipt_mask_by_public_token(
       'pubtok_customer_a_loan_qr_xxxxxxxx'
     ) $$,
  $$ values ('ABCD') $$,
  'anon mask RPC returns only last 4 of serial_number'
);

select is_empty(
  $$ select * from public.loan_receipt_mask_by_public_token('totally-unknown-token') $$,
  'anon mask RPC returns empty for an unknown token'
);

select throws_ok(
  $$ select count(*) from public.loans $$,
  '42501',
  NULL,
  'anon cannot SELECT loans (mask RPC is not a table grant)'
);

-- ---------------------------------------------------------------------------
-- Security boundary: customer B cannot read A's loan via public_token.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('g_cust_b');

select is(
  (
    select count(*)::integer
    from public.loans
    where public_token = 'pubtok_customer_a_loan_qr_xxxxxxxx'
  ),
  0,
  'customer B cannot SELECT loan A by public_token'
);

select is_empty(
  $$
    select id, principal_paise, serial_number, customer_id
    from public.loans
    where public_token = 'pubtok_customer_a_loan_qr_xxxxxxxx'
  $$,
  'customer B gets no loan columns for A''s public_token'
);

-- Positive control: owner of the loan can read their own row by public_token.
select tests.authenticate_as('g_cust_a');

select is(
  (
    select serial_number
    from public.loans
    where public_token = 'pubtok_customer_a_loan_qr_xxxxxxxx'
  ),
  'T230-ABCD',
  'customer A CAN SELECT own loan by public_token under RLS'
);

-- Mask remains available when signed in; still last-4 only.
select results_eq(
  $$ select serial_last4 from public.loan_receipt_mask_by_public_token(
       'pubtok_customer_a_loan_qr_xxxxxxxx'
     ) $$,
  $$ values ('ABCD') $$,
  'authenticated mask RPC still returns only last 4'
);

-- ---------------------------------------------------------------------------
-- Concealed book: mask hides too (same empty as unknown).
-- ---------------------------------------------------------------------------
select tests.authenticate_as('g_owner');
select is(public.set_loans_concealed(true), true, 'owner conceals loans');

select tests.clear_authentication();
select is_empty(
  $$ select * from public.loan_receipt_mask_by_public_token(
       'pubtok_customer_a_loan_qr_xxxxxxxx'
     ) $$,
  'mask RPC returns empty while loans are concealed'
);

select tests.authenticate_as('g_owner');
select is(public.set_loans_concealed(false), false, 'owner reveals loans');

select * from finish();
rollback;
