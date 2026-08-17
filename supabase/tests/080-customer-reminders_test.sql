-- customer_loan_reminder_schedule: own active loans, 09:00 Asia/Kolkata slots.
begin;
select plan(6);

select tests.create_supabase_user('rem_owner');
select tests.create_supabase_user('rem_c1');
select tests.create_supabase_user('rem_c2');

update public.profiles set role = 'owner' where id = tests.get_supabase_uid('rem_owner');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('rem_c1');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('rem_c2');

insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values
  ('08000000-0000-4000-8000-000000000001', tests.get_supabase_uid('rem_c1'),
   'T080-A', 'Gold chain', 10.000, 'active',
   1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24),
  ('08000000-0000-4000-8000-000000000002', tests.get_supabase_uid('rem_c2'),
   'T080-B', 'Gold ring', 8.000, 'active',
   1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24);

-- due_on = 2024-01-01 + 180 = 2024-06-29.
select tests.authenticate_as('rem_c1');

select results_eq(
  $$
    select reminder_kind, (fire_at AT TIME ZONE 'Asia/Kolkata')::timestamp
    from public.customer_loan_reminder_schedule(DATE '2024-06-01')
    where reminder_kind in ('due_soon', 'due_today', 'overdue')
      and fire_at IN (
        (DATE '2024-06-14' + time '09:00') AT TIME ZONE 'Asia/Kolkata',
        (DATE '2024-06-29' + time '09:00') AT TIME ZONE 'Asia/Kolkata',
        (DATE '2024-06-30' + time '09:00') AT TIME ZONE 'Asia/Kolkata'
      )
    order by fire_at
  $$,
  $$
    values
      ('due_soon', TIMESTAMP '2024-06-14 09:00:00'),
      ('due_today', TIMESTAMP '2024-06-29 09:00:00'),
      ('overdue', TIMESTAMP '2024-06-30 09:00:00')
  $$,
  'customer sees 15-day, due-day and first-overdue 09:00 Kolkata slots'
);

select is(
  (select count(*)::integer
     from public.customer_loan_reminder_schedule(DATE '2024-06-01')
    where serial_number = 'T080-B'),
  0,
  'a customer does not see another customer''s reminder slots'
);

select tests.authenticate_as('rem_owner');

select is_empty(
  $$ select * from public.customer_loan_reminder_schedule(DATE '2024-06-01') $$,
  'shop users are not customers, so the schedule is empty'
);

select tests.authenticate_as('rem_c1');

select is(
  (select count(*)::integer
     from public.customer_loan_reminder_schedule(DATE '2024-07-15')
    where reminder_kind = 'overdue'),
  2,
  'already-overdue loans keep the original overdue slot and add next 09:00'
);

select ok(
  exists(
    select 1
    from public.customer_loan_reminder_schedule(DATE '2024-07-15')
    where reminder_kind = 'overdue'
      and fire_at > now()
  ),
  'catch-up overdue slot is in the future'
);

select is(
  (select count(distinct loan_id)::integer
     from public.customer_loan_reminder_schedule(DATE '2024-06-01')),
  1,
  'only the signed-in customer''s active loan is scheduled'
);

select * from finish();
rollback;
