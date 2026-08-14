-- public.loan_balances_as_of: the only balance source the app is allowed to use.
-- It must (a) forward each loan's OWN frozen terms to the engine, (b) gather the
-- right payments, (c) default to the Asia/Kolkata date, and (d) leak nothing
-- across customers, since it is SECURITY INVOKER and relies on RLS.
--
-- Loan A: 1_000_000 @ 300 bps, full_period      → period interest 30000
-- Loan B: 5_000_000 @ 300 bps, min_month..., threshold 24 → day 33 = 165000
-- Loan C: identical to B but threshold 3        → day 33 rounds up to 300000
-- Loan D: 1_000_000 @ 150 bps, merchant         → day 30 = 15000
begin;
select plan(12);

-- ---------------------------------------------------------------------------
-- Fixtures. Inserts run as the (superuser) test role, which bypasses RLS; the
-- loans mutation trigger only guards UPDATE/DELETE, so INSERT is safe here.
-- ---------------------------------------------------------------------------
select tests.create_supabase_user('rpc_owner');
select tests.create_supabase_user('rpc_cust1');
select tests.create_supabase_user('rpc_cust2');

update public.profiles set role = 'owner'
  where id = tests.get_supabase_uid('rpc_owner');
update public.profiles set role = 'retail_customer'
  where id = tests.get_supabase_uid('rpc_cust1');
update public.profiles set role = 'retail_customer'
  where id = tests.get_supabase_uid('rpc_cust2');

insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values
  ('aaaaaaaa-0000-4000-8000-000000000001', tests.get_supabase_uid('rpc_cust1'),
   'T040-A', 'Gold chain', 10.500, 'active',
   1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'full_period', 24),
  ('bbbbbbbb-0000-4000-8000-000000000002', tests.get_supabase_uid('rpc_cust1'),
   'T040-B', 'Gold bangle', 22.000, 'active',
   5000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24),
  ('cccccccc-0000-4000-8000-000000000003', tests.get_supabase_uid('rpc_cust1'),
   'T040-C', 'Gold bangle pair', 44.000, 'active',
   5000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 3),
  ('dddddddd-0000-4000-8000-000000000004', tests.get_supabase_uid('rpc_cust2'),
   'T040-D', 'Silver bar', 100.000, 'active',
   1000000, 150, DATE '2024-01-01', 'merchant', 180, 30, 0, 'full_period', 24);

-- Loan A gets the day-200 part-payment used by the Defect A cases, plus a much
-- later payment that must be ignored for any earlier as_of date.
insert into public.payments (loan_id, amount_paid_paise, paid_on) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 10000, DATE '2024-07-19'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 50000, DATE '2024-09-01');

select tests.authenticate_as('rpc_owner');

-- ---------------------------------------------------------------------------
-- 1. The RPC is a faithful wrapper: identical output to calling the engine
--    directly with the same frozen terms and the same in-window payment.
-- ---------------------------------------------------------------------------
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.loan_balances_as_of(
      'aaaaaaaa-0000-4000-8000-000000000001'::uuid, DATE '2024-07-24'
    )
  $$,
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-07-24',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-07-19','amount_paise',10000)),
      24
    )
  $$,
  'RPC output matches a direct engine call with the same frozen terms'
);

-- 2. The recorded payment is picked up: 35400 charged at day 200 on the
--    capitalized principal 1180000, minus 10000 paid = 25400 still owed.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.loan_balances_as_of(
      'aaaaaaaa-0000-4000-8000-000000000001'::uuid, DATE '2024-07-24'
    )
  $$,
  $$ select 25400::bigint, 1180000::bigint, 1205400::bigint, 10000::bigint, 0::bigint, 0::bigint $$,
  'RPC gathers payments on or before as_of (10000 counted)'
);

-- 3. The 2024-09-01 payment must not leak backwards into a July reading.
select is(
  (select interest_paid_paise from public.loan_balances_as_of(
    'aaaaaaaa-0000-4000-8000-000000000001'::uuid, DATE '2024-07-24'
  )),
  10000::bigint,
  'RPC excludes payments dated after as_of (the 50000 September payment)'
);

-- 4. partial_period_mode is read from the loan row, not from shop defaults.
--    Loan B is min_month_then_pro_rata: day 33 = one month + 3 days = 165000.
select is(
  (select accrued_interest_paise from public.loan_balances_as_of(
    'bbbbbbbb-0000-4000-8000-000000000002'::uuid, DATE '2024-02-03'
  )),
  165000::bigint,
  'RPC forwards the loan-level partial_period_mode (165000, not 300000)'
);

-- 5. round_up_threshold_days is read from the loan row too. Loan C is identical
--    to B except threshold 3, so the 3-day remainder now rounds up to a whole
--    month: 2 x 150000 = 300000.
select is(
  (select accrued_interest_paise from public.loan_balances_as_of(
    'cccccccc-0000-4000-8000-000000000003'::uuid, DATE '2024-02-03'
  )),
  300000::bigint,
  'RPC forwards the loan-level round_up_threshold_days (3 → day 33 rounds up)'
);

-- 6. interest_model is read from the loan row: loan D is merchant, so day 30
--    is 1e6*150*30/300000 = 15000 with no capitalization.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise
    from public.loan_balances_as_of(
      'dddddddd-0000-4000-8000-000000000004'::uuid, DATE '2024-01-31'
    )
  $$,
  $$ select 15000::bigint, 1000000::bigint $$,
  'RPC forwards the loan-level interest_model (merchant stays linear)'
);

-- 7. Unknown loan id raises rather than returning a silent zero row.
select throws_ok(
  $$ select * from public.loan_balances_as_of('eeeeeeee-0000-4000-8000-00000000000e'::uuid, DATE '2024-07-24') $$,
  'loan not found: eeeeeeee-0000-4000-8000-00000000000e',
  'RPC raises for a loan id that does not exist'
);

-- ---------------------------------------------------------------------------
-- 8/9. The as_of default must be the shop's calendar day, not the server's UTC
--      day. A genuinely frozen clock is NOT achievable here: now() cannot be
--      moved inside a transaction without an extension such as pg_timetravel,
--      so this asserts (a) the omitted argument behaves exactly like passing
--      the Asia/Kolkata date, and (b) the stored default expression really is
--      anchored to Asia/Kolkata. Between roughly 18:30 and 24:00 UTC the IST
--      date is already tomorrow, which is precisely when a UTC default would
--      under-report a day of interest.
-- ---------------------------------------------------------------------------
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise
    from public.loan_balances_as_of('aaaaaaaa-0000-4000-8000-000000000001'::uuid)
  $$,
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise
    from public.loan_balances_as_of(
      'aaaaaaaa-0000-4000-8000-000000000001'::uuid,
      (timezone('Asia/Kolkata', now()))::date
    )
  $$,
  'omitting as_of behaves identically to passing the Asia/Kolkata date'
);

select matches(
  pg_get_function_arg_default('public.loan_balances_as_of(uuid,date)'::regprocedure, 2),
  'Asia/Kolkata',
  'the as_of default expression is anchored to Asia/Kolkata, not UTC'
);

-- ---------------------------------------------------------------------------
-- 10/11/12. The RPC is SECURITY INVOKER, so customer isolation is enforced by
--           RLS on public.loans. A customer may read their own loan and must
--           not be able to probe anyone else's.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('rpc_cust1');

select is(
  (select total_due_paise from public.loan_balances_as_of(
    'aaaaaaaa-0000-4000-8000-000000000001'::uuid, DATE '2024-07-24'
  )),
  1205400::bigint,
  'a customer can read their OWN loan balances through the RPC'
);

-- Loan D belongs to rpc_cust2. RLS hides the row, so the lookup finds nothing
-- and the function raises: no balances and no existence oracle beyond the id
-- the caller already supplied.
select throws_ok(
  $$ select * from public.loan_balances_as_of('dddddddd-0000-4000-8000-000000000004'::uuid, DATE '2024-01-31') $$,
  'loan not found: dddddddd-0000-4000-8000-000000000004',
  'a customer cannot read ANOTHER customer''s loan balances'
);

select tests.clear_authentication();

-- An anonymous caller is stopped one layer earlier than a wrong-customer
-- caller: it lacks the table GRANT on public.loans altogether, so this is
-- 42501 insufficient_privilege rather than the RLS-filtered "loan not found".
select throws_ok(
  $$ select * from public.loan_balances_as_of('aaaaaaaa-0000-4000-8000-000000000001'::uuid, DATE '2024-07-24') $$,
  '42501',
  NULL,
  'an unauthenticated caller cannot read any loan balances'
);

select * from finish();
rollback;
