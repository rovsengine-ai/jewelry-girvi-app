-- Mutation idempotency: repeated client keys return the original result and
-- insert nothing. Wrong roles are refused.
begin;
select plan(15);

select tests.create_supabase_user('id_owner');
select tests.create_supabase_user('id_staff');
select tests.create_supabase_user('id_cust');

update public.profiles set role = 'owner' where id = tests.get_supabase_uid('id_owner');
update public.profiles set role = 'staff' where id = tests.get_supabase_uid('id_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('id_cust');

-- ---------------------------------------------------------------------------
-- 1. Customer cannot create_loan (wrong role)
-- ---------------------------------------------------------------------------
select tests.authenticate_as('id_cust');

select throws_ok(
  $$
    select public.create_loan(
      tests.get_supabase_uid('id_cust'),
      'T220-CUST',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[{"metal":"gold","ornament_type":"Chain","gross_weight_mg":10000,"net_weight_mg":10000,"quantity":1}]'::jsonb,
      '22000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'shop_only: only shop users may create a loan',
  'customer create_loan refused'
);

-- ---------------------------------------------------------------------------
-- 2-4. Staff create_loan: first key inserts once; replay returns same loan_id
-- ---------------------------------------------------------------------------
select tests.authenticate_as('id_staff');

select lives_ok(
  $$
    select public.create_loan(
      tests.get_supabase_uid('id_cust'),
      'T220-OK',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[{"metal":"gold","ornament_type":"Chain","gross_weight_mg":10000,"net_weight_mg":10000,"quantity":1}]'::jsonb,
      '22000000-0000-4000-8000-000000000010'::uuid
    )
  $$,
  'staff create_loan with idempotency key'
);

select results_eq(
  $$
    select count(*)::integer from public.loans where serial_number = 'T220-OK'
  $$,
  $$ values (1) $$,
  'one loan row after first create_loan'
);

select results_eq(
  $$
    with first as (
      select loan_id from public.create_loan(
        tests.get_supabase_uid('id_cust'),
        'T220-OK-RETRY-SHOULD-NOT-MATTER',
        null,
        1000000,
        300,
        DATE '2024-01-01',
        'retail'::public.interest_model,
        null,
        '[{"metal":"gold","ornament_type":"Chain","gross_weight_mg":10000,"net_weight_mg":10000,"quantity":1}]'::jsonb,
        '22000000-0000-4000-8000-000000000010'::uuid
      )
    )
    select
      (select count(*)::integer from public.loans where serial_number = 'T220-OK'),
      (select count(*)::integer from public.loans where serial_number = 'T220-OK-RETRY-SHOULD-NOT-MATTER'),
      (select loan_id from first) = (select id from public.loans where serial_number = 'T220-OK')
  $$,
  $$ values (1, 0, true) $$,
  'create_loan replay returns original loan and inserts nothing'
);

-- ---------------------------------------------------------------------------
-- 5-7. log_payment: customer refused; staff insert once; replay no second row
-- ---------------------------------------------------------------------------
select tests.authenticate_as('id_cust');

select throws_ok(
  $$
    select public.log_payment(
      (select id from public.loans where serial_number = 'T220-OK'),
      10000,
      DATE '2024-02-01',
      '22000000-0000-4000-8000-000000000020'::uuid
    )
  $$,
  'shop_only: only shop users may record a payment',
  'customer log_payment refused'
);

select tests.authenticate_as('id_staff');

select results_eq(
  $$
    select public.log_payment(
      (select id from public.loans where serial_number = 'T220-OK'),
      50000,
      DATE '2024-02-01',
      '22000000-0000-4000-8000-000000000021'::uuid
    ) is not null
  $$,
  $$ values (true) $$,
  'staff can log_payment with a key'
);

select results_eq(
  $$
    with replay as (
      select public.log_payment(
        (select id from public.loans where serial_number = 'T220-OK'),
        50000,
        DATE '2024-02-01',
        '22000000-0000-4000-8000-000000000021'::uuid
      ) as payment_id
    )
    select
      (select count(*)::integer from public.payments p
         join public.loans l on l.id = p.loan_id
        where l.serial_number = 'T220-OK' and p.amount_paid_paise = 50000),
      (select payment_id from replay) = (
        select p.id from public.payments p
          join public.loans l on l.id = p.loan_id
         where l.serial_number = 'T220-OK' and p.amount_paid_paise = 50000
         limit 1
      )
  $$,
  $$ values (1, true) $$,
  'log_payment replay returns original id and inserts nothing'
);

-- ---------------------------------------------------------------------------
-- 8-11. redeem_loan: staff refused; owner redeem once; key replay inserts nothing
-- ---------------------------------------------------------------------------
select tests.authenticate_as('id_staff');

-- Fresh loan for redeem (pay off via final payment in redeem)
select lives_ok(
  $$
    select public.create_loan(
      tests.get_supabase_uid('id_cust'),
      'T220-REDEEM',
      null,
      100000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[{"metal":"gold","ornament_type":"Ring","gross_weight_mg":5000,"net_weight_mg":5000,"quantity":1}]'::jsonb,
      '22000000-0000-4000-8000-000000000030'::uuid
    )
  $$,
  'staff creates loan for redeem'
);

select throws_ok(
  $$
    select public.redeem_loan(
      (select id from public.loans where serial_number = 'T220-REDEEM'),
      DATE '2024-01-01',
      'Asha',
      ARRAY(select i.id from public.loan_items i
              join public.loans l on l.id = i.loan_id
             where l.serial_number = 'T220-REDEEM' order by i.id),
      (select b.total_due_paise from public.loan_balances_as_of(
         (select id from public.loans where serial_number = 'T220-REDEEM'),
         DATE '2024-01-01') b),
      null,
      null,
      '22000000-0000-4000-8000-000000000031'::uuid
    )
  $$,
  'owner_only: only the owner may redeem a loan',
  'staff redeem_loan refused'
);

select tests.authenticate_as('id_owner');

select lives_ok(
  $$
    select public.redeem_loan(
      (select id from public.loans where serial_number = 'T220-REDEEM'),
      DATE '2024-01-01',
      'Asha',
      ARRAY(select i.id from public.loan_items i
              join public.loans l on l.id = i.loan_id
             where l.serial_number = 'T220-REDEEM' order by i.id),
      (select b.total_due_paise from public.loan_balances_as_of(
         (select id from public.loans where serial_number = 'T220-REDEEM'),
         DATE '2024-01-01') b),
      null,
      null,
      '22000000-0000-4000-8000-000000000031'::uuid
    )
  $$,
  'owner redeem_loan with key'
);

select results_eq(
  $$
    with replay as (
      select * from public.redeem_loan(
        (select id from public.loans where serial_number = 'T220-REDEEM'),
        DATE '2024-01-01',
        'Asha',
        ARRAY(select i.id from public.loan_items i
                join public.loans l on l.id = i.loan_id
               where l.serial_number = 'T220-REDEEM' order by i.id),
        999999999,
        null,
        null,
        '22000000-0000-4000-8000-000000000031'::uuid
      )
    )
    select
      (select count(*)::integer from public.payments p
         join public.loans l on l.id = p.loan_id
        where l.serial_number = 'T220-REDEEM'),
      (select status from public.loans where serial_number = 'T220-REDEEM'),
      (select already_redeemed from replay)
  $$,
  $$ values (1, 'redeemed'::public.loan_status, true) $$,
  'redeem_loan replay returns cached result and does not double-pay'
);

-- ---------------------------------------------------------------------------
-- 12-14. renew_loan: staff refused; owner renew once; key replay inserts nothing
-- ---------------------------------------------------------------------------
select tests.authenticate_as('id_staff');

select lives_ok(
  $$
    select public.create_loan(
      tests.get_supabase_uid('id_cust'),
      'T220-RENEW',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[{"metal":"gold","ornament_type":"Bangle","gross_weight_mg":8000,"net_weight_mg":8000,"quantity":1}]'::jsonb,
      '22000000-0000-4000-8000-000000000040'::uuid
    )
  $$,
  'staff creates loan for renew'
);

select throws_ok(
  $$
    select public.renew_loan(
      (select id from public.loans where serial_number = 'T220-RENEW'),
      DATE '2024-07-15',
      (select b.accrued_interest_paise from public.loan_balances_as_of(
         (select id from public.loans where serial_number = 'T220-RENEW'),
         DATE '2024-07-15') b),
      DATE '2025-01-15',
      null,
      '22000000-0000-4000-8000-000000000041'::uuid
    )
  $$,
  'owner_only: only the owner may renew a loan',
  'staff renew_loan refused'
);

select tests.authenticate_as('id_owner');

select lives_ok(
  $$
    select public.renew_loan(
      (select id from public.loans where serial_number = 'T220-RENEW'),
      DATE '2024-07-15',
      (select b.accrued_interest_paise from public.loan_balances_as_of(
         (select id from public.loans where serial_number = 'T220-RENEW'),
         DATE '2024-07-15') b),
      DATE '2025-01-15',
      'first renew',
      '22000000-0000-4000-8000-000000000041'::uuid
    )
  $$,
  'owner renew_loan with key'
);

select results_eq(
  $$
    with replay as (
      select * from public.renew_loan(
        (select id from public.loans where serial_number = 'T220-RENEW'),
        DATE '2024-07-15',
        (select b.accrued_interest_paise from public.loan_balances_as_of(
           (select id from public.loans where serial_number = 'T220-RENEW'),
           DATE '2024-07-15') b),
        DATE '2025-01-15',
        'ignored on replay',
        '22000000-0000-4000-8000-000000000041'::uuid
      )
    )
    select
      (select count(*)::integer from public.loan_renewals r
         join public.loans l on l.id = r.loan_id
        where l.serial_number = 'T220-RENEW'),
      (select already_renewed from replay)
  $$,
  $$ values (1, true) $$,
  'renew_loan replay returns cached result and inserts nothing'
);

select * from finish();
rollback;
