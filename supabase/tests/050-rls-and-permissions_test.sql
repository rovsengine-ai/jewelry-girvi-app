-- RLS and role permissions, exercised through real impersonated sessions rather
-- than by reading policy definitions. Mirrors the permission table in
-- docs/RULES.md and the storage path-namespacing rules from migration
-- 20260813200000.
begin;
select plan(43);

-- ---------------------------------------------------------------------------
-- Fixtures (created as the superuser test role, which bypasses RLS).
-- ---------------------------------------------------------------------------
select tests.create_supabase_user('rls_owner');
select tests.create_supabase_user('rls_staff');
select tests.create_supabase_user('rls_cust1');
select tests.create_supabase_user('rls_cust2');

update public.profiles set role = 'owner'  where id = tests.get_supabase_uid('rls_owner');
update public.profiles set role = 'staff'  where id = tests.get_supabase_uid('rls_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('rls_cust1');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('rls_cust2');

insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values
  -- cust1's loan
  ('a0000000-0000-4000-8000-000000000001', tests.get_supabase_uid('rls_cust1'),
   'T050-1', 'Gold chain', 10.500, 'active',
   1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'full_period', 24),
  -- cust2's loan, must never be visible to cust1
  ('b0000000-0000-4000-8000-000000000002', tests.get_supabase_uid('rls_cust2'),
   'T050-2', 'Gold ring', 4.250, 'active',
   500000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'full_period', 24),
  -- scratch rows for the destructive owner/staff cases (no payments attached,
  -- so the ON DELETE RESTRICT from payments does not interfere)
  ('c0000000-0000-4000-8000-000000000003', tests.get_supabase_uid('rls_cust1'),
   'T050-3', 'Gold stud', 2.000, 'active',
   200000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'full_period', 24),
  ('d0000000-0000-4000-8000-000000000004', tests.get_supabase_uid('rls_cust1'),
   'T050-4', 'Gold stud pair', 4.000, 'active',
   200000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'full_period', 24);

insert into storage.objects (bucket_id, name) values
  ('receipts', tests.get_supabase_uid('rls_cust1')::text || '/receipts/own.jpg'),
  ('receipts', tests.get_supabase_uid('rls_cust2')::text || '/receipts/other.jpg');

-- Stage 2 fixtures: pledged items, their photos, notices, and KYC objects.
insert into public.loan_items (
  id, loan_id, ornament_type, gross_weight_mg, net_weight_mg, quantity
) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Gold chain', 10500, 10500, 1),
  ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
   'Gold ring', 4250, 4250, 1);

insert into public.loan_item_photos (loan_item_id, storage_path) values
  ('e0000000-0000-4000-8000-000000000001',
   tests.get_supabase_uid('rls_cust1')::text || '/items/chain.jpg'),
  ('e0000000-0000-4000-8000-000000000002',
   tests.get_supabase_uid('rls_cust2')::text || '/items/ring.jpg');

insert into public.loan_notices (loan_id, notice_type, scheduled_for) values
  ('a0000000-0000-4000-8000-000000000001', 'overdue', DATE '2024-07-01'),
  ('b0000000-0000-4000-8000-000000000002', 'overdue', DATE '2024-07-01');

-- KYC documents live in their own private bucket, namespaced the same way.
insert into storage.objects (bucket_id, name) values
  ('kyc', tests.get_supabase_uid('rls_cust1')::text || '/pan.jpg'),
  ('kyc', tests.get_supabase_uid('rls_cust2')::text || '/pan.jpg');

-- ---------------------------------------------------------------------------
-- 1-5. RLS must be ON for every table holding customer or money data.
--      A missing ENABLE here would silently expose everything.
-- ---------------------------------------------------------------------------
select is((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
          true, 'RLS is enabled on public.profiles');
select is((select relrowsecurity from pg_class where oid = 'public.loans'::regclass),
          true, 'RLS is enabled on public.loans');
select is((select relrowsecurity from pg_class where oid = 'public.payments'::regclass),
          true, 'RLS is enabled on public.payments');
select is((select relrowsecurity from pg_class where oid = 'public.shop_defaults'::regclass),
          true, 'RLS is enabled on public.shop_defaults');
select is((select relrowsecurity from pg_class where oid = 'public.loan_term_changes'::regclass),
          true, 'RLS is enabled on public.loan_term_changes');
select is((select relrowsecurity from pg_class where oid = 'public.loan_items'::regclass),
          true, 'RLS is enabled on public.loan_items');
select is((select relrowsecurity from pg_class where oid = 'public.loan_item_photos'::regclass),
          true, 'RLS is enabled on public.loan_item_photos');
select is((select relrowsecurity from pg_class where oid = 'public.loan_renewals'::regclass),
          true, 'RLS is enabled on public.loan_renewals');
select is((select relrowsecurity from pg_class where oid = 'public.loan_notices'::regclass),
          true, 'RLS is enabled on public.loan_notices');

-- 6. The receipts bucket must be private, so images are only ever reachable
--    through a signed URL. Asserted here, before any impersonation: RLS on
--    storage.buckets hides the row from an ordinary authenticated session, so
--    the same query would return NULL rather than false further down.
select is(
  (select public from storage.buckets where id = 'receipts'),
  false,
  'the receipts bucket is private (signed URLs only, never a public URL)'
);

-- Identity documents are the most sensitive objects in the system. This bucket
-- must never be public, whatever the dashboard was last clicked into.
select is(
  (select public from storage.buckets where id = 'kyc'),
  false,
  'the kyc bucket is private'
);

-- ---------------------------------------------------------------------------
-- 7-9. Customer isolation.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('rls_cust1');

select bag_eq(
  $$ select serial_number from public.loans $$,
  $$ values ('T050-1'::text), ('T050-3'::text), ('T050-4'::text) $$,
  'a customer sees only their own loans'
);

select is_empty(
  $$ select id from public.loans where serial_number = 'T050-2' $$,
  'a customer cannot see another customer''s loan'
);

-- 42501 = insufficient_privilege, which is what an RLS WITH CHECK failure
-- raises. Customers must not be able to create loans for themselves.
select throws_ok(
  $$
    insert into public.loans (
      customer_id, serial_number, item_name, weight_grams, status,
      principal_paise, rate_bps, disbursed_on, interest_model,
      simple_period_days, compound_every_days, grace_days,
      partial_period_mode, round_up_threshold_days
    ) values (
      tests.get_supabase_uid('rls_cust1'), 'T050-HACK', 'Self-issued', 1.000, 'active',
      9900000, 1, DATE '2024-01-01', 'retail', 180, 30, 0, 'full_period', 24
    )
  $$,
  '42501',
  NULL,
  'a customer cannot insert a loan'
);

-- ---------------------------------------------------------------------------
-- 10-14. Staff may transact but not change money rules or destroy records.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('rls_staff');

select lives_ok(
  $$
    insert into public.loans (
      customer_id, serial_number, item_name, weight_grams, status,
      principal_paise, rate_bps, disbursed_on, interest_model,
      simple_period_days, compound_every_days, grace_days,
      partial_period_mode, round_up_threshold_days
    ) values (
      tests.get_supabase_uid('rls_cust1'), 'T050-STAFF', 'Counter pledge', 5.000, 'active',
      300000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'full_period', 24
    )
  $$,
  'staff CAN create a loan at the counter'
);

-- status is a loan_status enum as of migration 20260815030000, and the guard
-- message widened with it. All three terminal states must be refused: the old
-- trigger compared against the literal 'closed' only, so 'redeemed' and
-- 'defaulted' would have walked straight through.
select throws_ok(
  $$ update public.loans set status = 'closed'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'staff may not close, redeem or default loans',
  'staff cannot close a loan'
);

select throws_ok(
  $$ update public.loans set status = 'redeemed'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'staff may not close, redeem or default loans',
  'staff cannot redeem a loan'
);

select throws_ok(
  $$ update public.loans set status = 'defaulted'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'staff may not close, redeem or default loans',
  'staff cannot mark a loan defaulted'
);

-- Even leaving status alone, staff must not be able to forge the audit trail.
select throws_ok(
  $$ update public.loans
     set closure_balance_paise = 1, redeemed_on = DATE '2024-02-01'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'staff may not write loan redemption fields',
  'staff cannot write the redemption audit fields'
);

select throws_ok(
  $$ update public.loans set rate_bps = 100
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'staff may not edit loan terms',
  'staff cannot edit rate_bps'
);

-- The new term must be guarded exactly like the pre-existing ones, otherwise
-- staff could quietly re-price every partial month.
select throws_ok(
  $$ update public.loans set round_up_threshold_days = 1
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'staff may not edit loan terms',
  'staff cannot edit round_up_threshold_days'
);

-- Note the shape of this one: loans_owner_delete restricts DELETE by USING, so
-- a staff DELETE matches zero rows and RETURNS QUIETLY rather than raising.
-- The row surviving is the guarantee; the silence is a UI trap worth knowing.
delete from public.loans where id = 'c0000000-0000-4000-8000-000000000003';
select isnt_empty(
  $$ select id from public.loans where id = 'c0000000-0000-4000-8000-000000000003' $$,
  'a staff DELETE removes nothing (silently filtered by RLS, not an error)'
);

-- ---------------------------------------------------------------------------
-- 15-16. Owner may re-price and delete.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('rls_owner');

select lives_ok(
  $$ update public.loans
     set rate_bps = 400, round_up_threshold_days = 20
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'owner CAN edit a loan''s frozen terms'
);

delete from public.loans where id = 'd0000000-0000-4000-8000-000000000004';
select is_empty(
  $$ select id from public.loans where id = 'd0000000-0000-4000-8000-000000000004' $$,
  'owner CAN delete a loan'
);

-- The audit snapshot is not optional. loans_redeemed_audit_chk exists so that a
-- redemption can never be recorded without the figure that was actually
-- collected, which a later rate edit could otherwise silently rewrite.
-- 23514 = check_violation.
select throws_ok(
  $$ update public.loans set status = 'redeemed'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '23514',
  NULL,
  'even an owner cannot mark a loan redeemed without closure_balance_paise'
);

select lives_ok(
  $$ update public.loans
     set status = 'redeemed',
         redeemed_on = DATE '2024-07-01',
         redeemed_by = tests.get_supabase_uid('rls_owner'),
         closure_balance_paise = 1120000,
         released_to_name = 'Asha Patil'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'owner CAN redeem a loan when the audit snapshot is recorded'
);

-- Renewal is a lifecycle event, so loan_renewals_insert_owner requires the
-- owner AND that renewed_by is the caller (no acting in someone else's name).
select lives_ok(
  $$ insert into public.loan_renewals (
       loan_id, renewed_on, renewed_by, interest_paid_paise, new_maturity_on
     ) values (
       'b0000000-0000-4000-8000-000000000002', DATE '2024-07-01',
       tests.get_supabase_uid('rls_owner'), 45000, DATE '2025-01-01'
     ) $$,
  'owner CAN record a renewal'
);

select throws_ok(
  $$ insert into public.loan_renewals (
       loan_id, renewed_on, renewed_by, interest_paid_paise, new_maturity_on
     ) values (
       'b0000000-0000-4000-8000-000000000002', DATE '2024-07-01',
       tests.get_supabase_uid('rls_staff'), 45000, DATE '2025-02-01'
     ) $$,
  '42501',
  NULL,
  'an owner cannot record a renewal in another user''s name'
);

-- ---------------------------------------------------------------------------
-- 17-19. Storage objects are path-namespaced by customer id.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('rls_cust1');

select results_eq(
  $$ select name from storage.objects where bucket_id = 'receipts' $$,
  $$ select tests.get_supabase_uid('rls_cust1')::text || '/receipts/own.jpg' $$,
  'a customer sees only objects under their own {customer_id}/ prefix'
);

select tests.authenticate_as('rls_staff');

-- The INSERT policy requires the first path segment to be a uuid, which is what
-- stops receipts being dropped at the bucket root where no customer owns them.
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('receipts', 'loose-receipt.jpg') $$,
  '42501',
  NULL,
  'an object whose first path segment is not a uuid is rejected'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('receipts', 'f47ac10b-58cc-4372-a567-0e02b2c3d479/receipts/ok.jpg') $$,
  'a uuid-prefixed object path is accepted from a shop user'
);

-- Item photos share the private receipts bucket under {customer_id}/items/.
-- The existing receipts_shop_insert policy constrains only the FIRST path
-- segment, which is why reusing the bucket needed no new storage policy.
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('receipts', 'f47ac10b-58cc-4372-a567-0e02b2c3d479/items/ornament.jpg') $$,
  'an items/ object is accepted in the receipts bucket from a shop user'
);

-- ---------------------------------------------------------------------------
-- Pledged items and their photos follow the loan's owner, via a join.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('rls_cust1');

select results_eq(
  $$ select ornament_type from public.loan_items $$,
  $$ values ('Gold chain'::text) $$,
  'a customer sees only the items pledged on their own loan'
);

select is_empty(
  $$ select id from public.loan_items
     where id = 'e0000000-0000-4000-8000-000000000002' $$,
  'a customer cannot see another customer''s loan_items'
);

select results_eq(
  $$ select storage_path from public.loan_item_photos $$,
  $$ select tests.get_supabase_uid('rls_cust1')::text || '/items/chain.jpg' $$,
  'a customer sees only their own item photos'
);

select throws_ok(
  $$ insert into public.loan_items (
       loan_id, ornament_type, gross_weight_mg, net_weight_mg
     ) values (
       'a0000000-0000-4000-8000-000000000001', 'Self-added', 1000, 1000
     ) $$,
  '42501',
  NULL,
  'a customer cannot add an item to their own loan'
);

-- KYC objects are isolated exactly like receipts: own prefix only.
select results_eq(
  $$ select name from storage.objects where bucket_id = 'kyc' $$,
  $$ select tests.get_supabase_uid('rls_cust1')::text || '/pan.jpg' $$,
  'a customer cannot read another customer''s KYC document'
);

select results_eq(
  $$ select notice_type from public.loan_notices $$,
  $$ values ('overdue'::text) $$,
  'a customer sees only notices for their own loan'
);

-- ---------------------------------------------------------------------------
-- A customer may never self-verify their own KYC.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.profiles
     set kyc_verified_on = DATE '2024-01-01',
         kyc_verified_by = tests.get_supabase_uid('rls_cust1')
     where id = tests.get_supabase_uid('rls_cust1') $$,
  'only shop users may set KYC verification',
  'a customer cannot set their own kyc_verified_on'
);

-- Control: the guard must block self-verification WITHOUT freezing the rest of
-- the profile, or customers could no longer correct their own address.
select lives_ok(
  $$ update public.profiles set address = 'Shivaji Nagar, Pune'
     where id = tests.get_supabase_uid('rls_cust1') $$,
  'a customer CAN still edit their own ordinary profile fields'
);

select tests.authenticate_as('rls_staff');

select throws_ok(
  $$ insert into public.loan_renewals (
       loan_id, renewed_on, renewed_by, interest_paid_paise, new_maturity_on
     ) values (
       'b0000000-0000-4000-8000-000000000002', DATE '2024-08-01',
       tests.get_supabase_uid('rls_staff'), 45000, DATE '2025-03-01'
     ) $$,
  '42501',
  NULL,
  'staff cannot record a renewal'
);

select lives_ok(
  $$ insert into public.loan_items (
       loan_id, ornament_type, gross_weight_mg, net_weight_mg
     ) values (
       'a0000000-0000-4000-8000-000000000001', 'Counter-added bangle', 8000, 7800
     ) $$,
  'staff CAN add a pledged item at the counter'
);

select lives_ok(
  $$ update public.profiles
     set kyc_verified_on = DATE '2024-01-01',
         kyc_verified_by = tests.get_supabase_uid('rls_staff'),
         id_document_type = 'pan',
         id_document_last4 = 'AB1C'
     where id = tests.get_supabase_uid('rls_cust1') $$,
  'a shop user CAN verify a customer''s KYC'
);

select tests.clear_authentication();

select * from finish();
rollback;
