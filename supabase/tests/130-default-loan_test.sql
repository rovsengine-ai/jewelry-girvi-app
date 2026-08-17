-- default_loan: owner-only, overdue + 6 months, snapshot, idempotent.
-- Hand-computed dates sit in comments next to each assertion.
begin;
select plan(11);

select tests.create_supabase_user('dl_owner');
select tests.create_supabase_user('dl_staff');
select tests.create_supabase_user('dl_cust');

update public.profiles set role = 'owner'  where id = tests.get_supabase_uid('dl_owner');
update public.profiles set role = 'staff'  where id = tests.get_supabase_uid('dl_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('dl_cust');

-- Loan A: 10,000 rupees @ 300 bps, pledged 2024-01-01, simple 180 days.
-- due_on = 2024-01-01 + 180 = 2024-06-29.
-- Overdue from 2024-06-30. Six months after disbursal = 2024-07-01.
-- 2024-06-30 is overdue and still under six months.
insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days,
  redeemed_on, redeemed_by, closure_balance_paise, released_to_name
) values
  ('ee000000-0000-4000-8000-000000000001', tests.get_supabase_uid('dl_cust'),
   'T130-A', 'Gold chain', 10.000, 'active',
   1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24,
   NULL, NULL, NULL, NULL),
  -- Already redeemed: must not be defaultable.
  ('ee000000-0000-4000-8000-000000000002', tests.get_supabase_uid('dl_cust'),
   'T130-R', 'Gold ring', 4.000, 'redeemed',
   500000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'full_period', 24,
   DATE '2024-01-31', tests.get_supabase_uid('dl_owner'), 515000, 'Asha Patil');

-- ---------------------------------------------------------------------------
-- 1-2. Staff / customer cannot default.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('dl_staff');

select throws_ok(
  $$
    select * from public.default_loan(
      'ee000000-0000-4000-8000-000000000001'::uuid,
      DATE '2024-07-01',
      'Customer unreachable after six months'
    )
  $$,
  'owner_only: only the owner may default a loan',
  'staff cannot default'
);

select tests.authenticate_as('dl_cust');

select throws_ok(
  $$
    select * from public.default_loan(
      'ee000000-0000-4000-8000-000000000001'::uuid,
      DATE '2024-07-01',
      'Customer unreachable after six months'
    )
  $$,
  'owner_only: only the owner may default a loan',
  'a customer cannot default'
);

select tests.authenticate_as('dl_staff');

select throws_ok(
  $$
    update public.loans
    set default_reason = 'forged'
    where id = 'ee000000-0000-4000-8000-000000000001'
  $$,
  'staff may not write loan default fields',
  'staff cannot write the default audit fields'
);

-- ---------------------------------------------------------------------------
-- 3-6. Owner: empty reason, not overdue, under 6 months, already redeemed.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('dl_owner');

select throws_ok(
  $$
    select * from public.default_loan(
      'ee000000-0000-4000-8000-000000000001'::uuid,
      DATE '2024-07-01',
      '   '
    )
  $$,
  'default_reason is required',
  'a blank reason is refused'
);

select throws_ok(
  $$
    select * from public.default_loan(
      'ee000000-0000-4000-8000-000000000001'::uuid,
      DATE '2024-06-29',
      'Too early'
    )
  $$,
  'not_overdue: loan is not overdue as of 2024-06-29',
  'not-yet-overdue is refused'
);

select throws_ok(
  $$
    select * from public.default_loan(
      'ee000000-0000-4000-8000-000000000001'::uuid,
      DATE '2024-06-30',
      'Overdue but under six months'
    )
  $$,
  'forfeiture_too_early: defaulted_on must be at least 6 months after disbursed_on',
  'under-6-months is refused even when overdue'
);

select throws_ok(
  $$
    select * from public.default_loan(
      'ee000000-0000-4000-8000-000000000002'::uuid,
      DATE '2024-07-01',
      'Already settled'
    )
  $$,
  'cannot default a loan that is not active (status=redeemed)',
  'already-redeemed is refused'
);

-- ---------------------------------------------------------------------------
-- 7-8. Owner success: snapshot matches loan_balances_as_of on that date.
-- ---------------------------------------------------------------------------
select results_eq(
  $$
    select already_defaulted, status::text
    from public.default_loan(
      'ee000000-0000-4000-8000-000000000001'::uuid,
      DATE '2024-07-01',
      'Customer unreachable after six months'
    )
  $$,
  $$ values (false, 'defaulted') $$,
  'owner can default an overdue loan at six months'
);

select results_eq(
  $$
    select default_balance_paise
    from public.loans
    where id = 'ee000000-0000-4000-8000-000000000001'
  $$,
  $$
    select total_due_paise
    from public.loan_balances_as_of(
      'ee000000-0000-4000-8000-000000000001'::uuid,
      DATE '2024-07-01'
    )
  $$,
  'balance snapshot matches loan_balances_as_of at that date'
);

-- ---------------------------------------------------------------------------
-- 9. Second call is idempotent: original snapshot, no rewrite.
-- ---------------------------------------------------------------------------
select results_eq(
  $$
    select already_defaulted, default_balance_paise
    from public.default_loan(
      'ee000000-0000-4000-8000-000000000001'::uuid,
      DATE '2024-08-01',
      'A different reason must not rewrite history'
    )
  $$,
  $$
    select true, default_balance_paise
    from public.loans
    where id = 'ee000000-0000-4000-8000-000000000001'
  $$,
  'a second call returns the original snapshot'
);

select is(
  (select default_reason from public.loans
    where id = 'ee000000-0000-4000-8000-000000000001'),
  'Customer unreachable after six months',
  'idempotent second call does not rewrite the reason'
);

select tests.clear_authentication();
select * from finish();
rollback;
