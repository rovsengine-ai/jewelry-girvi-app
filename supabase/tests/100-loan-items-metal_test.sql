-- metal is required on new create_loan inserts; historic rows may be NULL.
begin;
select plan(5);

select tests.create_supabase_user('mt_staff');
select tests.create_supabase_user('mt_cust');

update public.profiles set role = 'staff' where id = tests.get_supabase_uid('mt_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('mt_cust');

-- Historic row: metal stays NULL. The CHECK allows it; create_loan does not.
insert into public.loans (
  id, customer_id, serial_number, item_name, weight_grams, status,
  principal_paise, rate_bps, disbursed_on, interest_model,
  simple_period_days, compound_every_days, grace_days,
  partial_period_mode, round_up_threshold_days
) values (
  '08000000-0000-4000-8000-000000000001', tests.get_supabase_uid('mt_cust'),
  'T100-HIST', 'Old chain', 10.000, 'active',
  1000000, 300, DATE '2024-01-01', 'retail', 180, 30, 0, 'min_month_then_pro_rata', 24
);

insert into public.loan_items (
  loan_id, ornament_type, gross_weight_mg, net_weight_mg, quantity
) values (
  '08000000-0000-4000-8000-000000000001', 'Old chain', 10000, 10000, 1
);

select is(
  (select metal from public.loan_items where loan_id = '08000000-0000-4000-8000-000000000001'),
  NULL,
  'historic loan_items may have NULL metal'
);

select tests.authenticate_as('mt_staff');

select throws_ok(
  $$
    select public.create_loan(
      tests.get_supabase_uid('mt_cust'),
      'T100-NOMETAL',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[{"ornament_type":"Chain","gross_weight_mg":10000,"net_weight_mg":10000,"quantity":1}]'::jsonb
    )
  $$,
  'items_invalid: metal must be gold or silver',
  'create_loan requires metal on every new item'
);

select lives_ok(
  $$
    select public.create_loan(
      tests.get_supabase_uid('mt_cust'),
      'T100-OK',
      null,
      1000000,
      300,
      DATE '2024-01-01',
      'retail'::public.interest_model,
      null,
      '[
        {"metal":"gold","ornament_type":"Chain","gross_weight_mg":10500,"net_weight_mg":10000,"stone_deduction_mg":500,"purity_karat":null,"quantity":1},
        {"metal":"silver","ornament_type":"Payal","gross_weight_mg":40000,"net_weight_mg":40000,"quantity":1,"purity_karat":22}
      ]'::jsonb
    )
  $$,
  'create_loan accepts gold and silver in one array'
);

select results_eq(
  $$
    select i.metal, i.purity_karat
    from public.loan_items i
    join public.loans l on l.id = i.loan_id
    where l.serial_number = 'T100-OK'
    order by i.ornament_type
  $$,
  $$ values ('gold'::text, NULL::smallint), ('silver'::text, NULL::smallint) $$,
  'gold purity stays unset when omitted; silver karat is ignored'
);

select throws_ok(
  $$
    insert into public.loan_items (
      loan_id, ornament_type, metal, gross_weight_mg, net_weight_mg, quantity
    ) values (
      '08000000-0000-4000-8000-000000000001', 'Fake', 'platinum', 1000, 1000, 1
    )
  $$,
  'new row for relation "loan_items" violates check constraint "loan_items_metal_chk"',
  'metal CHECK rejects values other than gold or silver'
);

select tests.clear_authentication();
select * from finish();
rollback;
