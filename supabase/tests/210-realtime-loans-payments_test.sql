-- Realtime publication + RLS filter contract for loans/payments.
-- Postgres Changes only delivers rows the JWT may SELECT; we assert that
-- publication wiring and that a customer cannot SELECT another customer's loan
-- (the same gate Realtime uses for event delivery).
begin;
select plan(8);

select tests.create_supabase_user('rt_owner');
select tests.create_supabase_user('rt_cust_a');
select tests.create_supabase_user('rt_cust_b');

update public.profiles set role = 'owner' where id = tests.get_supabase_uid('rt_owner');
update public.profiles
set role = 'retail_customer'
where id in (tests.get_supabase_uid('rt_cust_a'), tests.get_supabase_uid('rt_cust_b'));

insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values
  (
    'aa000000-0000-4000-8000-0000000000a1',
    tests.get_supabase_uid('rt_cust_a'),
    'T210-A', 'Gold chain', 10.000, 'active',
    1000000, 300, DATE '2024-01-01', 'retail',
    180, 30, 0, 'full_period', 24
  ),
  (
    'bb000000-0000-4000-8000-0000000000b1',
    tests.get_supabase_uid('rt_cust_b'),
    'T210-B', 'Gold ring', 5.000, 'active',
    500000, 300, DATE '2024-01-01', 'retail',
    180, 30, 0, 'full_period', 24
  );

insert into public.payments (loan_id, amount_paid_paise, paid_on) values
  ('aa000000-0000-4000-8000-0000000000a1', 10000, DATE '2024-02-01'),
  ('bb000000-0000-4000-8000-0000000000b1', 5000, DATE '2024-02-01');


-- Publication + replica identity (Realtime RLS prerequisites)
select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'loans'
  ),
  'loans is in supabase_realtime publication'
);

select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payments'
  ),
  'payments is in supabase_realtime publication'
);

select is(
  (select c.relreplident
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'loans'),
  'f',
  'loans REPLICA IDENTITY is FULL (Realtime RLS needs old row)'
);

select is(
  (select c.relreplident
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'payments'),
  'f',
  'payments REPLICA IDENTITY is FULL (Realtime RLS needs old row)'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.loans'::regclass),
  true,
  'RLS remains enabled on loans (Realtime filters via SELECT policies)'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.payments'::regclass),
  true,
  'RLS remains enabled on payments (Realtime filters via SELECT policies)'
);

-- Customer A must not see Customer B's loan — same SELECT gate Realtime uses.
select tests.authenticate_as('rt_cust_a');

select is(
  (
    select count(*)::integer
    from public.loans
    where id = 'bb000000-0000-4000-8000-0000000000b1'
  ),
  0,
  'customer A cannot SELECT customer B loan (Realtime will not deliver B events)'
);

select is(
  (
    select count(*)::integer
    from public.payments
    where loan_id = 'bb000000-0000-4000-8000-0000000000b1'
  ),
  0,
  'customer A cannot SELECT customer B payment (Realtime will not deliver B events)'
);

select * from finish();
rollback;
