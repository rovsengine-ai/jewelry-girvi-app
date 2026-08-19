-- Counter examples: RULES first-month-once after month 1, a five-ornament
-- milligram ticket, merchant create_loan, and staff payment vs concealment.
begin;
select plan(12);

select tests.create_supabase_user('ex_owner');
select tests.create_supabase_user('ex_staff');
select tests.create_supabase_user('ex_cust');
select tests.create_supabase_user('ex_merchant');

update public.profiles set role = 'owner' where id = tests.get_supabase_uid('ex_owner');
update public.profiles set role = 'staff' where id = tests.get_supabase_uid('ex_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('ex_cust');
update public.profiles set role = 'merchant' where id = tests.get_supabase_uid('ex_merchant');

-- ---------------------------------------------------------------------------
-- 1. First-month floor applies once: day 35 is 1 month + 5 days, not 2 floors.
--    50,000 ₹ @ 300 bps → month = 150000 paise, day = 5000 paise.
--    day 35 = 2024-02-05 from a 2024-01-01 pledge.
-- ---------------------------------------------------------------------------
select results_eq(
  $$
    select accrued_interest_paise
    from public.compute_loan_balances(
      5000000, 300, DATE '2024-01-01', DATE '2024-02-05',
      'retail', 180, 30, 0, 'min_month_then_pro_rata', '[]'::jsonb, 24
    )
  $$,
  $$ select 175000::bigint $$,
  'day_35 min_month_then_pro_rata: 1500 + 5×50 rupees = 175000 paise'
);

-- ---------------------------------------------------------------------------
-- 2-4. Five mixed gold/silver items with odd milligram weights and quantity 2.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('ex_staff');

select lives_ok(
  $$
    select public.create_loan(
      tests.get_supabase_uid('ex_cust'),
      'T200-FIVE',
      null,
      2500000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[
        {"metal":"gold","ornament_type":"Chain","gross_weight_mg":10501,"net_weight_mg":10501,"quantity":1,"purity_karat":22},
        {"metal":"gold","ornament_type":"Ring","gross_weight_mg":4001,"net_weight_mg":4001,"quantity":2},
        {"metal":"silver","ornament_type":"Payal","gross_weight_mg":1,"net_weight_mg":1,"quantity":1},
        {"metal":"silver","ornament_type":"Kada","gross_weight_mg":25000,"net_weight_mg":24800,"stone_deduction_mg":200,"quantity":1},
        {"metal":"gold","ornament_type":"Bangle","gross_weight_mg":8000,"net_weight_mg":8000,"quantity":1,"purity_karat":18}
      ]'::jsonb
    )
  $$,
  'staff can create a five-item milligram ticket'
);

select results_eq(
  $$
    select i.position, i.metal, i.ornament_type, i.gross_weight_mg, i.quantity, i.purity_karat
    from public.loan_items i
    join public.loans l on l.id = i.loan_id
    where l.serial_number = 'T200-FIVE'
    order by i.position
  $$,
  $$ values
    (1::smallint, 'gold'::public.pledge_metal, 'Chain'::text, 10501, 1, 22),
    (2::smallint, 'gold'::public.pledge_metal, 'Ring'::text, 4001, 2, null),
    (3::smallint, 'silver'::public.pledge_metal, 'Payal'::text, 1, 1, null),
    (4::smallint, 'silver'::public.pledge_metal, 'Kada'::text, 25000, 1, null),
    (5::smallint, 'gold'::public.pledge_metal, 'Bangle'::text, 8000, 1, 18)
  $$,
  'positions 1-5 follow array order; silver karat stays null; 1 mg is stored'
);

select is(
  (select count(*)::integer from public.loan_items i
    join public.loans l on l.id = i.loan_id
    where l.serial_number = 'T200-FIVE'),
  5,
  'five pledged items on T200-FIVE'
);

-- ---------------------------------------------------------------------------
-- 5-6. Merchant create_loan: simple-forever, no day-180 capitalization.
--      10,000 ₹ @ 150 bps, 180 days → 90,000 paise interest, principal intact.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$
    select public.create_loan(
      tests.get_supabase_uid('ex_merchant'),
      'T200-MERCH',
      null,
      1000000,
      150,
      DATE '2024-01-01',
      'merchant'::public.interest_model,
      null,
      '[{"metal":"silver","ornament_type":"Bar","gross_weight_mg":100000,"net_weight_mg":100000,"quantity":1}]'::jsonb
    )
  $$,
  'staff can create a merchant loan'
);

select results_eq(
  $$
    select l.interest_model, b.accrued_interest_paise, b.outstanding_principal_paise
    from public.loans l
    cross join lateral public.loan_balances_as_of(l.id, DATE '2024-06-29') b
    where l.serial_number = 'T200-MERCH'
  $$,
  $$ values ('merchant'::public.interest_model, 90000::bigint, 1000000::bigint) $$,
  'merchant day 180: 90000 interest, principal not capitalized'
);

-- ---------------------------------------------------------------------------
-- 7. Staff may record a payment when loans are not concealed.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$
    insert into public.payments (loan_id, amount_paid_paise, paid_on)
    select id, 150000, DATE '2024-01-08'
    from public.loans where serial_number = 'T200-FIVE'
  $$,
  'staff can insert a payment on an active loan'
);

create temp table t200_five as
  select id from public.loans where serial_number = 'T200-FIVE';

-- ---------------------------------------------------------------------------
-- 8. A customer cannot insert a payment on their own loan.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('ex_cust');

select throws_ok(
  $$
    insert into public.payments (loan_id, amount_paid_paise, paid_on)
    select id, 1000, DATE '2024-01-09'
    from public.loans where serial_number = 'T200-FIVE'
  $$,
  '42501',
  'new row violates row-level security policy for table "payments"',
  'a customer cannot insert a payment'
);

-- ---------------------------------------------------------------------------
-- 9-10. Concealment blocks staff payments; reveal restores them.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('ex_owner');
select is(public.set_loans_concealed(true), true, 'owner conceals the book');

select tests.authenticate_as('ex_staff');
select throws_ok(
  $$
    insert into public.payments (loan_id, amount_paid_paise, paid_on)
    select id, 1000, DATE '2024-01-10' from t200_five
  $$,
  '42501',
  'new row violates row-level security policy for table "payments"',
  'staff cannot insert a payment while concealed'
);

select tests.authenticate_as('ex_owner');
select is(public.set_loans_concealed(false), false, 'owner reveals the book');

select tests.authenticate_as('ex_staff');
select lives_ok(
  $$
    insert into public.payments (loan_id, amount_paid_paise, paid_on)
    select id, 1000, DATE '2024-01-11' from t200_five
  $$,
  'staff can insert a payment after reveal'
);

select * from finish();
rollback;
