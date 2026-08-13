# Interest & Repayment Rules
## Money & rates
- All amounts stored as INTEGER PAISE. Never float, never rupees-as-decimal.
- Rates stored as INTEGER BASIS POINTS per 30-day period.
  2% per month = 200 bps.
- Rounding: half-up to the nearest paisa, applied once at the end of each
  accrual period. Never mid-calculation.
## Day counting
- Shop timezone: Asia/Kolkata.
- A loan has `disbursed_on DATE` (not a timestamp) set at the counter.
- Day 0 = disbursal date. Interest accrues from day 0.
- A "period" is 30 calendar days. Not a calendar month.
- On the disbursal date itself (0 days elapsed), accrued interest is 0.
## Retail customer model
- Until day 180 (simple phase): SIMPLE interest on the current outstanding
  principal (reduced by principal payments). No compounding.
- On day 180: unpaid accrued interest CAPITALIZES into principal.
- After day 180: COMPOUNDS every 30 days on the new balance
  (period interest is added to principal at each completed compound period).
- `partial_period_mode = full_period` (shop default): an incomplete trailing
  period still charges a full 30-day period of simple interest once at least
  1 day has elapsed in that period. That interest is not capitalized until
  the period completes (or until the day-180 capitalization event).
- `partial_period_mode = pro_rata`: trailing days use
  interest = balance × rate_bps × days_elapsed / (30 × 10000),
  rounded half-up once.
- Grace days before a period counts: 0
## Merchant model
- SIMPLE interest per day, forever. No compounding, ever.
- interest = principal × rate_bps × days / (30 × 10000)
- Default rate: 1.5% per 30 days = 150 bps.
## Payment allocation
- A payment clears ACCRUED INTEREST first, then PRINCIPAL.
- Overpayment beyond principal + accrued interest is refunded (not held as credit).
- Interest accrual restarts from the payment date on the reduced balance.
## Editability
- Every loan stores its OWN terms, copied from defaults at creation:
  interest_model, rate_bps, simple_period_days, compound_every_days,
  grace_days, partial_period_mode.
- Changing shop defaults affects NEW loans only. Never existing ones
  (unless an owner edits that loan individually).
- An owner may edit a specific loan's terms. Every such edit is written
  to loan_term_changes (who, when, old, new, reason). Staff may not.
## Overdue / forfeiture
- A loan is overdue after 180 days past disbursal.
- Forfeiture / auction eligible after 6 months, with a renewal warning;
  customer may pay interest only for renewal after 6 months.
## Permissions
| Action | Owner | Staff |
|---|---|---|
| Create loan | yes | yes |
| Record payment | yes | yes |
| View all loans | yes | yes |
| Close / redeem loan | yes | no|
| Edit a loan's terms | yes | no |
| Edit shop defaults | yes | no |
| Delete a loan | yes | no |
| View analytics / totals | yes | no|
