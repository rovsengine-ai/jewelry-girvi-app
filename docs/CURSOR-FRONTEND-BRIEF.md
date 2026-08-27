# Cursor brief — WhatsApp-shell frontend, i18n, archive-on-delete

Written 2026-08-15 against commit `0f3dc37` + uncommitted work in the tree.
Companions: [`RULES.md`](RULES.md) (domain law), [`AUDIT.md`](AUDIT.md),
[`NEXT-STEPS.md`](NEXT-STEPS.md) (backend backlog — mostly now done).

This file is the **frontend plan**. Give Cursor one `### Prompt` block per turn,
in order. Do not paste the whole file.

---

## 0. Read this before prompting Cursor

**Where the project actually is.** The backend is finished and heavily tested:
19 migrations, 17 pgTAP suites, `tsc --noEmit` clean, 236 Jest tests green.
The frontend is *functionally* wired but is **9 screens with no navigation
shell, no chosen palette, no i18n, no animation, and a customer side that shows
photographs of receipts and nothing else** — no balance, no due date, no payment
history, no loan detail screen at all.

So: the app is not "frontend done". It is "frontend proven to compile".

**Three things in your request need pushing back on before Cursor touches them.**

1. **WhatsApp's navigation is right; WhatsApp's chat metaphor is wrong.**
   Copy the *shell* — persistent bottom tabs, a list of rows that push a detail
   screen, a search bar in the list header, a FAB for the primary action. Do not
   copy chat bubbles for loans or payments. A pawnbroker reading a balance under
   a fluorescent tube needs a right-aligned tabular figure in a card, not a
   speech bubble. The tab bar is the deliverable; the bubble is not.

2. **"Glass on both Android and iOS" cannot mean the same thing on both.**
   Real Liquid Glass is `expo-glass-effect`, and it renders only on iOS 26+; on
   Android and older iOS it degrades to a plain view. Android has no system
   glass — the closest is `expo-blur` with `experimentalBlurMethod="dimezisBlurView"`,
   which renders a real blur but costs frames on cheap Android hardware, which
   is exactly the hardware in an Indian jewellery shop. **The plan below uses a
   three-tier `GlassSurface` primitive** (iOS 26 native glass → iOS 15–25 blur →
   Android translucent tinted surface, blur only behind a flag). Glass is
   applied to the tab bar, headers and sheets **only** — never behind a money
   figure or a weight, because translucency over a moving list is where digits
   become unreadable, and `theme.ts` already notes this app is "built for sun
   through a glass shopfront".

3. **"Admin deletes the loan" must become archive, not delete — and it already
   has to.** `payments.loan_id`, `loan_renewals.loan_id` and
   `loan_term_changes.loan_id` are all `ON DELETE RESTRICT`. A real `DELETE` on
   any loan that has ever taken a payment **fails today with a foreign-key
   error**. What you described (gone for the customer, gone for staff, still on
   record for the owner) is a soft archive, and it is also the only version that
   can work. Stage 4 builds it.

**What you give up by taking this order:** Stages 1–3 ship no new capability.
For roughly the first half of the work the app gains a tab bar, a colour scheme
and Hindi — and nothing a customer can do that they could not do before. That
is deliberate: i18n retrofitted after 20 screens costs several times what it
costs after 9. Skipping to Stage 5 first is the tempting mistake.

---

## 1. Guardrails — paste at the top of EVERY prompt

```
Before writing code, read AGENTS.md, .cursorrules, docs/RULES.md, and
docs/CURSOR-FRONTEND-BRIEF.md. Check the exact versioned Expo docs at
https://docs.expo.dev/versions/v57.0.0/ before using any Expo API.

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
- No user-visible English string may be hard-coded in a screen after Stage 3.
  Every string goes through t('key').

When done, run: npx tsc --noEmit && npm test && npx supabase test db
Report anything you could not do. Do not silently skip a requirement.
```

---

## Stage 0 — Test logins and a way to run the app

**Do this first. There is currently no seed data and no way to sign in without
a live SMS.** `supabase/config.toml` has `[auth.sms.test_otp]` commented out and
there is no `supabase/seed.sql`. Until this stage lands you cannot test anything.

### Prompt 0

```
<guardrails block>

Goal: make the app signable-in locally with fixed test credentials, with no SMS
provider and no real phone.

1. In supabase/config.toml, uncomment [auth.sms.test_otp] and add exactly:
     9000000001 = "123456"   # owner
     9000000002 = "123456"   # staff
     9000000003 = "123456"   # retail customer
   Set [auth.sms] enable_signup = true for local only. Add a comment saying
   this block is LOCAL ONLY and must never be mirrored to the hosted project.

2. Create supabase/seed.sql (new file, runs automatically on `supabase db reset`)
   that seeds, idempotently:
   - three auth.users rows with the phone numbers above, phone_confirmed_at set
   - matching public.profiles rows: +919000000001 role 'owner' name 'Test Owner',
     +919000000002 role 'staff' name 'Test Staff',
     +919000000003 role 'retail_customer' name 'Test Customer'
     Phones must be stored in whatever exact form normalize_phone_e164 produces
     — call that function in the seed rather than hard-coding the format.
   - the shop_defaults row if the migrations do not already create it
   - one gold_rates row for today (source 'manual') so valuation works offline
   - two loans for Test Customer created via the create_loan RPC, not raw
     INSERT: one active 2-item gold loan, one loan already 200 days old so it
     is overdue. Use the RPC so every invariant and trigger fires.
   - one payment on the active loan.

3. Add a "Test accounts" section to README.md listing the three numbers, the
   OTP 123456, and a one-line warning that these exist only in the local CLI
   database.

Do not add test users to any hosted project. Do not weaken any RLS policy to
make seeding easier — if a seed INSERT is refused by RLS, seed it as the
postgres role and say so in a comment.
```

**Then, yourself:**

```bash
npx supabase start && npx supabase db reset && npx supabase test db
npx expo run:ios      # or run:android — a DEV BUILD, not Expo Go
```

Expo Go will fail on `expo-camera`, `expo-notifications`, `expo-print` and
`react-native-signature-canvas`. You need a dev client. Sign in as `9000000001`
with OTP `123456` → you should land on the admin dashboard; `9000000003` →
customer dashboard. **If this does not work, stop and fix it before Stage 1.**

Against the hosted project, also run once:

```bash
npx supabase migration list --linked
```

If any local migration is missing remotely, resolve that before shipping
anything. Nothing in the repo proves the hosted schema matches.

---

## Stage 1 — Pick the palette, then build the glass primitive

`src/constants/theme.ts` still ships create-expo-app greys — `#000000` on
`#ffffff`. Three finished, contrast-checked palettes sit beside it unused, and
`src/app/(admin)/palette.tsx` already renders all three. Look at them on a real
phone in the shop's actual lighting before prompting.

### Prompt 1a — commit the palette (after you have looked)

```
<guardrails block>

In src/constants/theme.ts, replace the body of the exported `Colors` object with
the `light` and `dark` palettes from PaletteDirections.<YOUR_CHOICE>. Keep
`Colors` satisfying { light: Palette; dark: Palette } and keep every key. Leave
the three PaletteDirections in place for reference. Do not hard-code any hex in
a screen or component. Then delete src/app/(admin)/palette.tsx and its route
registration in (admin)/_layout.tsx, and run npx tsc --noEmit && npm test.
```

### Prompt 1b — glass tokens and the GlassSurface primitive

```
<guardrails block>

Goal: one primitive that gives a real glass look on iOS 26, an acceptable
frosted look on older iOS, and a cheap, legible translucent surface on Android.

1. Add these keys to the `Palette` type in src/constants/theme.ts and to ALL
   palettes (Colors and all three PaletteDirections), light and dark:
     glassTint          - rgba() surface tint used under blur
     glassTintStrong    - opaque-ish fallback for Android and reduce-transparency
     glassBorder        - 1px hairline that separates glass from content
     glassHighlight     - top inner highlight line
   Derive them from each palette's existing surface/border colours — do not
   invent an unrelated hue. Document the alpha choices in a comment.

2. Add a `Glass` token group next to Spacing/Radii: blurIntensity (ios: 40,
   android: 24), tabBarHeight, headerHeight, and a `supportsNativeGlass`
   boolean computed from expo-glass-effect's availability check.

3. Add src/components/glass-surface.tsx exporting <GlassSurface>. It picks,
   in order:
     a. expo-glass-effect GlassView when the runtime says liquid glass is
        available (iOS 26+),
     b. expo-blur BlurView on other iOS versions,
     c. on Android: a plain View filled with glassTintStrong plus the
        glassBorder hairline and glassHighlight — NO blur by default,
     d. if AccessibilityInfo.isReduceTransparencyEnabled() is true, or the
        `solid` prop is passed: an opaque surface on every platform.
   Add `expo-blur` and re-add `expo-glass-effect` to package.json at the
   versions Expo SDK 57 specifies (check the versioned docs; do not guess).
   Put an `EXPO_PUBLIC_ENABLE_ANDROID_BLUR` flag behind (c) that switches on
   experimentalBlurMethod="dimezisBlurView", default OFF, with a comment
   explaining it costs frames on low-end hardware.

4. Add src/components/__tests__/glass-surface-test.tsx covering: renders
   children on every branch; `solid` forces the opaque branch; reduce-
   transparency forces the opaque branch.

Do not apply GlassSurface to any screen in this turn. Do not put glass behind
MoneyText, weights, or any list row — it goes on chrome only.
```

---

## Stage 2 — The WhatsApp shell (bottom tabs + animated stack)

Today both role groups are bare `<Stack>`s with `headerShown: false` and the only
navigation is `router.push` from buttons. This stage is the visible one.

**Target information architecture — admin (4 tabs):**

| Tab | Route | WhatsApp analogue | Contents |
|---|---|---|---|
| Loans | `(admin)/(tabs)/loans` | Chats | searchable loan list, status filter chips, FAB → scanner |
| Alerts | `(admin)/(tabs)/alerts` | Updates | due-soon / overdue / forfeiture notices, generate-notices, CSV call list |
| Insights | `(admin)/(tabs)/insights` | (none) | owner-only: yield, gold rate card, totals. Hidden for staff |
| Settings | `(admin)/(tabs)/settings` | Settings | shop defaults (owner), language, archive (owner), sign out |

**Customer (3 tabs):**

| Tab | Route | Contents |
|---|---|---|
| My loans | `(customer)/(tabs)/loans` | loan rows: status, due date, **balance**, principal |
| Alerts | `(customer)/(tabs)/alerts` | own notices + reminder schedule |
| Settings | `(customer)/(tabs)/settings` | language, profile, sign out |

### Prompt 2a — tab shells

```
<guardrails block>

Goal: a persistent bottom tab bar in both role groups, matching WhatsApp's
navigation model — tabs persist, detail screens push over them.

1. Convert src/app/(admin)/_layout.tsx and src/app/(customer)/_layout.tsx to
   expo-router <Tabs> for the tab routes, keeping every existing role gate and
   redirect EXACTLY as it is today. The role gate is a security control; do not
   restructure it while moving files. Detail routes (loan/[id], scanner,
   kyc/[customerId]) stay as pushed Stack screens ABOVE the tabs, not as tabs.

2. Move existing screens into the (tabs) groups per the table in
   docs/CURSOR-FRONTEND-BRIEF.md Stage 2. Split the current admin dashboard:
   the loan list and search stay in `loans`; notices, generate-notices and the
   CSV export move to `alerts`; yield and the gold rate card move to `insights`.
   Do not rewrite their logic — move it and re-import.

3. The tab bar background is <GlassSurface>. Use tabBarBackground with a
   transparent tabBarStyle so content scrolls under it. Honour BottomTabInset
   from theme.ts and useSafeAreaInsets — content must never sit under the bar.

4. `insights` must be hidden for staff (href: null AND an in-screen role check;
   hiding a tab is not a permission). Verify a staff account cannot reach it by
   typing the URL.

5. Icons: expo-symbols on iOS, a matching set on Android. No emoji.

6. Add a layout test in the style of layout-pixel4a-test.tsx asserting the tab
   bar does not overlap the last list row at Pixel 4a dimensions.

Do NOT add animations in this turn. Do NOT change any service or SQL call.
```

### Prompt 2b — motion

```
<guardrails block>

Goal: motion that reads as fast and deliberate, using react-native-reanimated
(already a dependency, v4) and react-native-gesture-handler.

1. Stack transitions: horizontal slide push for loan detail, matching the
   platform default timing curve. Do not use a custom spring on navigation.
2. Tab switches: cross-fade content, 150ms, no horizontal swipe between tabs
   (swipe on a list row is reserved — see 4).
3. List rows: entering animation staggered by index, capped at the first 8 rows,
   using Reanimated layout animations. No animation on refresh, only on mount.
4. Swipe-left on an admin loan row reveals two actions: "Call" (tel: link) and,
   for owner only, "Archive". Use react-native-gesture-handler Swipeable.
   Archive must open a confirmation, never fire on the swipe itself.
5. Press feedback on every Pressable: scale to 0.98 with a 100ms spring, plus
   expo-haptics selection feedback on iOS and Android.
6. Respect AccessibilityInfo.isReduceMotionEnabled() — every animation above
   collapses to an instant state change when it is on. Add a test for this.
7. Every animation must run on the UI thread. No setState-driven animation, no
   Animated.timing from react-native core.

Budget: no animation longer than 300ms. If any interaction drops below 60fps on
an Android release build, remove the animation rather than tuning it.
```

---

## Stage 3 — English / Hindi, everywhere

There is no i18n in the tree at all — every string in all 9 screens is a
hard-coded English literal. Retrofitting is mechanical but touches everything,
which is why it comes before the app grows.

**The trap:** do not localise numbers. Money, weights, rates, dates and loan
IDs must stay in Latin digits with `en-IN` grouping in **both** languages.
Devanagari digits on a balance at the counter is a real-money error waiting to
happen. `formatPaiseAsInr` and the weight formatters must be untouched by locale.

### Prompt 3

```
<guardrails block>

Goal: full English/Hindi support with a toggle reachable from every screen.

1. Add `i18n-js` and `expo-localization` at the Expo SDK 57 versions.
   Create src/i18n/index.ts, src/i18n/en.ts, src/i18n/hi.ts and a
   LanguageProvider in src/providers/language-provider.tsx that:
   - defaults to the device locale when it is Hindi, else English,
   - persists the choice with expo-secure-store (the same store the Supabase
     session uses),
   - exposes { language, setLanguage, t } via a useLanguage() hook,
   - wraps the app in src/app/_layout.tsx INSIDE AuthProvider.

2. Replace EVERY user-visible string in src/app/ and src/components/ with
   t('...'). Key namespaces: common, auth, loans, items, kyc, redeem, renew,
   notices, settings, errors, archive. Do not leave a single English literal in
   a screen. Include: button labels, headers, placeholders, empty states,
   validation messages, error text from FormNotice, notice type labels in
   src/lib/notices.ts, and status badge labels.

3. Hindi copy must use the words a North Indian pawnbroking counter
   actually uses — गिरवी, ब्याज, मूलधन, छुड़ाना, नवीनीकरण, बकाया, ज़ब्ती —
   not literal translations of the English. Mark any key you are unsure of with
   a `// REVIEW:` comment and list them at the end of your reply.

4. NUMBERS ARE NOT LOCALISED. formatPaiseAsInr, weight formatting, rate
   formatting, dates and loan ids render identically in both languages, Latin
   digits, en-IN grouping. Add a Jest test asserting a balance renders byte-
   identical under both languages.

5. Add a language toggle that is reachable from every screen: a compact
   EN/हिं segmented control in the shared screen header (build one
   <ScreenHeader> component on GlassSurface and use it on every screen —
   including the login screen, which has no tab bar). Also add a full row in
   both Settings tabs. Switching must re-render immediately with no reload and
   no navigation reset.

6. Printable documents (src/lib/print-documents.ts): render in the language
   active at print time, and set a Devanagari-capable font-family in the HTML.
   Money in the printed document stays Latin digits. Add a test for both
   languages.

7. Add a lint-style Jest test that fails if any file under src/app/ contains a
   JSX text node of two or more consecutive ASCII letters that is not wrapped in
   t(). Getting this test to pass is the definition of done for this stage.
```

---

## Stage 4 — Archive instead of delete (owner-only history)

What you asked for: admin deletes a loan → it disappears for the customer, and
the shop keeps a record only the admin can see.

**Why it must be archive, not delete:** `payments`, `loan_renewals` and
`loan_term_changes` all reference `loans` with `ON DELETE RESTRICT`. A `DELETE`
on any loan that has taken a payment fails with a foreign-key violation today.
The `loans_owner_delete` RLS policy is effectively a trap. Archive is both what
you want and the only thing that works.

**Visibility matrix to implement:**

| Loan state | Owner | Staff | Customer |
|---|---|---|---|
| active / redeemed / defaulted | sees | sees | sees own |
| **archived** | sees, in a separate Archive screen | **cannot see, cannot query** | **cannot see, cannot query** |

### Prompt 4a — SQL only

```
<guardrails block>

Read supabase/migrations/20260815110000_default_loan.sql first and follow its
conventions exactly — it is the closest precedent.

Add ONE new migration supabase/migrations/20260815150000_archive_loan.sql:

1. Add to public.loans: archived_at timestamptz, archived_by uuid REFERENCES
   profiles(id) ON DELETE RESTRICT, archive_reason text, and an immutable
   archive_balance_paise bigint snapshot. Add a CHECK enforcing that these four
   are all NULL or all NOT NULL, mirroring how the redemption columns are paired.

2. public.archive_loan(p_loan_id uuid, p_reason text):
   - owner only; staff refused exactly the way redeem_loan refuses them
   - requires a non-empty reason
   - locks the loan row and re-checks inside the transaction
   - snapshots loan_balances_as_of(today) into archive_balance_paise
   - idempotent: a second call returns the original snapshot and writes nothing
   - never deletes any row, anywhere

3. public.unarchive_loan(p_loan_id uuid): owner only, clears all four columns,
   writes an audit row. An archived loan must be recoverable.

4. Rewrite the SELECT policies so archived loans are invisible to staff and to
   customers, and visible to owners. Rewrite them in this new migration with
   CREATE OR REPLACE / DROP+CREATE — do not edit the old migration file. Apply
   the same exclusion to loan_items, loan_item_photos, payments, loan_notices
   and loan_renewals for the archived loan, so nothing leaks through a join.

5. Revoke the existing hard-delete path: drop the loans_owner_delete policy and
   make the mutation trigger raise on DELETE with a message pointing at
   archive_loan. A loan row must never be removable from the client.

6. Exclude archived loans from loans_overdue_as_of, generate_loan_notices,
   shop_rate_yield and customer_loan_reminder_schedule. An archived loan must
   not generate a notice or a reminder.

Do NOT write TypeScript in this turn.
```

### Prompt 4b — tests only

```
<guardrails block>

Add supabase/tests/160-archive-loan_test.sql in the exact style of
130-default-loan_test.sql. Cover:
- staff calling archive_loan is refused
- owner allowed; archived_at/by/reason/balance all set together
- empty reason refused
- second call idempotent, snapshot unchanged
- after archiving: staff SELECT returns 0 rows; the customer's own SELECT
  returns 0 rows; owner SELECT returns 1
- the same for payments, loan_items and loan_notices of that loan
- a client DELETE on loans raises, for owner and staff alike
- an archived overdue loan produces no notice from generate_loan_notices and no
  row from customer_loan_reminder_schedule
- unarchive_loan restores visibility for staff and the customer
Run npx supabase test db until green. Change no other file.
```

### Prompt 4c — client

```
<guardrails block>

1. Add archiveLoan / unarchiveLoan / fetchArchivedLoans to
   src/services/loanService.ts following the shape and error handling of
   redeemLoan. Extend src/types/supabase.ts for the new RPCs.

2. Owner-only Archive action on the loan detail screen and on the swipe action
   from Stage 2b. Require a typed reason before the confirm button enables.
   Confirmation copy must say the loan disappears for the customer and for
   staff, and that the shop's record is kept. Both languages.

3. New owner-only route (admin)/archive.tsx, pushed from the Settings tab:
   archived loans with reason, who archived, when, and the frozen balance
   snapshot. Read-only apart from an Unarchive action. Never reachable for
   staff — gate it in the layout, not by hiding the link.

4. Add a Jest test asserting the archive action is not rendered for role
   'staff' on the loan detail screen.
```

---

## Stage 5 — Make the live gold rate actually live

`supabase/functions/refresh-gold-rate` exists and `GoldRateCard` can call it,
but **nothing schedules it** — there is no cron anywhere in the repo, and the
API keys are only documented, not necessarily set. So the rate is "live" only
when someone taps refresh on the scanner screen.

### Prompt 5

```
<guardrails block>

1. Add ONE migration enabling pg_cron and scheduling refresh-gold-rate daily at
   09:15 Asia/Kolkata via pg_net, writing into gold_rates. Make the insert
   idempotent per (quoted_on, purity_millesimal, source) so a re-run does not
   duplicate. If pg_cron is unavailable on the target plan, say so and instead
   document a Supabase scheduled function — do not fake it.

2. Move the GoldRateCard onto the admin Insights tab and add a compact
   read-only rate strip to the top of the Loans tab: figure, purity band,
   source, age of the quote ("as of 09:15") and the mandatory "not IBJA" label.
   If today's quote is missing, show yesterday's greyed with its date — never
   show a stale figure as if it were today's.

3. The card must never block the counter: a dead feed shows the last known rate
   plus a warning, and pledging still works with the owner's manual override.
   Add a test for the feed-unavailable branch.

4. Confirm no EXPO_PUBLIC_GOLD* variable exists anywhere. Gold feed keys live
   only in Edge Function secrets. Paste the search proving it.
```

**Then, yourself:**

```bash
npx supabase secrets set GOLDAPI_API_KEY=...    # or METALS_DEV_API_KEY
npx supabase functions deploy refresh-gold-rate
```

Until those two commands run against the hosted project, the rate is not live
no matter what the client code says.

---

## Stage 6 — WITHDRAWN. Do not implement.

**The thin customer side is a deliberate product decision, confirmed by the
owner on 2026-08-16.** A customer sees their receipts, loan status and due-date
notices — not a running balance. Do not "fix" this. Do not add a balance, a
payment history, or a customer loan-detail screen to `(customer)/`. If a future
prompt asks for it, stop and re-confirm first.

The prompt below is kept only as a record of what was rejected.

<details>
<summary>Rejected prompt (do not run)</summary>

### Prompt 6 — REJECTED

```
<guardrails block>

1. Add (customer)/loan/[id].tsx: a customer's own loan detail — pledged items
   with metal, weight and purity, principal, current balance (from the SQL RPC,
   never computed in JS), due date, days remaining or overdue, payment history,
   the frozen gold valuation with its "not IBJA" label, and their signature and
   receipt image. RLS must be the boundary; do not rely on the .eq() filter.

2. Rebuild the customer loan list as WhatsApp-style rows, not an image grid:
   left a small item thumbnail, then loan id and item summary, right-aligned
   balance and due date, a status badge, and overdue rows tinted with the
   danger token. Pull-to-refresh. Tapping pushes the detail screen.

3. Customer Alerts tab: notices newest-first with human dates in the active
   language, plus the local reminder schedule so they can see what the phone
   will remind them about.

4. Customer Settings tab: name, phone, KYC status (read-only — a customer may
   never write kyc_verified_on), language toggle, notification permission
   state with a link to OS settings, sign out.

5. Add a "Download receipt" action using expo-print / expo-sharing and the
   existing print-documents helpers, in the active language.

Every figure on these screens comes from SQL. No JS arithmetic.
```

</details>

---

## Stage 7 — Prove it works

### Prompt 7

```
<guardrails block>

1. Add Maestro E2E flows in e2e/ covering, against the local seeded database:
   owner login → loan list → open loan → record payment → redeem → print;
   staff login → confirm redeem, renew, archive, insights are all absent;
   customer login → loan list → detail → balance visible → language toggle to
   Hindi → every screen still renders with no clipped text;
   owner archives a loan → customer session no longer lists it.
   Add npm scripts and a README section for running them.

2. Add a Jest snapshot per screen in both languages to catch layout breakage
   from longer Hindi strings.

3. Run npx tsc --noEmit && npm test && npx supabase test db and paste results.
```

---

## 2. Manual test script — run this yourself after every stage

Dev build on a real Android phone and a real iPhone. Not Expo Go, not only the
simulator.

**Accounts** (local only, after Stage 0): owner `9000000001`, staff
`9000000002`, customer `9000000003` — OTP `123456` for all three.

| # | Step | Pass condition |
|---|---|---|
| 1 | Sign in as owner | lands on Loans tab, tab bar visible, glass renders |
| 2 | Toggle EN → हिं on 4 different screens | every label changes, balance digits do NOT |
| 3 | Scan a 2-item gold pledge | loan created, both items with mg weights and photos |
| 4 | Check the gold rate strip | shows a figure, a source, and "not IBJA" |
| 5 | Record a partial payment | balance drops by the SQL figure, not a JS one |
| 6 | Redeem as owner | per-item checklist enforced, receipt prints |
| 7 | Sign out, sign in as staff | no Insights tab; redeem/renew/archive absent |
| 8 | Staff tries `/(admin)/insights` by URL | redirected, not rendered |
| 9 | Sign in as customer | sees own loans with balance and due date, nothing else |
| 10 | Owner archives that loan with a reason | disappears from staff and customer immediately |
| 11 | Owner opens Settings → Archive | loan present with reason, actor, frozen balance |
| 12 | Owner unarchives | reappears for customer |
| 13 | Airplane mode, open every screen | clear error states, no crash, no blank screen |
| 14 | Android: scroll the loan list fast | no dropped frames over the glass tab bar |
| 15 | OS reduce-motion + reduce-transparency on | animations off, glass opaque, still legible |

Write down every failure. That list, not this document, is your real backlog.

---

## 3. Features nobody has asked for yet but this app needs

Not in the stages above. Decide before launch.

- **Nothing mints the first owner in production.** Someone must insert that row
  by hand. Decide who, and how a second staff member is added — there is no
  invite flow.
- **`shop_defaults` is pinned to `id = 1`.** One shop is a correct simple
  choice; a second shop is a rewrite. Decide now, not by accident.
- **No offline mode.** A counter with patchy 4G will show errors mid-pledge.
  At minimum, queue the loan creation.
- **No error boundary and no crash reporting.** A single render error is a
  white screen with no report.
- **The auction/forfeiture workflow stops at `defaulted`.** There is no record
  of what was sold, for how much, or what surplus went back to the customer —
  which is usually a legal obligation.
- **No app identity.** Icon, splash and name are still `jewelry-girvi-app`
  create-expo-app defaults.
- **Accessibility.** No screen has been checked with a screen reader, and the
  counter's users are frequently older.

---

**Confidence.** High on the gap analysis and on the archive/FK finding — both
read directly from the tree and verified against the migrations. High that no
i18n, no tabs and no glass exist today. Moderate on the stage ordering; Stage 0
may surface breakage that reshuffles everything after it, which is exactly why
it is first.
