-- archive_loan: owner-only hide, four-column snapshot, idempotent, no DELETE.
-- Hand-computed dates sit in comments next to each assertion.
begin;
select plan(25);

select tests.create_supabase_user('ar_owner');
select tests.create_supabase_user('ar_staff');
select tests.create_supabase_user('ar_cust');

update public.profiles set role = 'owner'  where id = tests.get_supabase_uid('ar_owner');
update public.profiles set role = 'staff'  where id = tests.get_supabase_uid('ar_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('ar_cust');

-- Loan A: 10,000 rupees @ 300 bps, pledged 2024-01-01, simple 180 days.
-- due_on = 2024-01-01 + 180 = 2024-06-29. Overdue from 2024-06-30.
insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values
  (
    '16000000-0000-4000-8000-000000000001', tests.get_supabase_uid('ar_cust'),
    'T160-A', 'Gold chain', 10.000, 'active',
    1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24
  ),
  -- Visible to staff so DELETE can reach the trigger. SELECT policies also
  -- apply to DELETE, so an archived row is a silent no-op for staff.
  (
    '16000000-0000-4000-8000-000000000002', tests.get_supabase_uid('ar_cust'),
    'T160-B', 'Gold ring', 4.000, 'active',
    500000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24
  );

insert into public.loan_items (
  id, loan_id, position, ornament_type, metal, gross_weight_mg, net_weight_mg, quantity
) values (
  '16000000-0000-4000-8000-000000000011',
  '16000000-0000-4000-8000-000000000001',
  1, 'Gold chain', 'gold', 10000, 10000, 1
);

insert into public.payments (loan_id, amount_paid_paise, paid_on)
values ('16000000-0000-4000-8000-000000000001', 150000, DATE '2024-02-01');

insert into public.loan_notices (loan_id, notice_type, scheduled_for)
values ('16000000-0000-4000-8000-000000000001', 'overdue', DATE '2024-07-01');

-- ---------------------------------------------------------------------------
-- 1-2. Staff refused; empty reason refused.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('ar_staff');

select throws_ok(
  $$
    select * from public.archive_loan(
      '16000000-0000-4000-8000-000000000001'::uuid,
      'Books closed'
    )
  $$,
  'owner_only: only the owner may archive a loan',
  'staff cannot archive'
);

select tests.authenticate_as('ar_owner');

select throws_ok(
  $$
    select * from public.archive_loan(
      '16000000-0000-4000-8000-000000000001'::uuid,
      '   '
    )
  $$,
  'archive_reason is required',
  'empty archive reason is refused'
);

-- ---------------------------------------------------------------------------
-- 3-5. Owner archives; all four columns set; second call is a no-op.
-- ---------------------------------------------------------------------------
select is(
  (select already_archived
     from public.archive_loan(
       '16000000-0000-4000-8000-000000000001'::uuid,
       'Books closed for FY'
     )),
  false,
  'owner can archive a loan'
);

select ok(
  (select archived_at is not null
          and archived_by = tests.get_supabase_uid('ar_owner')
          and archive_reason = 'Books closed for FY'
          and archive_balance_paise >= 0
     from public.loans
    where id = '16000000-0000-4000-8000-000000000001'),
  'archived_at/by/reason/balance are all set together'
);

select is(
  (select already_archived
     from public.archive_loan(
       '16000000-0000-4000-8000-000000000001'::uuid,
       'a different reason must not rewrite'
     )),
  true,
  'second archive_loan is idempotent'
);

select is(
  (select archive_reason from public.loans
    where id = '16000000-0000-4000-8000-000000000001'),
  'Books closed for FY',
  'idempotent second call leaves the original snapshot'
);

-- ---------------------------------------------------------------------------
-- 6-17. Visibility: staff and customer see 0; owner sees 1. Same for children.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('ar_staff');

select is(
  (select count(*)::integer from public.loans
    where id = '16000000-0000-4000-8000-000000000001'),
  0,
  'staff SELECT of an archived loan returns 0'
);

select is(
  (select count(*)::integer from public.payments
    where loan_id = '16000000-0000-4000-8000-000000000001'),
  0,
  'staff cannot see payments of an archived loan'
);

select is(
  (select count(*)::integer from public.loan_items
    where loan_id = '16000000-0000-4000-8000-000000000001'),
  0,
  'staff cannot see items of an archived loan'
);

select is(
  (select count(*)::integer from public.loan_notices
    where loan_id = '16000000-0000-4000-8000-000000000001'),
  0,
  'staff cannot see notices of an archived loan'
);

select tests.authenticate_as('ar_cust');

select is(
  (select count(*)::integer from public.loans
    where id = '16000000-0000-4000-8000-000000000001'),
  0,
  'customer SELECT of their archived loan returns 0'
);

select is(
  (select count(*)::integer from public.payments
    where loan_id = '16000000-0000-4000-8000-000000000001'),
  0,
  'customer cannot see payments of an archived loan'
);

select is(
  (select count(*)::integer from public.loan_items
    where loan_id = '16000000-0000-4000-8000-000000000001'),
  0,
  'customer cannot see items of an archived loan'
);

select is(
  (select count(*)::integer from public.loan_notices
    where loan_id = '16000000-0000-4000-8000-000000000001'),
  0,
  'customer cannot see notices of an archived loan'
);

select tests.authenticate_as('ar_owner');

select is(
  (select count(*)::integer from public.loans
    where id = '16000000-0000-4000-8000-000000000001'),
  1,
  'owner SELECT of an archived loan returns 1'
);

select is(
  (select count(*)::integer from public.payments
    where loan_id = '16000000-0000-4000-8000-000000000001'),
  1,
  'owner can see payments of an archived loan'
);

select is(
  (select count(*)::integer from public.loan_items
    where loan_id = '16000000-0000-4000-8000-000000000001'),
  1,
  'owner can see items of an archived loan'
);

select is(
  (select count(*)::integer from public.loan_notices
    where loan_id = '16000000-0000-4000-8000-000000000001'),
  1,
  'owner can see notices of an archived loan'
);

-- ---------------------------------------------------------------------------
-- 18-19. Client DELETE raises for staff and owner; the row stays.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('ar_staff');

select throws_ok(
  $$ delete from public.loans where id = '16000000-0000-4000-8000-000000000002' $$,
  'loans cannot be deleted; call archive_loan instead',
  'staff DELETE raises and points at archive_loan'
);

select tests.authenticate_as('ar_owner');

select throws_ok(
  $$ delete from public.loans where id = '16000000-0000-4000-8000-000000000001' $$,
  'loans cannot be deleted; call archive_loan instead',
  'owner DELETE raises and points at archive_loan'
);

-- ---------------------------------------------------------------------------
-- 20-21. Archived overdue loan: no new notices, no reminder slots.
-- due_on 2024-06-29; 2024-08-15 is overdue by 47 days (forfeiture window).
-- ---------------------------------------------------------------------------
select is(
  (
    with generated as (
      select public.generate_loan_notices(DATE '2024-08-15') as n
    )
    select count(*)::integer
    from public.loan_notices, generated
    where loan_id = '16000000-0000-4000-8000-000000000001'
  ),
  1,
  'generate_loan_notices adds nothing for an archived loan'
);

select tests.authenticate_as('ar_cust');

select is_empty(
  $$
    select * from public.customer_loan_reminder_schedule(DATE '2024-08-15')
     where loan_id = '16000000-0000-4000-8000-000000000001'
  $$,
  'an archived loan produces no customer reminder slots'
);

-- ---------------------------------------------------------------------------
-- 22-23. unarchive restores staff and customer visibility.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('ar_owner');

select lives_ok(
  $$
    select * from public.unarchive_loan(
      '16000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'owner can unarchive'
);

select tests.authenticate_as('ar_staff');

select is(
  (select count(*)::integer from public.loans
    where id = '16000000-0000-4000-8000-000000000001'),
  1,
  'unarchive restores staff visibility'
);

select tests.authenticate_as('ar_cust');

select is(
  (select count(*)::integer from public.loans
    where id = '16000000-0000-4000-8000-000000000001'),
  1,
  'unarchive restores customer visibility'
);

select tests.clear_authentication();
select * from finish();
rollback;
