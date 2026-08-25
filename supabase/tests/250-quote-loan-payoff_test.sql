-- quote_loan_payoff: shop owner and staff may quote; customers are refused.
-- Arithmetic matches compute_loan_balances (RULES.md rate-card examples).
begin;
select plan(10);

select tests.create_supabase_user('q_owner');
select tests.create_supabase_user('q_staff');
select tests.create_supabase_user('q_cust');

update public.profiles set role = 'owner' where id = tests.get_supabase_uid('q_owner');
update public.profiles set role = 'staff' where id = tests.get_supabase_uid('q_staff');
update public.profiles set role = 'retail_customer' where id = tests.get_supabase_uid('q_cust');

update public.shop_defaults
set
  interest_model = 'retail',
  rate_bps = 300,
  merchant_rate_bps = 150,
  simple_period_days = 180,
  compound_every_days = 30,
  grace_days = 0,
  partial_period_mode = 'min_month_then_pro_rata',
  round_up_threshold_days = 24
where id = 1;

select tests.authenticate_as('q_owner');

-- Rate-card: 50,000 rupees @ 300 bps, pledge 2024-01-01.
-- day 5 = 2024-01-06 → first-month floor = 1,500 rupees.
select results_eq(
  $$
    select accrued_interest_paise, principal_paise, total_due_paise,
           days_elapsed, why_code, first_month_floor_applied, remainder_rounded_up
    from public.quote_loan_payoff(
      5000000, DATE '2024-01-01', DATE '2024-01-06', 'retail'
    )
  $$,
  $$ select 150000::bigint, 5000000::bigint, 5150000::bigint,
            5, 'first_month_floor'::text, true, false $$,
  'owner day 5 retail: first-month floor 150000'
);

-- day 55 = 2024-02-25 → one month + remainder 25 rounded up = 3,000 rupees.
select results_eq(
  $$
    select accrued_interest_paise, total_due_paise, days_elapsed,
           complete_periods, remainder_days, why_code, remainder_rounded_up
    from public.quote_loan_payoff(
      5000000, DATE '2024-01-01', DATE '2024-02-25', 'retail'
    )
  $$,
  $$ select 300000::bigint, 5300000::bigint, 55, 1, 25, 'remainder_round_up'::text, true $$,
  'owner day 55 retail: remainder 25 rounds up'
);

-- Same calendar day: interest 0.
select results_eq(
  $$
    select accrued_interest_paise, total_due_paise, why_code
    from public.quote_loan_payoff(
      5000000, DATE '2024-01-01', DATE '2024-01-01', 'retail'
    )
  $$,
  $$ select 0::bigint, 5000000::bigint, 'same_day'::text $$,
  'owner same-day quote: interest 0'
);

-- Merchant: 1.5%/30d, strictly per day. day 5 = 12,500 paise.
select results_eq(
  $$
    select accrued_interest_paise, total_due_paise, rate_bps, why_code
    from public.quote_loan_payoff(
      5000000, DATE '2024-01-01', DATE '2024-01-06', 'merchant'
    )
  $$,
  $$ select 12500::bigint, 5012500::bigint, 150, 'merchant_per_day'::text $$,
  'owner merchant day 5: per-day at merchant_rate_bps'
);

select tests.authenticate_as('q_staff');

select results_eq(
  $$
    select accrued_interest_paise, total_due_paise
    from public.quote_loan_payoff(
      5000000, DATE '2024-01-01', DATE '2024-01-06', 'retail'
    )
  $$,
  $$ select 150000::bigint, 5150000::bigint $$,
  'staff may quote the same retail payoff'
);

select tests.authenticate_as('q_cust');

select throws_ok(
  $$
    select total_due_paise from public.quote_loan_payoff(
      5000000, DATE '2024-01-01', DATE '2024-01-06', 'retail'
    )
  $$,
  'shop_only: only owner or staff may quote a payoff',
  'a customer cannot quote a payoff'
);

select tests.clear_authentication();

select throws_ok(
  $$
    select total_due_paise from public.quote_loan_payoff(
      5000000, DATE '2024-01-01', DATE '2024-01-06', 'retail'
    )
  $$,
  'shop_only: only owner or staff may quote a payoff',
  'anonymous callers cannot quote a payoff'
);

select tests.authenticate_as('q_owner');

select throws_ok(
  $$
    select total_due_paise from public.quote_loan_payoff(
      0, DATE '2024-01-01', DATE '2024-01-06', 'retail'
    )
  $$,
  'principal must be greater than zero',
  'zero principal is refused'
);

select throws_matching(
  $$
    select total_due_paise from public.quote_loan_payoff(
      5000000, DATE '2024-01-10', DATE '2024-01-01', 'retail'
    )
  $$,
  'as_of .* before disbursed_on',
  'pay-on before pledge date is refused'
);

select is(
  (
    select accrued_interest_paise
    from public.quote_loan_payoff(
      5000000, DATE '2024-01-01', DATE '2024-01-06', 'retail'
    )
  ),
  (
    select accrued_interest_paise
    from public.compute_loan_balances(
      5000000, 300, DATE '2024-01-01', DATE '2024-01-06',
      'retail', 180, 30, 0, 'min_month_then_pro_rata', '[]'::jsonb, 24
    )
  ),
  'quote interest matches compute_loan_balances for the same inputs'
);

select * from finish();
rollback;
