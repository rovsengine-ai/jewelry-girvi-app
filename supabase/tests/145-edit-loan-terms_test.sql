-- edit_loan_terms: staff refused; owner write is atomic with loan_term_changes.
begin;
select plan(6);

select tests.create_supabase_user('et_owner');
select tests.create_supabase_user('et_staff');
select tests.create_supabase_user('et_cust');

update public.profiles set role = 'owner'  where id = tests.get_supabase_uid('et_owner');
update public.profiles set role = 'staff'  where id = tests.get_supabase_uid('et_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('et_cust');

insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values (
  'aa130000-0000-4000-8000-000000000001', tests.get_supabase_uid('et_cust'),
  'T145-A', 'Gold chain', 10.000, 'active',
  1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24
);

select tests.authenticate_as('et_staff');

select throws_ok(
  $$
    select * from public.edit_loan_terms(
      'aa130000-0000-4000-8000-000000000001'::uuid,
      400,
      'retail'::public.interest_model,
      180, 30, 0,
      'min_month_then_pro_rata'::public.partial_period_mode,
      24,
      'Reprice'
    )
  $$,
  'owner_only: only the owner may edit loan terms',
  'staff cannot edit loan terms via the RPC'
);

select tests.authenticate_as('et_owner');

select throws_ok(
  $$
    select * from public.edit_loan_terms(
      'aa130000-0000-4000-8000-000000000001'::uuid,
      300,
      'retail'::public.interest_model,
      180, 30, 0,
      'min_month_then_pro_rata'::public.partial_period_mode,
      24,
      'No actual change'
    )
  $$,
  'no_term_change: nothing to update',
  'identical terms are refused so no empty audit row is written'
);

select results_eq(
  $$
    select change_count
    from public.edit_loan_terms(
      'aa130000-0000-4000-8000-000000000001'::uuid,
      400,
      'retail'::public.interest_model,
      180, 30, 0,
      'min_month_then_pro_rata'::public.partial_period_mode,
      20,
      'Customer asked for 4 percent and a 20-day round-up'
    )
  $$,
  $$ values (2) $$,
  'owner can change two terms in one call'
);

select is(
  (select rate_bps from public.loans
    where id = 'aa130000-0000-4000-8000-000000000001'),
  400,
  'the loan row carries the new rate'
);

select is(
  (select count(*)::integer from public.loan_term_changes
    where loan_id = 'aa130000-0000-4000-8000-000000000001'),
  2,
  'each changed field has a matching audit row'
);

select is(
  (
    select count(*)::integer from public.loan_term_changes c
    where c.loan_id = 'aa130000-0000-4000-8000-000000000001'
      and c.reason = 'Customer asked for 4 percent and a 20-day round-up'
      and c.changed_by = tests.get_supabase_uid('et_owner')
  ),
  2,
  'no term edit occurs without a matching audit row from the owner'
);

select tests.clear_authentication();
select * from finish();
rollback;
