-- Gate A: create_loan stamps 1-based position from the input array and
-- returns item ids in that order. created_at is pinned as identical across
-- items in one transaction — the regression that made ORDER BY created_at
-- a silent photo-mismatch.
begin;
select plan(6);

select tests.create_supabase_user('pos_staff');
select tests.create_supabase_user('pos_cust');

update public.profiles set role = 'staff' where id = tests.get_supabase_uid('pos_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('pos_cust');

select tests.authenticate_as('pos_staff');

-- ---------------------------------------------------------------------------
-- 1. Positions 1,2,3 follow the jsonb array, not ornament_type or id.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$
    select * from public.create_loan(
      tests.get_supabase_uid('pos_cust'),
      'T110-POS',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[
        {"metal":"gold","ornament_type":"Chain","gross_weight_mg":10000,"net_weight_mg":10000,"quantity":1},
        {"metal":"gold","ornament_type":"Bangle","gross_weight_mg":20000,"net_weight_mg":20000,"quantity":1},
        {"metal":"gold","ornament_type":"Ring","gross_weight_mg":3000,"net_weight_mg":3000,"quantity":1}
      ]'::jsonb
    )
  $$,
  'staff can create a three-item loan'
);

select results_eq(
  $$
    select i.position, i.ornament_type
    from public.loan_items i
    join public.loans l on l.id = i.loan_id
    where l.serial_number = 'T110-POS'
    order by i.position
  $$,
  $$ values
    (1::smallint, 'Chain'::text),
    (2::smallint, 'Bangle'::text),
    (3::smallint, 'Ring'::text)
  $$,
  'create_loan assigns positions 1,2,3 in input order'
);

-- ---------------------------------------------------------------------------
-- 2. Returned item_ids match position order so the client never re-queries.
-- Capture the RPC row first so both sides of results_eq read the same loan.
-- ---------------------------------------------------------------------------
create temp table t110_created as
  select * from public.create_loan(
    tests.get_supabase_uid('pos_cust'),
    'T110-IDS',
    null,
    1000000,
    300,
    DATE '2024-01-01',
    'retail'::public.interest_model,
    null,
    '[
      {"metal":"gold","ornament_type":"Chain","gross_weight_mg":10000,"net_weight_mg":10000,"quantity":1},
      {"metal":"gold","ornament_type":"Bangle","gross_weight_mg":20000,"net_weight_mg":20000,"quantity":1},
      {"metal":"gold","ornament_type":"Ring","gross_weight_mg":3000,"net_weight_mg":3000,"quantity":1}
    ]'::jsonb
  );

select results_eq(
  $$ select unnest(item_ids) from t110_created $$,
  $$
    select i.id
    from public.loan_items i
    join t110_created c on c.loan_id = i.loan_id
    order by i.position
  $$,
  'create_loan returns item ids in input/position order'
);

-- ---------------------------------------------------------------------------
-- 3. (loan_id, position) uniqueness.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$
    insert into public.loan_items (
      loan_id, position, ornament_type, gross_weight_mg, net_weight_mg, quantity
    )
    select i.loan_id, 1, 'Duplicate position', 1000, 1000, 1
    from public.loan_items i
    join public.loans l on l.id = i.loan_id
    where l.serial_number = 'T110-POS'
    limit 1
  $$,
  '23505',
  NULL,
  '(loan_id, position) uniqueness holds'
);

-- ---------------------------------------------------------------------------
-- 4. Backfill left no NULL. Historic rows from 030000 and every fixture
-- insert after 090000 must have a position.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::integer from public.loan_items where position is null),
  0,
  'backfill left no NULL position'
);

-- ---------------------------------------------------------------------------
-- 5. Pin the identical-created_at fact. If this ever fails, ORDER BY
-- created_at has a tiebreaker again and the original bug is masked.
-- ---------------------------------------------------------------------------
select is(
  (
    select min(i.created_at) = max(i.created_at)
    from public.loan_items i
    join public.loans l on l.id = i.loan_id
    where l.serial_number = 'T110-POS'
  ),
  true,
  'two or more items inserted in the same create_loan transaction have equal created_at'
);

select tests.clear_authentication();
select * from finish();
rollback;
