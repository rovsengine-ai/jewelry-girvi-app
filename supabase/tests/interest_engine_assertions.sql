-- SQL assertion suite for public.compute_loan_balances
-- Principal 1_000_000 paise, 300 bps, retail, full_period, disbursed 2024-01-01.
-- Run via: execute against the linked project (or psql).

WITH params AS (
  SELECT
    1000000::bigint AS principal,
    300::integer AS rate,
    DATE '2024-01-01' AS d0,
    'retail'::public.interest_model AS model,
    180 AS simple_days,
    30 AS period_days,
    0 AS grace,
    'full_period'::public.partial_period_mode AS mode
),
cases AS (
  SELECT * FROM params, LATERAL (
    VALUES
      ('day_0', DATE '2024-01-01', '[]'::jsonb),
      ('day_29', DATE '2024-01-30', '[]'::jsonb),
      ('day_30', DATE '2024-01-31', '[]'::jsonb),
      ('day_179', DATE '2024-06-28', '[]'::jsonb),
      ('day_180', DATE '2024-06-29', '[]'::jsonb),
      ('day_181', DATE '2024-06-30', '[]'::jsonb),
      ('day_210', DATE '2024-07-29', '[]'::jsonb),
      ('mid_period_payment', DATE '2024-01-11',
        jsonb_build_array(jsonb_build_object('paid_on','2024-01-11','amount_paise',30000))),
      ('payment_clears_interest', DATE '2024-01-31',
        jsonb_build_array(jsonb_build_object('paid_on','2024-01-31','amount_paise',30000))),
      ('full_payoff', DATE '2024-01-31',
        jsonb_build_array(jsonb_build_object('paid_on','2024-01-31','amount_paise',1030000)))
  ) AS t(test_name, as_of, payments)
),
actual AS (
  SELECT c.test_name, b.*
  FROM cases c
  CROSS JOIN LATERAL public.compute_loan_balances(
    c.principal, c.rate, c.d0, c.as_of, c.model, c.simple_days, c.period_days, c.grace, c.mode, c.payments
  ) b
),
expected AS (
  SELECT * FROM (VALUES
    ('day_0', 0::bigint, 1000000::bigint, 1000000::bigint, 0::bigint, 0::bigint, 0::bigint),
    ('day_29', 30000, 1000000, 1030000, 0, 0, 0),
    ('day_30', 30000, 1000000, 1030000, 0, 0, 0),
    ('day_179', 180000, 1000000, 1180000, 0, 0, 0),
    ('day_180', 0, 1180000, 1180000, 0, 0, 0),
    ('day_181', 35400, 1180000, 1215400, 0, 0, 0),
    ('day_210', 0, 1215400, 1215400, 0, 0, 0),
    ('mid_period_payment', 0, 1000000, 1000000, 30000, 0, 0),
    ('payment_clears_interest', 0, 1000000, 1000000, 30000, 0, 0),
    ('full_payoff', 0, 0, 0, 30000, 1000000, 0)
  ) AS e(
    test_name, accrued_interest_paise, outstanding_principal_paise, total_due_paise,
    interest_paid_paise, principal_paid_paise, overpayment_refunded_paise
  )
)
SELECT
  e.test_name,
  (a.accrued_interest_paise = e.accrued_interest_paise
   AND a.outstanding_principal_paise = e.outstanding_principal_paise
   AND a.total_due_paise = e.total_due_paise
   AND a.interest_paid_paise = e.interest_paid_paise
   AND a.principal_paid_paise = e.principal_paid_paise
   AND a.overpayment_refunded_paise = e.overpayment_refunded_paise) AS passed
FROM expected e
JOIN actual a USING (test_name)
ORDER BY e.test_name;
