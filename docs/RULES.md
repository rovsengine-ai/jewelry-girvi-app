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
- The 30-day month grid is ANCHORED TO THE PLEDGE DATE and never moves.
  A payment reduces what is owed; it does not restart the clock. Paying more
  often must never make a loan cost more.
- `partial_period_mode = min_month_then_pro_rata` (shop default): the first
  month of the loan is ALWAYS charged in full, however early the customer
  redeems. After that, complete months charge in full and the trailing
  remainder is charged per day — EXCEPT that a remainder of at least
  `round_up_threshold_days` (default 24) is rounded up to a whole month.
  The first-month minimum applies ONCE PER LOAN, not once per period.
  Worked example, 50,000 rupee loan at 300 bps (one month = 1,500 rupees):
  | Redeemed on | Interest | Why |
  |---|---|---|
  | day 5 | 1,500 | first-month minimum |
  | day 25 | 1,500 | remainder 25 ≥ 24, rounds up |
  | day 30 | 1,500 | exactly one month |
  | day 33 | 1,650 | one month + 3 days at 50/day |
  | day 55 | 3,000 | one month + remainder 25 rounded up |
- `partial_period_mode = full_period`: an incomplete trailing period still
  charges a full 30-day period of simple interest once at least 1 day has
  elapsed in that period. That interest is not capitalized until the period
  completes (or until the day-180 capitalization event). No first-month floor
  is needed because any elapsed day already charges a whole period.
- `partial_period_mode = pro_rata`: trailing days use
  interest = balance × rate_bps × days_elapsed / (30 × 10000),
  rounded half-up once. Strictly per-day, so NO first-month minimum applies.
- Grace days before a period counts: 0
## Merchant model
- SIMPLE interest per day, forever. No compounding, ever.
- interest = principal × rate_bps × days / (30 × 10000)
- Default rate: 1.5% per 30 days = 150 bps.
## Payment allocation
- A payment clears ACCRUED INTEREST first, then PRINCIPAL.
- Overpayment beyond principal + accrued interest is refunded (not held as credit).
- A payment does NOT restart accrual and does NOT move a period boundary.
  Interest already charged for a period stays charged; the payment reduces the
  unpaid balance of it. Any part still unpaid when the period closes
  capitalizes as usual.
- Reducing principal mid-loan is not a counter workflow: the customer clears
  the interest and principal and the loan is RENEWED at a new principal
  (see Overdue / forfeiture). The engine still handles a partial principal
  payment safely — later interest accrues on the reduced balance and interest
  already charged for the open period is never withdrawn.
## Editability
- Every loan stores its OWN terms, copied from defaults at creation:
  interest_model, rate_bps, simple_period_days, compound_every_days,
  grace_days, partial_period_mode, round_up_threshold_days.
- Changing shop defaults affects NEW loans only. Never existing ones
  (unless an owner edits that loan individually).
- An owner may edit a specific loan's terms. Every such edit is written
  to loan_term_changes (who, when, old, new, reason). Staff may not.
## Loan lifecycle
- `status` is one of `active`, `redeemed`, `closed`, `defaulted`.
- `redeemed` = the customer paid in full and the goods were handed back. It is
  only ever written together with `redeemed_on`, `redeemed_by` and
  `closure_balance_paise` (the total due at that moment). That snapshot is an
  immutable audit figure: editing a rate later must never rewrite what was
  actually collected. A CHECK enforces the pairing.
- `closed` = a loan that ended before the audit columns existed. Historic rows
  keep this value rather than being relabelled `redeemed`, because we do not
  know when or by whom they were settled and will not invent it.
- `defaulted` = forfeiture ran its course; goods were not redeemed.
- Archive is not a status. `archive_loan` sets `archived_at` / `archived_by` /
  `archive_reason` / `archive_balance_paise` together (CHECK: all NULL or all
  NOT NULL). Staff and customers cannot see an archived loan or its child
  rows; the owner can, and `unarchive_loan` restores them. Client DELETE
  always raises. Archived loans are excluded from `loans_overdue_as_of`,
  `generate_loan_notices`, `shop_rate_yield`, and
  `customer_loan_reminder_schedule`.
- Only an OWNER may move a loan to `redeemed`, `closed` or `defaulted`, and only
  an owner may write the redemption fields. Enforced by `redeem_loan` (row lock
  + status check inside a transaction) and the mutation trigger, not the UI.
  A second call on an already-redeemed loan returns the original snapshot and
  inserts nothing. `default_loan` is the only writer of `defaulted` (row lock,
  overdue via `loans_overdue_as_of`, six months after `disbursed_on`, immutable
  `default_balance_paise`). A second call returns the original snapshot.
- Interest-only renewal after the simple period is `renew_loan`: it records the
  accrued interest as a payment, writes `loan_renewals`, and the overdue
  function then uses `new_maturity_on`. Idempotent on `(loan_id, renewed_on)`.
## Pledged items
- A girvi ticket pledges one or more ornaments, held in `loan_items`.
- Each item has a 1-based `position` unique per loan, set from the
  `create_loan` input array (`jsonb_array_elements WITH ORDINALITY`). Photos,
  the printed pledge, and the release checklist follow `position`, never
  `created_at` (that timestamp is identical for every item in one transaction).
- Each new item is `gold` or `silver` (required on `create_loan`). Historic
  rows may have NULL metal; never default missing metal to gold.
- Weights are INTEGER MILLIGRAMS (`gross_weight_mg`, `net_weight_mg`), same
  discipline as paise and basis points. Never a decimal gram.
- `purity_karat` NULL means NOT ASSESSED. Never assume 22: an invented purity
  flows into valuation and misprices the pledge. Silver is weight-only: no
  millesimal, no karat, no valuation.
- Gold valuation is frozen onto `loan_items.valuation_paise` at insert, with
  `gold_rate_id` pointing at the `gold_rates` row used. SQL only; half-up once.
  Silver and unassessed gold stay NULL. A missing quote never blocks the
  counter.
- Karat maps to millesimal bands, not karat/24: 24K=999, 22K=916, 18K=750
  (75%), 14K=585, 10K=417. Unmapped karat is not valued.
- Formula when only a 999 quote exists:
  `div_round_half_up(net_mg × millesimal × price_per_10g_999_paise, 10_000_000)`.
  A matching-band row (manual 916, etc.) uses
  `div_round_half_up(net_mg × price_per_10g_paise, 10_000)` with no extra
  karat factor.
- Wastage: none. LTV: none. Principal is whatever staff types; assessed value
  is not a cap.
- `gold_rates` quotes are NEVER IBJA. There is no live vendor feed in the app.
  Quotes are `source=manual` (seed or `set_manual_gold_rate`). Every UI figure
  for a frozen valuation is labelled “not IBJA”. A missing quote never blocks
  the counter.
- Item photos live in the private `receipts` bucket at
  `{customer_id}/items/...`, reachable only through a signed URL.
## KYC
- Store at most the LAST 4 characters of an ID number, never the full number in
  a queryable column.
- NO Aadhaar image is ever stored. An unmasked photo of an Aadhaar card is the
  full 12-digit number, and UIDAI requires the first 8 digits to be redacted
  before a copy is stored; this shop has no masking pipeline. Document photos
  are allowed for PAN, voter ID, driving licence and passport only, and a CHECK
  enforces it.
- KYC documents live in a separate private `kyc` bucket at `{customer_id}/...`
  Customers read their own; shop users read all; only an owner may delete.
- A customer may READ but never WRITE `kyc_verified_on` / `kyc_verified_by`.
  Verification is shop-set, enforced by a trigger because the existing
  `profiles_update_own` policy otherwise permits self-service edits.
## Overdue / forfeiture
- A loan is overdue after its current due date: latest `loan_renewals.new_maturity_on`,
  else `disbursed_on + simple_period_days` (180 days for the shop default).
- Overdue-ness is decided in SQL by `loans_overdue_as_of(p_as_of)`, never by a
  date comparison in JavaScript.
- Forfeiture / auction eligible after 6 months, with a renewal warning;
  customer may pay interest only for renewal after 6 months.
- Notices are written by `generate_loan_notices(p_as_of)` into `loan_notices`
  with channel `in_app`. The unique key is `(loan_id, notice_type, scheduled_for)`
  so a later run does not spam. Windows (calendar days on the shop date):
  | Type | When | scheduled_for |
  |---|---|---|
  | due_soon | 15 days before due_on through due_on | due_on |
  | overdue | p_as_of > due_on | due_on |
  | renewal_offer | same as overdue | due_on |
  | forfeiture_warning | days_overdue ≥ 30 | due_on + 30 |
- Until an SMS/WhatsApp provider is chosen, the shop exports a CSV call list
  from the overdue RPC. Do not send SMS from this app.
- Customers get **local OS notifications** (not remote push) for due-soon
  (15 days before), due-today, and overdue. Fire times are
  `customer_loan_reminder_schedule()` at 09:00 Asia/Kolkata. The phone only
  schedules those timestamps; it does not decide overdue-ness. Remote push is
  not used: Expo Go on Android cannot receive it from SDK 53. The customer
  must open the app at least once after login so the OS can hold the schedule.
## Analytics
- Projected yield is `shop_rate_yield()`: owner-only, grouped by the `rate_bps`
  that actually exist on active loans. One-period yield is
  `sum(period_interest_paise(principal, rate))` per group; 6P/12P multiply that
  already-rounded figure. Never recompute interest in JavaScript.
## Permissions
| Action | Owner | Staff |
|---|---|---|
| Create loan | yes | yes |
| Record payment | yes | yes |
| View all loans | yes (including archived) | yes (not archived) |
| Close / redeem loan | yes | no|
| Renew loan (interest only) | yes | no |
| Edit a loan's terms | yes | no |
| Edit shop defaults | yes | no |
| Archive / unarchive a loan | yes | no |
| View analytics / totals | yes | no |
| Generate in-app notices | yes | yes |
| Export overdue call list | yes | yes |

Printed pledge records and redemption receipts are generated from frozen loan
terms (and `closure_balance_paise` after redeem). They are not legal advice.
