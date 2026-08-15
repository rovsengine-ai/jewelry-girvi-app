-- shop_rate_yield (owner-only, grouped by actual rate_bps) and
-- generate_loan_notices (idempotent in-app notices).
begin;
select plan(14);

select tests.create_supabase_user('yld_owner');
select tests.create_supabase_user('yld_staff');
select tests.create_supabase_user('yld_c1');
select tests.create_supabase_user('yld_c2');

update public.profiles set role = 'owner' where id = tests.get_supabase_uid('yld_owner');
update public.profiles set role = 'staff' where id = tests.get_supabase_uid('yld_staff');
update public.profiles
  set role = 'retail_customer', full_name = 'Asha Patil', phone_number = '+919876543210'
  where id = tests.get_supabase_uid('yld_c1');
update public.profiles
  set role = 'retail_customer', full_name = 'Ravi Shah', phone_number = '+919811122233'
  where id = tests.get_supabase_uid('yld_c2');

-- Yield loans: future disbursal so they are not overdue during the notice dates.
-- Two at 300 bps (1,000,000 each → 30,000 paise / period) and one at 150 bps
-- (2,000,000 → 30,000). A redeemed 400 bps loan must not appear.
insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values
  ('07000000-0000-4000-8000-000000000001', tests.get_supabase_uid('yld_c1'),
   'T070-Y300A', 'Gold chain', 10.000, 'active',
   1000000, 300, DATE '2024-12-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24),
  ('07000000-0000-4000-8000-000000000002', tests.get_supabase_uid('yld_c1'),
   'T070-Y300B', 'Gold bangle', 12.000, 'active',
   1000000, 300, DATE '2024-12-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24),
  ('07000000-0000-4000-8000-000000000003', tests.get_supabase_uid('yld_c1'),
   'T070-Y150', 'Gold bar', 50.000, 'active',
   2000000, 150, DATE '2024-12-01', 'merchant', 180, 30, 0, 'pro_rata', 24),
  ('07000000-0000-4000-8000-000000000004', tests.get_supabase_uid('yld_c1'),
   'T070-Y400', 'Gold ring', 8.000, 'closed',
   1000000, 400, DATE '2024-12-01', 'retail', 180, 30, 0, 'full_period', 24),
  -- Notice loans: disbursed 2024-01-01, due_on = 2024-06-29.
  ('07000000-0000-4000-8000-0000000000a1', tests.get_supabase_uid('yld_c1'),
   'T070-N1', 'Gold necklace', 20.000, 'active',
   1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24),
  ('07000000-0000-4000-8000-0000000000a2', tests.get_supabase_uid('yld_c2'),
   'T070-N2', 'Gold coin', 15.000, 'active',
   1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24);

select tests.authenticate_as('yld_owner');

-- Local CLI seed loans are also active @ 300 bps. Archive them so this
-- suite's yield math stays about T070-* fixtures only (transaction rollback).
do $isolate$
declare
  rid uuid;
begin
  for rid in
    select id
    from public.loans
    where serial_number in ('SEED-ACTIVE', 'SEED-OVERDUE')
  loop
    perform a.loan_id
    from public.archive_loan(
      rid,
      'isolate T070 yield fixtures from local seed'
    ) a;
  end loop;
end
$isolate$;

-- Active 300 bps: two yield loans + two notice loans = 4 × 30,000 paise.
-- Active 150 bps: one yield loan = 30,000 paise. Redeemed 400 bps is excluded.
select results_eq(
  $$
    select rate_bps, loan_count, principal_paise, one_period_yield_paise,
           six_period_yield_paise, twelve_period_yield_paise
    from public.shop_rate_yield()
    order by rate_bps
  $$,
  $$
    values
      (150, 1::bigint, 2000000::bigint, 30000::bigint, 180000::bigint, 360000::bigint),
      (300, 4::bigint, 4000000::bigint, 120000::bigint, 720000::bigint, 1440000::bigint)
  $$,
  'yield groups by actual rate_bps using period_interest_paise per loan'
);

select is_empty(
  $$ select 1 from public.shop_rate_yield() where rate_bps = 400 $$,
  'non-active loans are excluded from yield'
);

select tests.authenticate_as('yld_staff');

select is_empty(
  $$ select * from public.shop_rate_yield() $$,
  'staff must not see analytics'
);

-- 2024-06-13 is 16 days before 2024-06-29: outside the due_soon window.
select is(
  public.generate_loan_notices(DATE '2024-06-13'),
  0,
  'due_soon does not fire 16 days before due'
);

select is(
  public.generate_loan_notices(DATE '2024-06-14'),
  2,
  'staff writes two due_soon in-app notices at the 15-day window'
);

select tests.authenticate_as('yld_c1');

select is_empty(
  $$ select * from public.shop_rate_yield() $$,
  'a customer must not see analytics'
);

select throws_ok(
  $$ select public.generate_loan_notices(DATE '2024-06-14') $$,
  'shop_only: only shop users may generate notices',
  'a customer cannot generate notices'
);

select is(
  (select count(*)::integer from public.loans_overdue_as_of(DATE '2024-06-30')),
  1,
  'a customer sees only their own overdue loan'
);

select tests.authenticate_as('yld_owner');

select is(
  public.generate_loan_notices(DATE '2024-06-14'),
  0,
  're-running due_soon is a no-op'
);

select is(
  public.generate_loan_notices(DATE '2024-06-30'),
  4,
  'first overdue day writes overdue + renewal_offer per loan'
);

select is(
  public.generate_loan_notices(DATE '2024-06-30'),
  0,
  're-running overdue/renewal is a no-op'
);

select is(
  public.generate_loan_notices(DATE '2024-07-29'),
  2,
  'day 30 of overdue writes one forfeiture_warning per loan'
);

select results_eq(
  $$
    select serial_number, customer_name, phone_number, days_overdue
    from public.loans_overdue_as_of(DATE '2024-06-30')
    order by serial_number
  $$,
  $$
    values
      ('T070-N1', 'Asha Patil', '+919876543210', 1),
      ('T070-N2', 'Ravi Shah', '+919811122233', 1)
  $$,
  'overdue rows carry the name and phone the shop will call'
);

select is(
  (select count(*)::integer from public.loan_notices
    where channel = 'in_app' and notice_type = 'due_soon'),
  2,
  'notices are in_app until an SMS channel is chosen'
);

select * from finish();
rollback;
