-- Retail + full_period interest engine: ported golden cases + hypothesis probes.
-- Principal 1_000_000 paise @ 300 bps → period interest = round_half_up(1e6*300/10000) = 30000.
begin;
select plan(22);

-- ---------------------------------------------------------------------------
-- Ported golden cases (from interest_engine_assertions.sql)
-- ---------------------------------------------------------------------------

-- day_0: 0 days elapsed → accrued 0 (RULES: disbursal day itself is 0).
select is(
  (select accrued_interest_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-01-01',
    'retail', 180, 30, 0, 'full_period', '[]'::jsonb
  )),
  0::bigint,
  'day_0 accrued is 0'
);
select is(
  (select outstanding_principal_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-01-01',
    'retail', 180, 30, 0, 'full_period', '[]'::jsonb
  )),
  1000000::bigint,
  'day_0 principal unchanged'
);

-- day_29: 29 days → full_period charges 1×30000 (trailing incomplete period).
select is(
  (select accrued_interest_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-01-30',
    'retail', 180, 30, 0, 'full_period', '[]'::jsonb
  )),
  30000::bigint,
  'day_29 full_period accrued = 30000'
);

-- day_30: exactly one complete period → 30000.
select is(
  (select accrued_interest_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-01-31',
    'retail', 180, 30, 0, 'full_period', '[]'::jsonb
  )),
  30000::bigint,
  'day_30 accrued = 30000'
);

-- day_179: 179/30 = 5 complete + 29 rem → 6×30000 = 180000 under full_period.
select is(
  (select accrued_interest_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-06-28',
    'retail', 180, 30, 0, 'full_period', '[]'::jsonb
  )),
  180000::bigint,
  'day_179 accrued = 180000'
);

-- day_180: capitalization — 6×30000=180000 folds into principal → 1180000, accrued 0.
select is(
  (select accrued_interest_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-06-29',
    'retail', 180, 30, 0, 'full_period', '[]'::jsonb
  )),
  0::bigint,
  'day_180 accrued cleared by capitalization'
);
select is(
  (select outstanding_principal_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-06-29',
    'retail', 180, 30, 0, 'full_period', '[]'::jsonb
  )),
  1180000::bigint,
  'day_180 principal = 1000000 + 180000'
);

-- day_181: 1 day after cap → full_period on 1180000 → round(1180000*300/10000)=35400.
select is(
  (select accrued_interest_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-06-30',
    'retail', 180, 30, 0, 'full_period', '[]'::jsonb
  )),
  35400::bigint,
  'day_181 accrued = 35400'
);

-- day_210: 30 days after cap → one compound period capitalizes 35400 → principal 1215400.
select is(
  (select accrued_interest_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-07-29',
    'retail', 180, 30, 0, 'full_period', '[]'::jsonb
  )),
  0::bigint,
  'day_210 accrued 0 after compound boundary'
);
select is(
  (select outstanding_principal_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-07-29',
    'retail', 180, 30, 0, 'full_period', '[]'::jsonb
  )),
  1215400::bigint,
  'day_210 principal = 1180000 + 35400'
);

-- mid_period_payment: day 10 charges 30000; payment 30000 clears interest only.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, interest_paid_paise, principal_paid_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-01-11',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-01-11','amount_paise',30000))
    )
  $$,
  $$ select 0::bigint, 1000000::bigint, 30000::bigint, 0::bigint $$,
  'mid_period_payment clears interest only'
);

-- payment_clears_interest: day 30 accrued 30000 cleared by 30000 payment.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, interest_paid_paise, principal_paid_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-01-31',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-01-31','amount_paise',30000))
    )
  $$,
  $$ select 0::bigint, 1000000::bigint, 30000::bigint, 0::bigint $$,
  'payment_clears_interest'
);

-- full_payoff: 30000 interest + 1000000 principal = 1030000.
select results_eq(
  $$
    select accrued_interest_paise, outstanding_principal_paise, interest_paid_paise,
           principal_paid_paise, overpayment_refunded_paise
    from public.compute_loan_balances(
      1000000, 300, DATE '2024-01-01', DATE '2024-01-31',
      'retail', 180, 30, 0, 'full_period',
      jsonb_build_array(jsonb_build_object('paid_on','2024-01-31','amount_paise',1030000))
    )
  $$,
  $$ select 0::bigint, 0::bigint, 30000::bigint, 1000000::bigint, 0::bigint $$,
  'full_payoff zeros balances'
);

-- ---------------------------------------------------------------------------
-- H1: repeated tiny payments under full_period inflate interest
-- Arithmetic if buggy: each day resets anchor and charges a fresh 30000.
-- After three 1-paise payments on days 1/2/3: accrued ≈ 89997 >> 30000.
-- Correct upper bound for 3 days with no principal change: one period = 30000.
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

select diag(format(
  'H1 observed accrued=%s interest_paid=%s (cap 30000)',
  (select accrued_interest_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-01-04',
    'retail', 180, 30, 0, 'full_period',
    jsonb_build_array(
      jsonb_build_object('paid_on','2024-01-02','amount_paise',1),
      jsonb_build_object('paid_on','2024-01-03','amount_paise',1),
      jsonb_build_object('paid_on','2024-01-04','amount_paise',1)
    )
  )),
  (select interest_paid_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-01-04',
    'retail', 180, 30, 0, 'full_period',
    jsonb_build_array(
      jsonb_build_object('paid_on','2024-01-02','amount_paise',1),
      jsonb_build_object('paid_on','2024-01-03','amount_paise',1),
      jsonb_build_object('paid_on','2024-01-04','amount_paise',1)
    )
  ))
));

-- ---------------------------------------------------------------------------
-- H2: unpaid accrued must be capitalized at a post-180 compound boundary
-- Setup: capitalize at day 180 → principal 1180000.
-- Day 200: accrued = full_period 20d = 35400; pay 10000 → accrued left 25400, anchor=200.
-- Day 230: compound at anchor+30. RULES: unpaid accrued capitalizes into principal.
-- Expected if correct: principal = 1180000 + 25400 = 1205400, accrued = 0.
-- If unpaid is destroyed and replaced by period_interest(1180000)=35400:
--   principal = 1215400 (PROVEN BUG signature from first run).
-- ---------------------------------------------------------------------------
select is(
  (select outstanding_principal_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-08-18',
    'retail', 180, 30, 0, 'full_period',
    jsonb_build_array(
      jsonb_build_object('paid_on','2024-07-19','amount_paise',10000)
    )
  )),
  1205400::bigint,
  'H2: unpaid accrued 25400 must capitalize → principal 1205400'
);

select diag(format(
  'H2 after day200 pay total_due=%s; after day230 total_due=%s accrued=%s principal=%s',
  (select total_due_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-07-19',
    'retail', 180, 30, 0, 'full_period',
    jsonb_build_array(jsonb_build_object('paid_on','2024-07-19','amount_paise',10000))
  )),
  (select total_due_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-08-18',
    'retail', 180, 30, 0, 'full_period',
    jsonb_build_array(jsonb_build_object('paid_on','2024-07-19','amount_paise',10000))
  )),
  (select accrued_interest_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-08-18',
    'retail', 180, 30, 0, 'full_period',
    jsonb_build_array(jsonb_build_object('paid_on','2024-07-19','amount_paise',10000))
  )),
  (select outstanding_principal_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-08-18',
    'retail', 180, 30, 0, 'full_period',
    jsonb_build_array(jsonb_build_object('paid_on','2024-07-19','amount_paise',10000))
  ))
));

-- ---------------------------------------------------------------------------
-- H3: payment on capitalization day — document ACTUAL allocation (ask user)
-- Payment 50000 on day 180. Cap first → accrued 0, principal 1180000, then pay principal.
-- Alternate desired: interest-first before cap would pay 180000 interest needs larger payment.
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
  'H3 ACTUAL: day-180 payment allocates AFTER capitalization (all to principal)'
);

-- H3 alternate expectation if interest-cleared BEFORE capitalization:
-- accrued 180000, pay 50000 → interest_paid 50000, principal still 1000000, accrued 130000
-- (then if cap happens after: principal 1130000). Documented as failing probe for discussion.
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
-- H4: grace_days is a no-op today
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
-- H5: mid-period full payoff of engine total_due reaches zero balances (closeable)
-- Day 10 total_due = 1000000 + 30000 = 1030000 under full_period.
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

-- Interest-first allocation: paying 1000000 mid-period clears 30000 interest first,
-- then 970000 principal → leftover principal 30000, accrued 0.
-- closeLoanIfFullyPaid still blocks (outstanding principal > 0), but NOT via leftover accrued.
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
-- H7: same-day payment order must be deterministic across repeats
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

select diag(format(
  'H7 runA principal=%s runB principal=%s (JSON order swapped)',
  (select outstanding_principal_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-01-31',
    'retail', 180, 30, 0, 'full_period',
    jsonb_build_array(
      jsonb_build_object('paid_on','2024-01-31','amount_paise',20000),
      jsonb_build_object('paid_on','2024-01-31','amount_paise',10000)
    )
  )),
  (select outstanding_principal_paise from public.compute_loan_balances(
    1000000, 300, DATE '2024-01-01', DATE '2024-01-31',
    'retail', 180, 30, 0, 'full_period',
    jsonb_build_array(
      jsonb_build_object('paid_on','2024-01-31','amount_paise',10000),
      jsonb_build_object('paid_on','2024-01-31','amount_paise',20000)
    )
  ))
));

-- ---------------------------------------------------------------------------
-- H8: as_of before disbursed_on
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
