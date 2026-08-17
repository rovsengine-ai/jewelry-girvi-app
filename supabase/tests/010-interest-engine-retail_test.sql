-- Retail interest engine: ported golden cases, the owner-decided accrual rule,
-- Defect A / Defect B regressions, and hypothesis probes.
--
-- Golden-case loan: 1_000_000 paise @ 300 bps, partial_period_mode='full_period'
--   period interest = round_half_up(1e6 * 300 / 10000) = 30000
-- Rate-card loan: 5_000_000 paise @ 300 bps, mode='min_month_then_pro_rata'
--   period interest = round_half_up(5e6 * 300 / 10000) = 150000  (1500 rupees)
--   one day pro-rata = round_half_up(5e6 * 300 * 1 / 300000) = 5000 (50 rupees)
--
-- Calendar anchors (disbursal 2024-01-01, a leap year):
--   day 5 = 2024-01-06    day 25 = 2024-01-26   day 29 = 2024-01-30
--   day 30 = 2024-01-31   day 33 = 2024-02-03   day 55 = 2024-02-25
--   day 179 = 2024-06-28  day 180 = 2024-06-29  day 181 = 2024-06-30
--   day 200 = 2024-07-19  day 205 = 2024-07-24  day 210 = 2024-07-29
--   day 230 = 2024-08-18
begin;
select plan(27);

-- ---------------------------------------------------------------------------
-- Ported golden cases (from the deleted interest_engine_assertions.sql).
-- The original asserted ALL SIX output columns per case; these restore that.
-- Column order: accrued, principal, total_due, interest_paid, principal_paid, refunded.
-- ---------------------------------------------------------------------------

-- day_0: 0 days elapsed → accrued 0 (RULES: the disbursal day itself is 0).
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-01-01',
      'retail', 180, 30, 0, 'full_period', '[]'::jsonb
    )
  $$,
  $$ select 0::bigint, 1000000::bigint, 1000000::bigint, 0::bigint, 0::bigint, 0::bigint $$,
  'day_0: accrued 0, principal untouched'
);

-- day_29: 29 days → full_period charges 1 whole period (ceil(29/30)=1) = 30000.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-01-30',
      'retail', 180, 30, 0, 'full_period', '[]'::jsonb
    )
  $$,
  $$ select 30000::bigint, 1000000::bigint, 1030000::bigint, 0::bigint, 0::bigint, 0::bigint $$,
  'day_29: 1 full period = 30000'
);

-- day_30: exactly one complete period (30/30=1, remainder 0) → 30000.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-01-31',
      'retail', 180, 30, 0, 'full_period', '[]'::jsonb
    )
  $$,
  $$ select 30000::bigint, 1000000::bigint, 1030000::bigint, 0::bigint, 0::bigint, 0::bigint $$,
  'day_30: exactly 1 period = 30000'
);

-- day_179: 179/30 = 5 complete + 29 remainder → full_period charges 6 = 180000.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-06-28',
      'retail', 180, 30, 0, 'full_period', '[]'::jsonb
    )
  $$,
  $$ select 180000::bigint, 1000000::bigint, 1180000::bigint, 0::bigint, 0::bigint, 0::bigint $$,
  'day_179: 6 full periods = 180000, still simple phase'
);

-- day_180: capitalization. 6*30000 = 180000 folds into principal → 1180000.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-06-29',
      'retail', 180, 30, 0, 'full_period', '[]'::jsonb
    )
  $$,
  $$ select 0::bigint, 1180000::bigint, 1180000::bigint, 0::bigint, 0::bigint, 0::bigint $$,
  'day_180: 180000 capitalizes into principal → 1180000'
);

-- day_181: 1 day into the first compound window → full_period on 1180000
--          = round_half_up(1180000*300/10000) = 35400.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-06-30',
      'retail', 180, 30, 0, 'full_period', '[]'::jsonb
    )
  $$,
  $$ select 35400::bigint, 1180000::bigint, 1215400::bigint, 0::bigint, 0::bigint, 0::bigint $$,
  'day_181: one compound period accruing on 1180000 = 35400'
);

-- day_210: the first compound window closes and 35400 capitalizes
--          → principal 1180000 + 35400 = 1215400, accrued 0.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-07-29',
      'retail', 180, 30, 0, 'full_period', '[]'::jsonb
    )
  $$,
  $$ select 0::bigint, 1215400::bigint, 1215400::bigint, 0::bigint, 0::bigint, 0::bigint $$,
  'day_210: compound boundary capitalizes 35400 → 1215400'
);

-- mid_period_payment: day 10 charges one full period 30000; a 30000 payment
--                     clears interest exactly and leaves principal alone.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-01-11',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-01-11','amount_paise',30000))
    )
  $$,
  $$ select 0::bigint, 1000000::bigint, 1000000::bigint, 30000::bigint, 0::bigint, 0::bigint $$,
  'mid_period_payment: 30000 clears interest only'
);

-- payment_clears_interest: day 30 accrued 30000, cleared exactly by 30000.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-01-31',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-01-31','amount_paise',30000))
    )
  $$,
  $$ select 0::bigint, 1000000::bigint, 1000000::bigint, 30000::bigint, 0::bigint, 0::bigint $$,
  'payment_clears_interest: exact interest payment on a period boundary'
);

-- full_payoff: 30000 interest + 1000000 principal = 1030000, nothing refunded.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-01-31',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-01-31','amount_paise',1030000))
    )
  $$,
  $$ select 0::bigint, 0::bigint, 0::bigint, 30000::bigint, 1000000::bigint, 0::bigint $$,
  'full_payoff: interest first then principal, both cleared'
);

-- ---------------------------------------------------------------------------
-- The owner-decided rate card, asserted directly against the table published
-- in docs/RULES.md. 50,000 rupee loan (5_000_000 paise) at 300 bps,
-- min_month_then_pro_rata with round_up_threshold_days = 24.
--
--   day  5: remainder 5 < 24 → pro_rata(5) = 25000, but the once-per-loan
--           first-month floor lifts it to one whole month  → 150000
--   day 25: remainder 25 >= 24 → rounds up to one whole month → 150000
--   day 30: exactly 1 complete month, remainder 0           → 150000
--   day 33: 1 complete month + remainder 3 < 24 at 5000/day → 165000
--   day 55: 1 complete month + remainder 25 >= 24 rounds up → 300000
-- ---------------------------------------------------------------------------
select results_eq(
  $$
    select d.label, b.accrued_interest_paise
    from (values
      ('day_5'::text,  DATE '2024-01-06'),
      ('day_25'::text, DATE '2024-01-26'),
      ('day_30'::text, DATE '2024-01-31'),
      ('day_33'::text, DATE '2024-02-03'),
      ('day_55'::text, DATE '2024-02-25')
    ) as d(label, as_of)
    cross join lateral public.compute_loan_balances(
      5000000, 300, DATE '2024-01-01', d.as_of,
      'retail', 180, 30, 0, 'min_month_then_pro_rata', '[]'::jsonb, 24
    ) b
    order by d.as_of
  $$,
  $$ values ('day_5'::text, 150000::bigint),
            ('day_25'::text, 150000::bigint),
            ('day_30'::text, 150000::bigint),
            ('day_33'::text, 165000::bigint),
            ('day_55'::text, 300000::bigint) $$,
  'mode min_month_then_pro_rata matches the rate card published in docs/RULES.md'
);

-- The same days under full_period, which the owner keeps as a selectable
-- alternative. It rounds every partial month up, so day 33 costs a full
-- 3000 rupees instead of 1650.
select results_eq(
  $$
    select d.label, b.accrued_interest_paise
    from (values
      ('day_5'::text,  DATE '2024-01-06'),
      ('day_25'::text, DATE '2024-01-26'),
      ('day_30'::text, DATE '2024-01-31'),
      ('day_33'::text, DATE '2024-02-03'),
      ('day_55'::text, DATE '2024-02-25')
    ) as d(label, as_of)
    cross join lateral public.compute_loan_balances(
      5000000, 300, DATE '2024-01-01', d.as_of,
      'retail', 180, 30, 0, 'full_period', '[]'::jsonb, 24
    ) b
    order by d.as_of
  $$,
  $$ values ('day_5'::text, 150000::bigint),
            ('day_25'::text, 150000::bigint),
            ('day_30'::text, 150000::bigint),
            ('day_33'::text, 300000::bigint),
            ('day_55'::text, 300000::bigint) $$,
  'mode full_period rounds every partial month up (day 33 = 300000, not 165000)'
);

-- pro_rata is strictly per-day, so the first-month floor must NOT apply:
-- day 5 = round_half_up(5e6*300*5/300000) = 25000, not 150000.
select is(
  (select accrued_interest_paise from public.compute_loan_balances(
    5000000, 300, DATE '2024-01-01', DATE '2024-01-06',
    'retail', 180, 30, 0, 'pro_rata', '[]'::jsonb, 24
  )),
  25000::bigint,
  'mode pro_rata gets no first-month floor: day 5 = 25000'
);

-- ---------------------------------------------------------------------------
-- DEFECT B regression — a payment must not restart the month clock.
--
-- Customer pays one month of interest (150000) on day 7, then redeems day 33.
-- Total interest for the loan must be the day-33 figure, 165000, so only 15000
-- is still owed. The old engine moved the period anchor to the payment date,
-- which started a fresh month and charged 300000 in total.
-- ---------------------------------------------------------------------------
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      5000000, 300, DATE '2024-01-01', DATE '2024-02-03',
      'retail', 180, 30, 0, 'min_month_then_pro_rata',
      jsonb_build_array(jsonb_build_object('paid_on','2024-01-08','amount_paise',150000)),
      24
    )
  $$,
  $$ select 15000::bigint, 5000000::bigint, 5015000::bigint, 150000::bigint, 0::bigint, 0::bigint $$,
  'Defect B: interest paid on day 7 then redeem day 33 → total interest 165000, only 15000 left'
);

-- ---------------------------------------------------------------------------
-- DEFECT A — unpaid accrued interest must never be discarded.
--
-- Shared setup: capitalization at day 180 → principal 1180000. Day 200 is
-- 20 days into the window [180, 210), and full_period charges one whole period
-- on 1180000 = 35400 for it. A part-payment on day 200 leaves the rest owed.
--
-- Pre-fix, the remainder was overwritten on the next read (and zeroed at the
-- next compound boundary), so a part-payment bought the customer nothing:
-- paying 10000 and paying 30000 both left total_due at exactly 1215400.
-- ---------------------------------------------------------------------------

-- A1: read day 205, crossing no boundary, so no compounding is involved and
--     the extra 20000 paid must show up as exactly 20000 less owed.
--       pay 10000 → 35400 - 10000 = 25400 still owed
--       pay 30000 → 35400 - 30000 =  5400 still owed
select is(
  (
    select total_due_paise from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-07-24',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-07-19','amount_paise',10000))
    )
  ) - (
    select total_due_paise from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-07-24',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-07-19','amount_paise',30000))
    )
  ),
  20000::bigint,
  'A1: paying 20000 more on day 200 owes exactly 20000 less on day 205'
);

-- A2: the same day-205 read, all six columns. The 25400 remainder must survive
--     as accrued interest, and principal must be untouched at 1180000.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-07-24',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-07-19','amount_paise',10000))
    )
  $$,
  $$ select 25400::bigint, 1180000::bigint, 1205400::bigint, 10000::bigint, 0::bigint, 0::bigint $$,
  'A2: the 25400 unpaid remainder survives a read that crosses no boundary'
);

-- A3: read day 230, past the day-210 boundary. The unpaid 25400 must CAPITALIZE
--     (RULES: unpaid accrued interest capitalizes into principal):
--       principal = 1180000 + 25400 = 1205400
--     Day 230 is then 20 days into the window [210, 240), charging one period
--     on 1205400 = round_half_up(1205400*300/10000) = 36162.
--       total_due = 1205400 + 36162 = 1241562
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise,
           interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-08-18',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-07-19','amount_paise',10000))
    )
  $$,
  $$ select 36162::bigint, 1205400::bigint, 1241562::bigint, 10000::bigint, 0::bigint, 0::bigint $$,
  'A3: the unpaid 25400 capitalizes at day 210 → principal 1205400, then 36162 accrues'
);

-- A4: the day-230 differential. Paying 20000 more means 20000 less capitalized
--     at day 210, which also avoids one period of interest on that 20000:
--       20000 + round_half_up(20000*300/10000) = 20000 + 600 = 20600
--     Pre-fix this differential was 0.
select is(
  (
    select total_due_paise from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-08-18',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-07-19','amount_paise',10000))
    )
  ) - (
    select total_due_paise from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-08-18',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-07-19','amount_paise',30000))
    )
  ),
  20600::bigint,
  'A4: paying earlier also avoids compounding on the amount paid (20000 + 3% = 20600)'
);

-- ---------------------------------------------------------------------------
-- H1: with the month grid fixed to the pledge date, tiny daily payments cannot
-- inflate the charge. Three 1-paise payments on days 1-3, read day 4: the
-- first month's 30000 is charged once, so 29997 remains owed.
-- ---------------------------------------------------------------------------
select ok(
  (
    select accrued_interest_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-01-04',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(
        jsonb_build_object('paid_on','2024-01-02','amount_paise',1),
        jsonb_build_object('paid_on','2024-01-03','amount_paise',1),
        jsonb_build_object('paid_on','2024-01-04','amount_paise',1)
      )
    )
  ) <= 30000,
  'H1: accrued after 3 daily 1-paise payments must not exceed one period (30000)'
);

-- H2: the capitalized principal at day 230 after a 10000 part-payment.
select is(
  (select outstanding_principal_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-08-18',
    'retail', 180, 30, 0, 'full_period',
    jsonb_build_array(jsonb_build_object('paid_on','2024-07-19','amount_paise',10000))
  )),
  1205400::bigint,
  'H2: unpaid accrued 25400 capitalizes → principal 1205400'
);

-- ---------------------------------------------------------------------------
-- H3: payment landing exactly on the capitalization day.
-- Capitalization runs first, so accrued is already 0 and the whole 50000 is
-- applied to the freshly grown principal: 1180000 - 50000 = 1130000.
-- ---------------------------------------------------------------------------
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, interest_paid_paise, principal_paid_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-06-29',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-06-29','amount_paise',50000))
    )
  $$,
  $$ select 0::bigint, 1130000::bigint, 0::bigint, 50000::bigint $$,
  'H3 ACTUAL: a day-180 payment allocates AFTER capitalization (all to principal)'
);

-- H3 alternate: had interest been cleared BEFORE capitalization, interest_paid
-- would be 50000. Documented as not the current behaviour.
select isnt(
  (
    select interest_paid_paise from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-06-29',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-06-29','amount_paise',50000))
    )
  ),
  50000::bigint,
  'H3 ALTERNATE probe: interest-first-before-cap would set interest_paid=50000 (not actual)'
);

-- ---------------------------------------------------------------------------
-- H4: grace_days is a no-op today (RULES fix grace at 0).
-- ---------------------------------------------------------------------------
select is(
  (select accrued_interest_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-01-31',
    'retail', 180, 30, 0, 'full_period', '[]'::jsonb
  )),
  (select accrued_interest_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-01-31',
    'retail', 180, 30, 5, 'full_period', '[]'::jsonb
  )),
  'H4: grace_days=5 changes nothing vs grace_days=0'
);

-- ---------------------------------------------------------------------------
-- H5: paying the engine's exact mid-period total_due zeros both sides, so a
-- redemption is reachable. Day 10 total_due = 1000000 + 30000 = 1030000.
-- ---------------------------------------------------------------------------
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, total_due_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-01-11',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-01-11','amount_paise',1030000))
    )
  $$,
  $$ select 0::bigint, 0::bigint, 0::bigint $$,
  'H5: paying exact mid-period total_due zeros both sides (close reachable)'
);

-- H5b: paying 1000000 mid-period clears 30000 interest first, then 970000 of
-- principal, leaving principal 30000 open and accrued 0. The already-charged
-- 30000 must not be re-derived downward on the reduced balance.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-01-11',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-01-11','amount_paise',1000000))
    )
  $$,
  $$ select 0::bigint, 30000::bigint $$,
  'H5b: 1e6 mid-period pays interest first → accrued 0, principal 30000 still open'
);

-- ---------------------------------------------------------------------------
-- H7: same-day payments must be order-independent in the JSON array.
-- ---------------------------------------------------------------------------
select is(
  (
    select outstanding_principal_paise from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-01-31',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(
        jsonb_build_object('paid_on','2024-01-31','amount_paise',20000),
        jsonb_build_object('paid_on','2024-01-31','amount_paise',10000)
      )
    )
  ),
  (
    select outstanding_principal_paise from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-01-31',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(
        jsonb_build_object('paid_on','2024-01-31','amount_paise',10000),
        jsonb_build_object('paid_on','2024-01-31','amount_paise',20000)
      )
    )
  ),
  'H7: same-day payments yield same principal regardless of JSON array order'
);

-- ---------------------------------------------------------------------------
-- H8: as_of before disbursed_on must raise.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$
    select * from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2023-12-31',
      'retail', 180, 30, 0, 'full_period', '[]'::jsonb
    )
  $$,
  'as_of (2023-12-31) before disbursed_on (2024-01-01)',
  'H8: as_of before disbursed_on raises'
);

select * from finish();
rollback;
