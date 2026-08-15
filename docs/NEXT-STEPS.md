# NEXT STEPS — jewelry-girvi-app

Read-only analysis of the working tree at commit `0f3dc37`, 2026-08-15.
Nothing in the project was modified to produce this file.

Companion docs: [`RULES.md`](RULES.md) (domain law), [`AUDIT.md`](AUDIT.md)
(previous read-only pass). This file is the **forward plan** — what to build
next and in what order. Each item ends with a prompt you can paste into Cursor.

---

## 0. The uncomfortable part, first

The riskiest thing in this repo is not a missing feature. It is that **a large,
carefully-specified system has never been observed working end to end.**

| Evidence of quality | Evidence of it running |
| --- | --- |
| 15 SQL migrations | — |
| 13 pgTAP suites (`000`–`120`) | — |
| 227 Jest tests, 27 suites, all green | — |
| `tsc --noEmit` clean | — |
| 14 domain routes, 0 boilerplate | — |
| `docs/RULES.md` — an unusually rigorous spec | — |

Every test in this repo is a **unit** test. None of them opens the app, signs
in, or talks to the hosted database. `supabase/config.toml` and `.env` both
point at hosted project `deaigzfypmgsppkzmdqt`, and **nothing in the repo can
tell you whether those 15 migrations were ever applied there.** [Certain — this
is stated as an open question in `AUDIT.md` STEP 8, and remains open.]

So the correct next step is not a feature. It is **verification**. Two hours of
smoke-testing will teach you more about this codebase than two weeks of new
screens, and it may invalidate work you would otherwise build on top of.

---

## 1. What is genuinely finished

Do not let Cursor rebuild any of this.

**Backend — the strongest layer.** Interest engine (retail simple → day-180
capitalization → compounding; merchant simple-forever), `create_loan` atomic
RPC, `redeem_loan` / `renew_loan` owner-only RPCs with row locks and idempotency,
RLS separating shop from customer, `loan_items` with 1-based `position`,
milligram weights, gold valuation frozen at pledge against a `gold_rates` row,
`generate_loan_notices` with a spam-proof unique key, `shop_rate_yield`,
`loans_overdue_as_of`, `customer_loan_reminder_schedule`. All asserted in SQL.

**Client flows that exist and are wired to the backend.** Phone OTP login and
role routing; admin dashboard (loan list, status filter, search, yield,
overdue list, notice generation + display, CSV call-list export); scanner
(camera, OCR via Edge Function, multi-item gold/silver capture in mg, per-item
photos keyed to `create_loan` item ids, signature, atomic loan creation);
loan detail with payments; owner redemption with per-item release checklist;
owner interest-only renewal; KYC capture (last-4 only, Aadhaar photos blocked);
customer dashboard with own receipts and local OS reminders; printable pledge
and redemption docs from frozen terms.

**Three Edge Functions:** `create-walkin-customer`, `extract-receipt`,
`refresh-gold-rate`.

---

## 2. Real gaps found in this pass

Ranked by how much damage each one does if ignored.

### G1 — A loan can never become `defaulted` [Certain]

`loan_status` includes `defaulted`. The dashboard offers it as a filter
(`dashboard.tsx:277`). `Badge` and `redemption.ts` both render it. But **no SQL
function and no client code ever writes it.** Only `redeem_loan` and
`renew_loan` mutate status, and neither produces `defaulted`.

`RULES.md` says forfeiture is "eligible after 6 months, with a renewal warning",
and `generate_loan_notices` already emits `forfeiture_warning` at 30 days
overdue. So the system warns about a forfeiture it has no way to record. The
filter is a dead control that will always return zero rows.

### G2 — Owner-only settings have no UI [Certain]

`RULES.md` §Permissions grants the owner two powers the app does not expose:

- **Edit shop defaults.** `shop_defaults` is read (`loanService.ts:193`) and
  never written. Changing the shop's rate means opening the Supabase dashboard.
- **Edit a specific loan's terms.** The `loan_term_changes` audit table exists
  in the migration chain and is referenced **only** by generated types — no
  screen, no service function, no migration RPC to write it.

### G3 — Phone normalization is duplicated, not shared [Likely]

SQL defines `find_profile_by_phone`, but `findCustomerIdByPhone`
(`loanService.ts:176`) bypasses it and queries `profiles` directly with a
TypeScript-normalized string. `AUDIT.md` STEP 7 #7 already flags that
`toE164India`, SQL `normalize_phone_e164`, and the walk-in Edge Function must
stay in lockstep — this is the specific place where they can silently drift.
A leading-zero mismatch here means a returning customer gets a duplicate
profile and their loan history disappears.

### G4 — No palette has been chosen [Certain]

`src/constants/theme.ts` still ships create-expo-app greys and says so in a
comment. Three complete, contrast-checked directions sit beside it
(`warmPaper`, `coolLedger`, `shopfrontContrast`). Screens are already fully
tokenized, so this is a one-object swap — but `PalettePreview` is deliberately
not mounted, so nobody has ever looked at the three side by side.

### G5 — Unused declared dependencies [Certain, low severity]

`@expo/ui`, `expo-glass-effect`, and `expo-image-picker` are in `package.json`
with zero imports. Dead weight in the build, and `@expo/ui` in particular
invites a future contributor to introduce iOS-only UI.

---

## 3. Decide these two things before writing any code

Everything below branches on your answers.

1. **Is this going live at a real counter, or is it still a build?**
   If real money is about to move through it, Step P0 is not optional and
   nothing else matters until it passes.
2. **One shop, or many?** `shop_defaults` is a single row pinned to `id = 1`.
   That is a correct, simple choice for one shop and a rewrite for a second.
   Decide now; do not let it be decided by accident later.

---

## P0 — Prove it runs (do this first, today)

**Why:** Everything after this is built on the assumption that the app opens and
the hosted schema matches the repo. Neither is currently evidence-backed.

**No Cursor needed. Run these yourself:**

```bash
# 1. Does hosted production match the 15 migrations in this repo?
npx supabase migration list --linked

# 2. Do the SQL assertions still pass locally?
npx supabase start && npx supabase db reset && npx supabase test db

# 3. Does the app actually open?
npx expo run:ios          # or run:android — a dev build, NOT Expo Go
```

Expo Go will fail on `expo-camera`, `expo-notifications`, `expo-print`, and
`react-native-signature-canvas`. You need a dev client.

**Done when** you have personally: signed in with OTP, created a two-item gold
loan through the scanner, seen it on the dashboard, recorded a payment,
redeemed it as owner, and printed the redemption receipt. Write down every
place it broke. That list, not this document, becomes your real backlog.

If `migration list --linked` shows any local migration missing remotely, stop
and resolve that before anything else.

---

## P1 — Choose the palette and look at it

**Why:** Cheapest high-impact change in the repo, and it unblocks any judgement
about the UI. Ten minutes of work, currently blocked only on nobody having
seen the options.

> **Cursor prompt**
>
> Read `docs/RULES.md` and `src/constants/theme.ts` first.
>
> Add a temporary route `src/app/(admin)/palette.tsx` that renders
> `PalettePreview` for all three ids in `PaletteDirections` stacked vertically,
> each under its `label` and `summary`. This route is scaffolding for a design
> decision — do not link it from the dashboard, and add a header comment saying
> it must be deleted once a palette is chosen.
>
> Change nothing else. Do not edit `theme.ts`, do not touch any existing screen,
> do not pick a palette for me.

Look at all three on a real phone, in the lighting the shop actually has. Then:

> **Cursor prompt (after you have chosen)**
>
> In `src/constants/theme.ts`, replace the body of the exported `Colors` object
> with the `light` and `dark` palettes from `PaletteDirections.<YOUR_CHOICE>`.
> Keep `Colors` satisfying `{ light: Palette; dark: Palette }` and keep every
> key. Do not hard-code any hex in a screen or component. Leave the three
> `PaletteDirections` in place for future reference. Then delete
> `src/app/(admin)/palette.tsx` and run `npx tsc --noEmit` and `npm test`.

---

## P2 — Close the forfeiture hole (G1)

**Why:** It is the only place where the schema, the rules doc, the notice
generator, and the UI all agree a feature should exist — and it is absent. A
dead filter on the dashboard is worse than no filter.

Follow the shape of the existing `redeem_loan` work: migration → pgTAP → service
→ screen. Do it in that order, in separate Cursor turns.

> **Cursor prompt — step 1, SQL only**
>
> Read `docs/RULES.md` (§Loan lifecycle, §Overdue / forfeiture, §Permissions)
> and `supabase/migrations/20260815040000_redeem_and_renew_rpcs.sql` before
> writing anything. Follow that file's conventions exactly.
>
> Add ONE new migration `supabase/migrations/20260815110000_default_loan.sql`
> defining `public.default_loan(p_loan_id uuid, p_defaulted_on date, p_reason text)`:
>
> - Owner-only. Staff must be refused, matching how `redeem_loan` enforces it.
> - Refuse unless the loan is `active` AND is overdue per
>   `loans_overdue_as_of` — never a date comparison outside SQL.
> - Refuse unless `p_defaulted_on` is at least 6 months past `disbursed_on`,
>   per RULES §Overdue / forfeiture.
> - Lock the loan row and re-check status inside the transaction, exactly as
>   `redeem_loan` does.
> - Snapshot the balance at that moment into an immutable audit column, the
>   same way `closure_balance_paise` works for redemption. Add whatever column
>   and CHECK constraint that requires, mirroring the existing redemption pairing.
> - Idempotent: a second call on an already-defaulted loan returns the original
>   snapshot and inserts nothing.
>
> Do NOT write any TypeScript in this turn. Do NOT modify an existing migration
> file. Do NOT edit `redeem_loan`.

> **Cursor prompt — step 2, tests only**
>
> Add `supabase/tests/130-default-loan_test.sql` following the exact style of
> `060-redemption-renewal_test.sql`. Cover: staff refused; owner allowed;
> not-yet-overdue refused; under-6-months refused; already-redeemed refused;
> second call idempotent; balance snapshot matches `loan_balances_as_of` at
> that date. Run `npx supabase test db` and make it pass. Change no other file.

> **Cursor prompt — step 3, client**
>
> Add `defaultLoan(...)` to `src/services/loanService.ts` calling the
> `default_loan` RPC, following the shape of `redeemLoan` including its error
> handling. Regenerate or hand-extend `src/types/supabase.ts` for the new RPC.
>
> Then add an owner-only action on `src/app/(admin)/loan/[id]/index.tsx` that
> calls it, visible ONLY when the loan is `active`, overdue, and the signed-in
> role is `owner` — check the role the same way the redeem action already does.
> Require a typed reason before enabling the button. Use existing primitives
> (`Button`, `FormNotice`, `Card`) and theme tokens only; no new hex, no new
> spacing values. Do not perform any money or date arithmetic in JavaScript.

---

## P3 — Owner settings and loan-term edits (G2)

**Why:** Right now changing a rate requires the Supabase dashboard. That is
fine for you and impossible for a shop owner. Also closes `loan_term_changes`,
which is currently a table nothing can write.

> **Cursor prompt — shop defaults**
>
> Read `docs/RULES.md` §Editability and §Permissions first.
>
> Add an owner-only route `src/app/(admin)/settings.tsx` that reads the
> `shop_defaults` row (`id = 1`) and lets an owner edit `rate_bps`,
> `partial_period_mode`, `round_up_threshold_days`, `simple_period_days`,
> `compound_every_days`, and `grace_days`.
>
> Requirements:
> - Staff must be redirected, the same way `(admin)/_layout.tsx` gates roles.
>   Do not rely on hiding the link — RLS and the layout gate are the boundary.
> - Rates are entered as a percentage per 30 days and stored as INTEGER basis
>   points. Parse and format only; never do money arithmetic in JS.
> - Show a permanent notice on the screen stating that changes affect NEW loans
>   only, quoting RULES §Editability.
> - Use existing components and theme tokens.
>
> If `shop_defaults` lacks an RLS policy permitting owner UPDATE, add it in a
> NEW migration — do not edit an existing migration file — and cover it in
> `supabase/tests/050-rls-and-permissions_test.sql`.

> **Cursor prompt — per-loan term edit** (do this only after the above ships)
>
> Add an owner-only "Edit terms" flow on the loan detail screen that writes
> both the loan's term columns and a `loan_term_changes` row (who, when, old,
> new, reason) in a single transaction. Implement it as a new SQL RPC in a new
> migration — the write must be atomic in SQL, not two client calls — with
> pgTAP coverage proving staff are refused and that no term edit can occur
> without a matching audit row.

---

## P4 — Tighten the loose ends

> **Cursor prompt — phone lockstep (G3)**
>
> `findCustomerIdByPhone` in `src/services/loanService.ts` queries `profiles`
> directly while SQL already provides `find_profile_by_phone`. Switch the
> client to the RPC so normalization lives in exactly one place. Then add a
> test asserting `toE164India` and SQL `normalize_phone_e164` agree on: a
> 10-digit number, a `0`-prefixed number, a `+91` number, a `91` number without
> `+`, and a number with spaces or dashes. If they disagree, report the
> difference and stop — do not "fix" it by changing the SQL until I decide
> which behaviour is correct.

> **Cursor prompt — dead deps (G5)**
>
> Remove `@expo/ui`, `expo-glass-effect`, and `expo-image-picker` from
> `package.json`. First prove with a repo-wide search that none is imported
> anywhere in `src/`, and paste that evidence. Then run `npm install`,
> `npx tsc --noEmit`, `npm test`, and `npx expo start` to confirm nothing
> broke. If `expo-image-picker` turns out to be reachable from any native
> config, keep it and say so.

> **Also worth doing, no prompt needed:** `.env` currently has real Moonshot
> and GoldAPI keys sitting on lines whose leading `#` was stripped. They are
> gitignored and not `EXPO_PUBLIC_*`, so they will not reach the app bundle —
> but that file is not where they belong. Move them to
> `supabase/functions/.env` (already gitignored) and restore the comment
> markers in `.env`.

---

## 4. Guardrails to give Cursor every time

This project has stricter invariants than most. Cursor will violate them by
default, because the defaults of every React Native tutorial contradict them.
Paste this block at the top of any non-trivial prompt:

```
Before writing code, read AGENTS.md, .cursorrules, and docs/RULES.md.
Check the exact versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/.

Hard rules for this repo:
- Money is INTEGER PAISE. Rates are INTEGER BASIS POINTS per 30 days.
  Weights are INTEGER MILLIGRAMS. Never a float, never rupees-as-decimal,
  never decimal grams.
- ALL interest, balance, valuation, and overdue arithmetic happens in SQL.
  JavaScript may parse input and format output. Nothing else.
- Never edit an existing migration file. Always add a new one.
- Every new RPC needs pgTAP coverage in supabase/tests/, including a test
  proving the wrong role is refused.
- RLS is the security boundary, not a client-side .eq() filter and not a
  hidden button.
- Admin routes live in src/app/(admin)/, customer routes in
  src/app/(customer)/. Never mix them.
- Colours, spacing, radii, and type come from src/constants/theme.ts.
  No new hex, no magic numbers in screens.
- Never store an Aadhaar image. Never store more than the last 4 characters
  of an ID number.
- Gold quotes are never IBJA and every figure shown must say so.
- Do not add SMS/WhatsApp sending. The shop exports a CSV call list.

When done, run: npx tsc --noEmit && npm test && npx supabase test db
```

---

## 5. Suggested order, one line each

1. **P0** — prove it runs against the hosted project. Nothing else until this passes.
2. **P1** — pick the palette, because you cannot judge anything you cannot see.
3. **P2** — close the forfeiture hole; it is the one true feature gap.
4. **P3** — owner settings, so the shop is not dependent on you and the Supabase dashboard.
5. **P4** — phone lockstep and dead deps.

**What you give up by taking this order:** no new customer-facing capability
ships for roughly a week. If you were hoping to demo something new, this
sequence will feel like standing still. That trade is worth it — the
alternative is stacking features on an unverified foundation and discovering
in production that the hosted schema drifted three migrations ago.

**Confidence:** high on the gap analysis (it is read directly from the tree
and cross-checked against `RULES.md`), moderate on the ordering — P0 could
surface breakage that reshuffles everything below it. That is the point of
putting it first.
