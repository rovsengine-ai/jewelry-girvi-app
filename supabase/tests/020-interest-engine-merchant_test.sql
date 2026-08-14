-- Merchant model: SIMPLE interest per day, forever. No compounding, ever, and
-- no first-month minimum (docs/RULES.md, "Merchant model").
--
-- Loan: 1_000_000 paise @ 150 bps (the shop's default merchant rate).
--   one day  = round_half_up(1e6 * 150 * 1  / (30*10000)) = 500
--   30 days  = round_half_up(1e6 * 150 * 30 / 300000)     = 15000
--   180 days = 1e6 * 150 * 180 / 300000                   = 90000
--   210 days = 1e6 * 150 * 210 / 300000                   = 105000
--   365 days = 1e6 * 150 * 365 / 300000                   = 182500
--
-- Calendar anchors (disbursal 2024-01-01, a leap year):
--   day 1 = 2024-01-02     day 30 = 2024-01-31   day 60 = 2024-03-01
--   day 180 = 2024-06-29   day 210 = 2024-07-29  day 365 = 2024-12-31
begin;
select plan(12);

-- day_0: nothing has elapsed.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 150, DATE '2024-01-01', DATE '2024-01-01',
      'merchant', 180, 30, 0, 'full_period', '[]'::jsonb
    )
  $$,
  $$ select 0::bigint, 1000000::bigint, 1000000::bigint, 0::bigint, 0::bigint, 0::bigint $$,
  'merchant day_0: accrued 0'
);

-- day_1: a single day is charged as a single day. Under retail/full_period the
-- same day would cost a whole period (15000), so this is the defining contrast.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 150, DATE '2024-01-01', DATE '2024-01-02',
      'merchant', 180, 30, 0, 'full_period', '[]'::jsonb
    )
  $$,
  $$ select 500::bigint, 1000000::bigint, 1000500::bigint, 0::bigint, 0::bigint, 0::bigint $$,
  'merchant day_1: charged per day (500), not a whole period'
);

-- day_30
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 150, DATE '2024-01-01', DATE '2024-01-31',
      'merchant', 180, 30, 0, 'full_period', '[]'::jsonb
    )
  $$,
  $$ select 15000::bigint, 1000000::bigint, 1015000::bigint, 0::bigint, 0::bigint, 0::bigint $$,
  'merchant day_30: 15000'
);

-- day_180: the retail capitalization day. Merchant must NOT capitalize:
-- principal stays 1000000 and the 90000 stays as accrued interest.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 150, DATE '2024-01-01', DATE '2024-06-29',
      'merchant', 180, 30, 0, 'full_period', '[]'::jsonb
    )
  $$,
  $$ select 90000::bigint, 1000000::bigint, 1090000::bigint, 0::bigint, 0::bigint, 0::bigint $$,
  'merchant day_180: NO capitalization, principal still 1000000'
);

-- day_210: 30 days past the retail capitalization day, still strictly linear.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 150, DATE '2024-01-01', DATE '2024-07-29',
      'merchant', 180, 30, 0, 'full_period', '[]'::jsonb
    )
  $$,
  $$ select 105000::bigint, 1000000::bigint, 1105000::bigint, 0::bigint, 0::bigint, 0::bigint $$,
  'merchant day_210: 105000, still no compounding'
);

-- day_365: one full year of simple interest.
select is(
  (select accrued_interest_paise from public.compute_loan_balances(
    1000000, 150, DATE '2024-01-01', DATE '2024-12-31',
    'merchant', 180, 30, 0, 'full_period', '[]'::jsonb
  )),
  182500::bigint,
  'merchant day_365: 182500 (1e6*150*365/300000), perfectly linear'
);

-- Linearity as a property: interest at day 210 must be exactly 7x interest at
-- day 30 (210 = 7*30). Compounding would break this.
select is(
  (select accrued_interest_paise from public.compute_loan_balances(
    1000000, 150, DATE '2024-01-01', DATE '2024-07-29',
    'merchant', 180, 30, 0, 'full_period', '[]'::jsonb
  )),
  7 * (select accrued_interest_paise from public.compute_loan_balances(
    1000000, 150, DATE '2024-01-01', DATE '2024-01-31',
    'merchant', 180, 30, 0, 'full_period', '[]'::jsonb
  )),
  'merchant is linear: day_210 interest = 7 x day_30 interest'
);

-- partial_period_mode is irrelevant to merchant: pro_rata and full_period must
-- give identical answers on a mid-period day.
select is(
  (select total_due_paise from public.compute_loan_balances(
    1000000, 150, DATE '2024-01-01', DATE '2024-01-02',
    'merchant', 180, 30, 0, 'full_period', '[]'::jsonb
  )),
  (select total_due_paise from public.compute_loan_balances(
    1000000, 150, DATE '2024-01-01', DATE '2024-01-02',
    'merchant', 180, 30, 0, 'pro_rata', '[]'::jsonb
  )),
  'merchant ignores partial_period_mode entirely'
);

-- Part-payment of interest must carry the remainder (Defect A, merchant side).
-- Day 30 charge 15000, pay 5000 → 10000 owed. Day 60 total charge 30000, so
-- 30000 - 5000 = 25000 owed.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 150, DATE '2024-01-01', DATE '2024-03-01',
      'merchant', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-01-31','amount_paise',5000))
    )
  $$,
  $$ select 25000::bigint, 1000000::bigint, 1025000::bigint, 5000::bigint, 0::bigint, 0::bigint $$,
  'merchant part-payment: 30000 charged by day 60 minus 5000 paid = 25000 owed'
);

-- An interest-only payment must not restart accrual (Defect B, merchant side).
-- Paying the full 15000 on day 30 leaves exactly the days 31-60 charge owed.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, interest_paid_paise
    from public.compute_loan_balances(
      1000000, 150, DATE '2024-01-01', DATE '2024-03-01',
      'merchant', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-01-31','amount_paise',15000))
    )
  $$,
  $$ select 15000::bigint, 1000000::bigint, 15000::bigint $$,
  'merchant interest-only payment does not restart accrual: total charged still 30000'
);

-- A payment that reduces principal starts a NEW accrual segment, so later
-- interest is charged on the balance actually held:
--   day 30 : charge 15000 on 1000000; pay 115000 → 15000 interest + 100000
--            principal, leaving principal 900000
--   day 60 : 30 days on 900000 = 900000*150*30/300000 = 13500
--   total interest charged = 15000 + 13500 = 28500
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 150, DATE '2024-01-01', DATE '2024-03-01',
      'merchant', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-01-31','amount_paise',115000))
    )
  $$,
  $$ select 13500::bigint, 900000::bigint, 913500::bigint, 15000::bigint, 100000::bigint, 0::bigint $$,
  'merchant principal reduction: later interest accrues on 900000 (13500, not 15000)'
);

-- Overpayment beyond principal + interest is refunded, never held as credit.
-- Day 30: interest 15000 + principal 1000000 = 1015000 due; pay 1020000.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 150, DATE '2024-01-01', DATE '2024-01-31',
      'merchant', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-01-31','amount_paise',1020000))
    )
  $$,
  $$ select 0::bigint, 0::bigint, 0::bigint, 15000::bigint, 1000000::bigint, 5000::bigint $$,
  'merchant overpayment of 5000 is refunded, not carried'
);

select * from finish();
rollback;
