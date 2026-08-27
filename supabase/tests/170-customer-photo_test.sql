-- Customer face photos: shop write, cross-customer read isolation in kyc bucket.
begin;
select plan(6);

select tests.create_supabase_user('cp_owner');
select tests.create_supabase_user('cp_staff');
select tests.create_supabase_user('cp_cust1');
select tests.create_supabase_user('cp_cust2');

update public.profiles set role = 'owner' where id = tests.get_supabase_uid('cp_owner');
update public.profiles set role = 'staff' where id = tests.get_supabase_uid('cp_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('cp_cust1');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('cp_cust2');

insert into storage.objects (bucket_id, name) values
  (
    'kyc',
    tests.get_supabase_uid('cp_cust1')::text || '/photo/face.jpg'
  ),
  (
    'kyc',
    tests.get_supabase_uid('cp_cust2')::text || '/photo/face.jpg'
  );

-- ---------------------------------------------------------------------------
-- 1-2. photo_path column CHECK accepts only {uuid}/photo/{filename}.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$
    update public.profiles
       set photo_path = tests.get_supabase_uid('cp_cust1')::text || '/photo/portrait.jpg'
     where id = tests.get_supabase_uid('cp_cust1')
  $$,
  'photo_path accepts a namespaced photo/ object path'
);

select throws_ok(
  $$
    update public.profiles
       set photo_path = tests.get_supabase_uid('cp_cust1')::text || '/pan.jpg'
     where id = tests.get_supabase_uid('cp_cust1')
  $$,
  '23514',
  NULL,
  'photo_path rejects a flat id-document-style path'
);

-- ---------------------------------------------------------------------------
-- 3-4. Storage: shop user can write; customer sees only own prefix.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('cp_staff');

select lives_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values (
      'kyc',
      tests.get_supabase_uid('cp_cust2')::text || '/photo/new.jpg'
    )
  $$,
  'a shop user can insert a customer photo under {customer_id}/photo/'
);

select tests.authenticate_as('cp_cust1');

select results_eq(
  $$ select name from storage.objects where bucket_id = 'kyc' $$,
  $$ select tests.get_supabase_uid('cp_cust1')::text || '/photo/face.jpg' $$,
  'a customer cannot read another customer''s face photo'
);

-- ---------------------------------------------------------------------------
-- 5-6. Customers can read their own photo object; shop sees all.
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select count(*)::int from storage.objects where bucket_id = 'kyc' $$,
  $$ select 1 $$,
  'a customer sees exactly one kyc object (their own photo/)'
);

select tests.authenticate_as('cp_staff');

select results_eq(
  $$ select count(*)::int from storage.objects where bucket_id = 'kyc' $$,
  $$ select 3 $$,
  'a shop user sees all kyc objects including customer photos'
);

select * from finish();
rollback;
