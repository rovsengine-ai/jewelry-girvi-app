-- redeem_loan / renew_loan: owner-only, idempotent, audit snapshot, checklist.
-- Hand-computed balances sit in comments next to each assertion.
begin;
select plan(17);

select tests.create_supabase_user('rr_owner');
select tests.create_supabase_user('rr_staff');
select tests.create_supabase_user('rr_cust');

update public.profiles set role = 'owner'  where id = tests.get_supabase_uid('rr_owner');
update public.profiles set role = 'staff'  where id = tests.get_supabase_uid('rr_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('rr_cust');

-- Loan R: 10,000 rupees @ 300 bps, min_month_then_pro_rata, pledged 2024-01-01.
-- Day 30 = 2024-01-31. First-month minimum = one period = 30,000 paise.
-- Total due on redeem day = 1,030,000 paise.
insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values
  ('aa000000-0000-4000-8000-000000000001', tests.get_supabase_uid('rr_cust'),
   'T060-R', 'Gold chain', 10.000, 'active',
   1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24),
  -- Loan C: already closed (legacy). Must not be redeemable.
  ('cc000000-0000-4000-8000-000000000003', tests.get_supabase_uid('rr_cust'),
   'T060-C', 'Gold ring', 4.000, 'closed',
   500000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'full_period', 24),
  -- Loan M: merchant, for renewal. 10,000 rupees @ 150 bps from 2024-01-01.
  -- due_on = 2024-01-01 + 180 = 2024-06-29.
  -- Day 182 = 2024-07-01: 1_000_000 * 150 * 182 / (30*10000) = 91000 paise exactly.
  ('dd000000-0000-4000-8000-00000000000d', tests.get_supabase_uid('rr_cust'),
   'T060-M', 'Gold bar', 50.000, 'active',
   1000000, 150, DATE '2024-01-01', 'merchant', 180, 30, 0, 'pro_rata', 24);

insert into public.loan_items (
  id, loan_id, ornament_type, gross_weight_mg, net_weight_mg, quantity
) values
  ('bb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001',
   'Gold chain', 10000, 10000, 1),
  ('bb000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000001',
   'Gold earring pair', 4000, 3800, 2);

-- ---------------------------------------------------------------------------
-- 1-4. Staff / customer cannot redeem. Owner can, with the exact snapshot.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('rr_staff');

select throws_ok(
  $$
    select * from public.redeem_loan(
      'aa000000-0000-4000-8000-000000000001'::uuid,
      DATE '2024-01-31',
      'Asha Patil',
      ARRAY[
        'bb000000-0000-4000-8000-000000000001'::uuid,
        'bb000000-0000-4000-8000-000000000002'::uuid
      ],
      1030000
    )
  $$,
  'owner_only: only the owner may redeem a loan',
  'staff cannot redeem'
);

select tests.authenticate_as('rr_cust');

select throws_ok(
  $$
    select * from public.redeem_loan(
      'aa000000-0000-4000-8000-000000000001'::uuid,
      DATE '2024-01-31',
      'Asha Patil',
      ARRAY[
        'bb000000-0000-4000-8000-000000000001'::uuid,
        'bb000000-0000-4000-8000-000000000002'::uuid
      ],
      1030000
    )
  $$,
  'owner_only: only the owner may redeem a loan',
  'a customer cannot redeem'
);

select tests.authenticate_as('rr_owner');

-- Incomplete checklist (one of two items) is refused before any payment.
select throws_ok(
  $$
    select * from public.redeem_loan(
      'aa000000-0000-4000-8000-000000000001'::uuid,
      DATE '2024-01-31',
      'Asha Patil',
      ARRAY['bb000000-0000-4000-8000-000000000001'::uuid],
      1030000
    )
  $$,
  'item_checklist: every pledged item must be checked, and only those items',
  'every pledged item must be ticked'
);

-- Underpayment leaves a balance; the loan must stay active.
select throws_ok(
  $$
    select * from public.redeem_loan(
      'aa000000-0000-4000-8000-000000000001'::uuid,
      DATE '2024-01-31',
      'Asha Patil',
      ARRAY[
        'bb000000-0000-4000-8000-000000000001'::uuid,
        'bb000000-0000-4000-8000-000000000002'::uuid
      ],
      1
    )
  $$,
  'balance_remaining: loan still has 1000000 paise principal and 29999 paise interest due',
  'an underpayment cannot redeem'
);

-- 5. The underpayment was rolled back with the exception, so no payment row.
select is(
  (select count(*)::integer from public.payments
    where loan_id = 'aa000000-0000-4000-8000-000000000001'),
  0,
  'a failed redeem inserts no payment'
);

-- 6-7. Successful redeem snapshots the pre-payment total due (1,030,000).
select results_eq(
  $$
    select closure_balance_paise, already_redeemed, status::text
    from public.redeem_loan(
      'aa000000-0000-4000-8000-000000000001'::uuid,
      DATE '2024-01-31',
      'Asha Patil',
      ARRAY[
        'bb000000-0000-4000-8000-000000000001'::uuid,
        'bb000000-0000-4000-8000-000000000002'::uuid
      ],
      1030000
    )
  $$,
  $$ values (1030000::bigint, false, 'redeemed') $$,
  'redeem snapshots 1,030,000 paise and marks the loan redeemed'
);

select is(
  (select redeemed_by from public.loans
    where id = 'aa000000-0000-4000-8000-000000000001'),
  tests.get_supabase_uid('rr_owner'),
  'redeemed_by is the calling owner'
);

-- 8-9. Idempotency: a second tap returns the original snapshot and inserts
-- nothing. This is also "cannot redeem an already-redeemed loan" — it does
-- not rewrite history and does not take another payment.
select results_eq(
  $$
    select closure_balance_paise, already_redeemed, status::text
    from public.redeem_loan(
      'aa000000-0000-4000-8000-000000000001'::uuid,
      DATE '2024-01-31',
      'Someone Else',
      ARRAY[
        'bb000000-0000-4000-8000-000000000001'::uuid,
        'bb000000-0000-4000-8000-000000000002'::uuid
      ],
      9999999
    )
  $$,
  $$ values (1030000::bigint, true, 'redeemed') $$,
  'a second redeem is idempotent: same snapshot, already_redeemed=true'
);

select is(
  (select count(*)::integer from public.payments
    where loan_id = 'aa000000-0000-4000-8000-000000000001'),
  1,
  'the second redeem does not insert another payment'
);

select is(
  (select released_to_name from public.loans
    where id = 'aa000000-0000-4000-8000-000000000001'),
  'Asha Patil',
  'the second redeem does not rewrite released_to_name'
);

-- 10. A legacy closed loan cannot be pushed into redeemed.
select throws_ok(
  $$
    select * from public.redeem_loan(
      'cc000000-0000-4000-8000-000000000003'::uuid,
      DATE '2024-01-31',
      'Asha Patil',
      ARRAY[]::uuid[],
      0
    )
  $$,
  'cannot redeem a loan that is not active (status=closed)',
  'a closed loan cannot be redeemed'
);

-- ---------------------------------------------------------------------------
-- Renewal
-- ---------------------------------------------------------------------------
-- 11. Too early: on the due date itself, not after it.
select throws_ok(
  $$
    select * from public.renew_loan(
      'dd000000-0000-4000-8000-00000000000d'::uuid,
      DATE '2024-06-29',
      0,
      DATE '2024-12-26'
    )
  $$,
  'renewal is only offered after the simple period (due 2024-06-29)',
  'renewal is refused on the due date'
);

-- 12. Wrong amount: must equal accrued interest (91000), not a principal cut.
select throws_ok(
  $$
    select * from public.renew_loan(
      'dd000000-0000-4000-8000-00000000000d'::uuid,
      DATE '2024-07-01',
      90000,
      DATE '2024-12-28'
    )
  $$,
  'interest_only: payment must equal accrued interest (91000 paise), not 90000',
  'renewal is interest-only'
);

-- 13. Staff cannot renew.
select tests.authenticate_as('rr_staff');
select throws_ok(
  $$
    select * from public.renew_loan(
      'dd000000-0000-4000-8000-00000000000d'::uuid,
      DATE '2024-07-01',
      91000,
      DATE '2024-12-28'
    )
  $$,
  'owner_only: only the owner may renew a loan',
  'staff cannot renew'
);

select tests.authenticate_as('rr_owner');

-- 14. Happy path, then overdue function honours the new maturity.
select results_eq(
  $$
    select interest_paid_paise, new_maturity_on, already_renewed
    from public.renew_loan(
      'dd000000-0000-4000-8000-00000000000d'::uuid,
      DATE '2024-07-01',
      91000,
      DATE '2024-12-28'
    )
  $$,
  $$ values (91000::bigint, DATE '2024-12-28', false) $$,
  'renewal records 91,000 paise interest and the new due date'
);

-- 15. Before renewal this loan was overdue on 2024-07-01; afterwards it is not.
select is_empty(
  $$
    select loan_id from public.loans_overdue_as_of(DATE '2024-07-01')
    where loan_id = 'dd000000-0000-4000-8000-00000000000d'
  $$,
  'a just-renewed loan is not overdue on the renewal date'
);

-- 16. Idempotent second tap on the same day.
select results_eq(
  $$
    select interest_paid_paise, already_renewed
    from public.renew_loan(
      'dd000000-0000-4000-8000-00000000000d'::uuid,
      DATE '2024-07-01',
      91000,
      DATE '2024-12-28'
    )
  $$,
  $$ values (91000::bigint, true) $$,
  'a second renew on the same day is idempotent'
);

select tests.clear_authentication();
select * from finish();
rollback;
