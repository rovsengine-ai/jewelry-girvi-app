-- unredeem_loan: staff refused; owner reverts redeemed → active and undoes
-- the closing payment; reason is required.
begin;
select plan(8);

select tests.create_supabase_user('ur_owner');
select tests.create_supabase_user('ur_staff');
select tests.create_supabase_user('ur_cust');

update public.profiles set role = 'owner' where id = tests.get_supabase_uid('ur_owner');
update public.profiles set role = 'staff' where id = tests.get_supabase_uid('ur_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('ur_cust');

insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values (
  'aa160000-0000-4000-8000-000000000001', tests.get_supabase_uid('ur_cust'),
  'T160-A', 'Gold chain', 10.000, 'active',
  1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24
);

insert into public.loan_items (
  id, loan_id, position, ornament_type, metal, gross_weight_mg, net_weight_mg, quantity
) values (
  'bb160000-0000-4000-8000-000000000001',
  'aa160000-0000-4000-8000-000000000001',
  1, 'Chain', 'gold', 10000, 10000, 1
);

select tests.authenticate_as('ur_owner');

select lives_ok(
  $$
    select * from public.redeem_loan(
      'aa160000-0000-4000-8000-000000000001'::uuid,
      DATE '2024-01-31',
      'Asha Patil',
      ARRAY['bb160000-0000-4000-8000-000000000001'::uuid],
      1030000
    )
  $$,
  'owner can redeem so unredeem has a snapshot to reverse'
);

select tests.authenticate_as('ur_staff');

select throws_ok(
  $$
    select * from public.unredeem_loan(
      'aa160000-0000-4000-8000-000000000001'::uuid,
      'Wrong ticket'
    )
  $$,
  'owner_only: only the owner may revert a redemption',
  'staff cannot unredeem'
);

select tests.authenticate_as('ur_owner');

select throws_ok(
  $$
    select * from public.unredeem_loan(
      'aa160000-0000-4000-8000-000000000001'::uuid,
      '   '
    )
  $$,
  'unredeem_reason is required',
  'blank reason is refused'
);

select results_eq(
  $$
    select status::text
    from public.unredeem_loan(
      'aa160000-0000-4000-8000-000000000001'::uuid,
      'Customer paid the wrong loan'
    )
  $$,
  $$ values ('active') $$,
  'owner unredeem returns the loan to active'
);

select is(
  (select status::text from public.loans
    where id = 'aa160000-0000-4000-8000-000000000001'),
  'active',
  'loan row is active after unredeem'
);

select is(
  (select count(*)::integer from public.payments
    where loan_id = 'aa160000-0000-4000-8000-000000000001'),
  0,
  'the closing payment is reversed'
);

select is(
  (select count(*)::integer from public.loan_unredeem_events
    where loan_id = 'aa160000-0000-4000-8000-000000000001'
      and reason = 'Customer paid the wrong loan'
      and acted_by = tests.get_supabase_uid('ur_owner')),
  1,
  'unredeem writes an owner audit row'
);

select throws_ok(
  $$
    select * from public.unredeem_loan(
      'aa160000-0000-4000-8000-000000000001'::uuid,
      'Already unpaid'
    )
  $$,
  'cannot unredeem a loan that is not redeemed (status=active)',
  'a second unredeem is refused'
);

select tests.clear_authentication();
select * from finish();
rollback;
