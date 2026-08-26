# CURSOR GO-LIVE PROMPT — hosted, live, web + Play Store, QR deep links

Companion to [`NEXT-STEPS.md`](NEXT-STEPS.md) (feature backlog) and
[`RULES.md`](RULES.md) (domain law). This file is the **shipping plan**: turn a
locally-running Expo app into a hosted product with a customer website, a
Play Store listing, and a QR code on every girvi loan.

Do **not** paste this whole file into Cursor. Each `> Cursor prompt` block is
one turn. Run them in order. Everything after Phase 0 assumes Phase 0 passed.

---

## 0. Read this before you open Cursor

Four things will cost you more time than the code, and three of them are not
code at all.

### 0.1 Free phone OTP does not exist in India [Certain]

You asked for something free. There isn't one, and it's better to know now:

| Option | Reality |
| --- | --- |
| Supabase phone auth + Twilio / MSG91 | Per-SMS cost, **and** DLT registration (sender ID + template approval through the provider) before a single message delivers. Days to weeks of paperwork. |
| Firebase Phone Auth | **Not available on the free Spark plan at all** — Blaze (card on file) required, billed per SMS. |
| WhatsApp OTP via Meta Cloud API | Authentication templates are billed per message in India, and it needs Meta Business verification. Cheap, not free, still paperwork. |

**So Phase 2 below removes SMS from the critical path entirely.** The shop
already creates walk-in customers at the counter
(`supabase/functions/create-walkin-customer`). That physical, in-person
verification is *stronger* identity proof than an SMS code. The customer sets
a PIN at the counter, and the QR you already want becomes the account-binding
mechanism. Zero rupees, zero DLT, live this week.

Cost of that choice: no self-service signup, no "forgot PIN" without walking
into the shop, and a PIN is weaker than an OTP if the phone is stolen. Phase 2
keeps the OTP code path intact behind a flag so you can switch on MSG91 later
without a rewrite.

### 0.2 Google Play may reject a "loan" app in India [Likely — this is the big one]

Google Play requires apps offering **personal loans** in India to hold an RBI
licence and appear on the RBI's public "DLAs deployed by Regulated Entities"
list. Enforcement dates have already passed (Oct 2025 for new apps, Jan 2026
for existing ones).

Pawn broking is licensed under **state Money Lenders / Pawnbrokers Acts, not
the RBI**, so you very likely cannot produce the document Google's flow asks
for. And Google's first-pass review classifies by store listing text — the
words *loan*, *interest*, *EMI*, *girvi* pull an app into the financial-services
review queue regardless of what it actually does.

Your app is genuinely a **shop-side ledger plus a customer receipt viewer**. No
one applies for credit inside it. That is a defensible position, but you must
present it that way from the first submission:

- Store **title**, **short description**, and **screenshots** describe it as
  *record-keeping software for a pawn-broking shop* (pledge records, receipts,
  shop ledger). Do **not** use: loan, gold loan, girvi finance, credit, EMI, or
  interest rate. Never "get a loan", "apply", "instant cash".
- The customer side must have **no application flow, no offers, no credit
  marketing**, and **no in-app repayment collection** (UPI / Razorpay / any
  gateway). Read-only receipts. The moment you add those, you are a lending app
  and the Financial features declaration becomes false. Phase 4 enforces the
  read-only customer surface.
- Complete the Play Console **Financial features** declaration honestly. Have
  your state pawnbroker/money-lender licence scanned and ready.
- Agent rule: `.cursor/rules/play-store-positioning.mdc` (always apply).

**Contingency you should take seriously:** you do not actually need Play Store
for this product to work. Customers — Android and iOS both — use the website
(Phase 4). Only *your own staff* need the native app, and 2–5 staff phones can
install an EAS internal-distribution build directly. That path has no policy
review, no $25 fee, and no tester requirement. Consider making the Play listing
optional rather than blocking.

### 0.3 A personal Play developer account needs 12 testers for 14 days [Certain]

Individual accounts created recently must run a closed test with **12 testers
opted in for 14 continuous days** before applying for production access.
Organisation accounts are exempt. If you have a registered business, open an
**organisation** account instead — it skips this entirely. Budget two weeks
either way if you go personal.

### 0.4 "Everything online" means the counter stops when the internet does

Today every screen reads Supabase directly. Make that hosted and a 4G blip
during a pledge means a customer standing at your counter with no receipt.
Phase 3 adds an offline banner, retry, and — critically — makes `create_loan`
safe to retry. Do not skip it because it isn't a visible feature.

---

## Guardrails — paste this block at the top of EVERY Cursor turn below

```
Before writing code, read AGENTS.md, .cursorrules, docs/RULES.md, and
docs/NEXT-STEPS.md. Check the exact versioned Expo docs at
https://docs.expo.dev/versions/v57.0.0/ — this project is Expo SDK 57 and
most tutorials online are wrong for it.

Hard rules for this repo:
- Money is INTEGER PAISE. Rates are INTEGER BASIS POINTS per 30 days.
  Weights are INTEGER MILLIGRAMS. Never a float, never rupees-as-decimal.
- ALL interest, balance, valuation and overdue arithmetic happens in SQL.
  JavaScript may parse input and format output. Nothing else.
- Never edit an existing migration file. Always add a new one.
- Every new RPC needs pgTAP coverage in supabase/tests/, including a test
  proving the wrong role is refused.
- RLS is the security boundary, not a client .eq() filter and not a hidden
  button.
- Admin routes live in src/app/(admin)/, customer routes in
  src/app/(customer)/. Never mix them.
- Colours, spacing, radii and type come from src/constants/theme.ts.
  No new hex, no magic numbers in screens.
- Never store an Aadhaar image. Never store more than the last 4 characters
  of an ID number.
- Every screen must work on react-native-web, because the customer website is
  an Expo web export of these same routes. If you use a native-only API,
  guard it with Platform.select and provide a web path.

When done, run: npx tsc --noEmit && npm test && npx supabase test db
Then tell me exactly which files you changed and why.
```

---

## PHASE 0 — Prove the hosted backend matches this repo

**No Cursor. Run these yourself. Nothing below is safe until they pass.**

**You are already linked.** `supabase/.temp/project-ref` holds
`deaigzfypmgsppkzmdqt`, so skip the `link` command — just confirm that ref is
the project you intend to be *production* (Supabase Dashboard → the project
whose URL starts `https://deaigzfypmgsppkzmdqt.supabase.co`). Only run
`npx supabase link --project-ref <ref>` if you want to point at a different
project.

Note that `.env` currently reads `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`
— your app is talking to local Docker while the CLI is linked to hosted. That
split is exactly what Phase 1 fixes.

**Log in first.** Being *linked* and being *authenticated* are two different
things. `supabase/.temp/project-ref` records which project you linked; the
access token lives outside the repo in `~/.supabase/`, is per-machine, and
expires. Without it every `--linked` / remote command fails with:

```
Access token not provided. Supply an access token by running `supabase login`
or setting the SUPABASE_ACCESS_TOKEN environment variable.
```

```bash
npx supabase login          # opens a browser, writes the token to ~/.supabase/
```

If the browser flow will not work (SSH, headless, corporate machine), generate
a token at **Dashboard → Account → Access Tokens** and export it instead:

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...
```

That token is account-wide and grants full control of every project you own.
Treat it like a password: never commit it, never put it in `.env` alongside
`EXPO_PUBLIC_*` variables, and prefer `supabase login` over exporting it in a
shell profile.

Then:

```bash
npx supabase migration list --linked     # local vs remote, must match exactly
npx supabase db push                     # only if remote is behind
npx supabase functions deploy create-walkin-customer
npx supabase functions deploy extract-receipt
npx supabase secrets set GEMINI_API_KEY=...
```

Local-only commands (`supabase start`, `db reset`, `test db`) do **not** need
the token — that is why your pgTAP suite has always worked without it.

### 0.5 If you hit `failed to connect as temp role … Connection timed out`

Login succeeded; the **database connection** failed. These are separate
channels, and the split tells you what still works:

| Command | Channel | Affected by this error? |
| --- | --- | --- |
| `migration list --linked`, `db push` | direct Postgres, port 5432 | **Yes — blocked** |
| `functions deploy`, `secrets set` | Management API, HTTPS 443 | **No — do these now** |

So deploy your Edge Functions and set secrets while you debug the rest.

Work through these in order — first is by far the most likely:

1. **Is the project paused?** Free-tier projects pause after ~7 days idle. Your
   `.env` points at local Docker, so the hosted project has probably been
   sitting untouched. A paused project's pooler simply never answers, which
   produces exactly this timeout. Open the Supabase dashboard — if it says
   *Paused*, click **Restore** and wait a few minutes.
2. **Is port 5432 blocked on your network?** Many Indian ISPs, mobile hotspots,
   and corporate/college networks block outbound 5432. Test it:
   ```bash
   nc -vz aws-0-ap-northeast-1.pooler.supabase.com 5432
   nc -vz aws-0-ap-northeast-1.pooler.supabase.com 6543   # transaction pooler
   ```
   If both hang, try a phone hotspot on a different carrier. If it works there,
   it is your network, not Supabase.
3. **Set the database password.** Direct-DB commands need it separately from
   your access token. Dashboard → Project Settings → Database → Database
   password (reset it if you never recorded it — resetting is safe, but update
   anywhere else that stores it):
   ```bash
   export SUPABASE_DB_PASSWORD='...'
   ```

### 0.6 Decide your region now, not after go-live [Likely — worth 10 minutes]

That error message reveals your project is in **`ap-northeast-1` — Tokyo**.
Supabase offers **`ap-south-1` (Mumbai)**, and your users are all in India.

Round trip to Tokyo is roughly 120–140 ms versus ~20–30 ms to Mumbai. Your
counter flow issues several sequential queries per pledge, so that difference
is felt as sluggishness by the person operating the app, not just a number in
a chart.

**A project's region is fixed at creation.** Moving means creating a new
project and migrating to it. Right now that costs almost nothing — your schema
is 27 migrations in this repo, your functions redeploy in one command, and
there is no production data to lose. After the shop is live it is an outage
and a data migration.

Cost of moving: a new project ref, re-running `link`, re-setting Edge Function
secrets, re-pointing Vercel, and re-issuing the anon key everywhere. Two hours,
once. Cost of not moving: permanent latency on every counter interaction.

If you move, do it **before Phase 1** so the env split is written against the
project you will actually ship on.

Then in the Supabase dashboard confirm: the storage buckets your baseline
migration inserts (`receipts` and friends, `supabase/migrations/20260813120000_baseline_live_schema.sql:204`)
actually exist remotely, and RLS is **enabled** on every table — a table with
RLS off is world-readable through the anon key, which is in your app bundle.

**Done when** you have signed in against the hosted project, created a two-item
loan, recorded a payment, and redeemed it — on a real phone, on mobile data,
not a simulator on your Wi-Fi.

---

## PHASE 1 — Split dev and prod so you cannot point the shop at a toy database

> **Cursor prompt**
>
> [guardrails block]
>
> `.env` currently holds one Supabase URL and anon key, and `.env.example`
> documents switching between local and hosted by commenting lines in and out.
> That is how a shop ends up writing real loans into a local Docker database,
> or a test loan into production.
>
> 1. Introduce `.env.development` and `.env.production`, both gitignored, and
>    update `.env.example` to document both. Keep the existing variable names.
> 2. Add `EXPO_PUBLIC_ENV` (`development` | `production`) and read it through
>    `expo-constants` in `src/lib/supabase.ts`.
> 3. When `EXPO_PUBLIC_ENV !== 'production'`, render a permanent, dismissible-
>    never banner across the top of every screen reading the environment name
>    and the Supabase host. Use existing theme tokens. Put it in the root
>    `src/app/_layout.tsx` so it cannot be missed on any route.
> 4. In `eas.json`, give `development`, `preview` and `production` profiles
>    explicit `env` blocks so a build can never inherit the wrong one.
> 5. Add a startup assertion in `src/lib/supabase.ts` that throws a clear error
>    if the URL is a `127.0.0.1`/localhost address while `EXPO_PUBLIC_ENV` is
>    `production`.
>
> Do not change any query, service, or screen logic in this turn.

---

## PHASE 2 — Customer login without SMS (counter PIN + QR activation)

This is the phase that makes "free" possible. Three Cursor turns: SQL, then
service, then screens. Do not let Cursor do all three at once.

> **Cursor prompt — 2a, SQL only**
>
> [guardrails block]
>
> Read `supabase/migrations/20260815040000_redeem_and_renew_rpcs.sql` and
> `supabase/migrations/20260813200000_security_rls_storage_phone.sql` first and
> follow their conventions exactly.
>
> Add ONE new migration adding a passwordless-but-SMS-free customer login.
> Requirements:
>
> - Add `customer_credentials` (one row per profile): `profile_id` FK, `pin_hash`
>   text, `pin_set_at`, `failed_attempts` int, `locked_until` timestamptz.
>   Hash with `pgcrypto` `crypt()` + `gen_salt('bf')`. **Never store a PIN in
>   plaintext and never return `pin_hash` to any client.** RLS: no client may
>   SELECT this table at all — it is touched only by SECURITY DEFINER functions.
> - Add `login_tokens`: `token` text unique (32+ bytes of `gen_random_bytes`,
>   base64url), `profile_id`, `loan_id` nullable, `expires_at`, `used_at`,
>   `created_by`. This is the short-lived QR grant.
> - `public.issue_login_token(p_profile_id uuid, p_loan_id uuid)` — owner/staff
>   only, callable only by an authenticated shop role, returns the token.
>   Expiry **5 minutes**, single use. This is issued at the counter while the
>   customer is standing there.
> - `public.redeem_login_token(p_token text)` — marks used, returns the
>   `profile_id` and `loan_id`. Refuses expired, already-used, or unknown
>   tokens. Must be constant-time-safe against token enumeration: never reveal
>   which of the three failure reasons occurred to the caller.
> - `public.set_customer_pin(p_pin text)` — sets the PIN for the *calling*
>   authenticated user only. Reject PINs shorter than 6 digits, all-same-digit,
>   and simple ascending/descending runs.
> - `public.verify_customer_pin(p_phone text, p_pin text)` — normalises the
>   phone via the existing `normalize_phone_e164` / `find_profile_by_phone`,
>   never a TypeScript-normalised string. Increment `failed_attempts` on
>   failure; lock for 15 minutes after 5 failures. On success reset the counter.
>   Return a boolean plus profile id, never the hash.
>
> Also add a `public_token` column to `public.loans`: a non-guessable opaque
> identifier, unique, defaulted from `gen_random_bytes`, backfilled for existing
> rows in the same migration. **`serial_number` must never appear in a URL** —
> it is sequential and therefore enumerable.
>
> Do NOT write any TypeScript this turn. Do NOT edit an existing migration.

> **Cursor prompt — 2b, tests only**
>
> [guardrails block]
>
> Add `supabase/tests/180-customer-pin-login_test.sql` in the exact style of
> `supabase/tests/050-rls-and-permissions_test.sql`. Cover, at minimum:
> a customer cannot SELECT `customer_credentials`; a customer cannot call
> `issue_login_token`; staff can; an expired token is refused; a used token is
> refused a second time; a wrong PIN increments `failed_attempts`; the 5th
> failure sets `locked_until`; a correct PIN during lockout is still refused;
> `set_customer_pin` cannot set another user's PIN; `123456` and `111111` are
> rejected as weak. Run `npx supabase test db` until green. Change no other file.

> **Cursor prompt — 2c, client**
>
> [guardrails block]
>
> Wire the SQL from 2a into the app.
>
> 1. Extend `src/providers/auth-provider.tsx` with a second sign-in path
>    alongside the existing OTP one. Keep OTP code in place behind a new
>    `EXPO_PUBLIC_AUTH_MODE` env value (`otp` | `pin`), defaulting to `pin`, so
>    switching to MSG91 later is a config change and not a rewrite.
> 2. `src/app/(auth)/login.tsx`: when mode is `pin`, collect a 10-digit phone
>    and a 6-digit PIN. Normalise the phone with the existing `toE164India` in
>    `src/lib/phone.ts` for display only — the lookup happens in SQL.
> 3. Add `src/app/(auth)/activate.tsx`, reached by the QR deep link, which takes
>    a `token` param, calls `redeem_login_token`, and if valid walks the customer
>    through setting their PIN, then routes them to the loan the token carried.
> 4. Add an owner/staff action on `src/app/(admin)/loan/[id]/index.tsx` —
>    "Show customer QR" — that calls `issue_login_token` and renders the QR
>    full-screen with a visible countdown to its 5-minute expiry. This is the
>    QR the customer scans off your phone.
> 5. Show clear, non-technical error copy for locked accounts, in both `en` and
>    `hi`, added to `src/i18n/`.
>
> Use existing components (`Button`, `FormNotice`, `Card`) and theme tokens
> only. Do not add a QR library yet — that is Phase 5; for now render a
> placeholder and leave a `TODO(phase5)` comment.

---

## PHASE 3 — Live data and honest offline behaviour

> **Cursor prompt — 3a, realtime**
>
> [guardrails block]
>
> Make the shop dashboard live. Subscribe to Supabase Realtime on `loans` and
> `payments` and update `src/app/(admin)/(tabs)/loans.tsx` and
> `src/app/(customer)/(tabs)/loans.tsx` when rows change.
>
> Requirements:
> - Put the subscription in one reusable hook under `src/hooks/`, not inline in
>   screens. Both admin and customer screens use the same hook.
> - Realtime respects RLS only if Realtime RLS is enabled for those tables —
>   if it is not, add the enabling statement in a NEW migration and add a pgTAP
>   test proving a customer cannot receive another customer's loan events.
> - Unsubscribe on unmount and on sign-out. A leaked channel on sign-out leaks
>   another user's data into the next session.
> - Never recompute a balance client-side from a realtime payload. Re-fetch the
>   balance from SQL.

> **Cursor prompt — 3b, offline**
>
> [guardrails block]
>
> The counter cannot go down when 4G drops.
>
> 1. Add a network-state provider and a persistent top banner when offline.
>    Every mutating button must disable itself with a clear reason while offline
>    rather than failing after the tap.
> 2. Audit `create_loan`, `redeem_loan`, `renew_loan` and payment recording in
>    `src/services/loanService.ts` for retry safety. Each client call must send
>    a client-generated idempotency key so a timeout followed by a retry cannot
>    create two loans or double-record a payment. If the SQL RPCs do not accept
>    such a key, add it in a NEW migration with pgTAP proving a repeated key
>    returns the original result and inserts nothing.
> 3. Report back — do not implement yet — what a true offline write queue for
>    loan creation would require, and what could go wrong with serial numbers if
>    two devices queue loans offline simultaneously.
>
> Do not add a state-management library.

---

## PHASE 4 — The customer website (Expo web export → Vercel)

Your `app.json` already has `web: { "output": "static" }` and
`react-native-web` is installed, so the customer routes you have already
written are the website. This is the cheapest part of the whole plan.

> **Cursor prompt — 4a, make the customer routes web-safe**
>
> [guardrails block]
>
> Goal: `npx expo export --platform web` produces a working static customer
> dashboard. iOS customers will use this instead of an App Store app.
>
> 1. Audit every file reachable from `src/app/(customer)/` and `src/app/(auth)/`
>    for native-only APIs — `expo-camera`, `expo-notifications`,
>    `expo-secure-store`, `expo-print`, `react-native-signature-canvas`,
>    `expo-haptics`, `expo-glass-effect`. Replace or guard each with
>    `Platform.OS === 'web'` branches. Paste the full list of what you found
>    before changing anything.
> 2. `expo-secure-store` has no web implementation. Supabase session storage on
>    web must use `localStorage` via a storage adapter selected by platform in
>    `src/lib/supabase.ts`. Keep SecureStore on native.
> 3. `expo-print` receipt printing: on web, use the browser print dialog for the
>    same HTML `src/services/printService.ts` already generates. Do not fork the
>    document templates — one source of truth.
> 4. Local reminder notifications (`src/lib/local-notifications.ts`) do not work
>    in a web browser tab. On web, hide the reminder toggle and show one line
>    explaining reminders need the Android app. Do not silently no-op.
> 5. Add `npm run build:web` running the export, and confirm the output loads
>    with no console errors.
>
> Do not build any new customer feature. Do not add an application, offers, or
> credit-marketing flow — the customer web app is read-only receipts plus PIN
> management, deliberately, for Play/App Store policy reasons.

> **Cursor prompt — 4b, admin routes must not ship to the web**
>
> [guardrails block]
>
> The web export must contain only auth and customer routes. Shop staff use the
> native app.
>
> Configure the Expo Router web build so `src/app/(admin)/**` is excluded from
> the web bundle entirely, and confirm by grepping the exported JS for an
> admin-only string (e.g. a `redeem`/`archive` label) that it is absent.
> RLS still protects the data — but do not ship the shop's UI to the open
> internet. Report how you achieved the exclusion and what it costs in build
> config complexity.

> **Cursor prompt — 4c, Vercel**
>
> [guardrails block]
>
> Add `vercel.json` at the repo root for a static Expo web export:
> build command `npm run build:web`, output directory `dist`, and a catch-all
> rewrite so client-side routes deep-link correctly on refresh. Add security
> headers: `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`,
> a restrictive `Permissions-Policy`, and HSTS. Document in `README.md` which
> `EXPO_PUBLIC_*` variables must be set in the Vercel project.
>
> Reminder for me, not code: add the Vercel domain to Supabase Auth
> → URL Configuration → Site URL and Redirect URLs, or auth redirects will fail
> in production. Also confirm no service-role key is ever set as an
> `EXPO_PUBLIC_*` variable — that key must exist only in Edge Function secrets.

---

## PHASE 5 — QR on every girvi loan, with the Android/iOS split

Two different QR codes. Do not conflate them — this is the part most likely to
be built insecurely.

| QR | Where | Contents | Lifetime | Grants access? |
| --- | --- | --- | --- | --- |
| **Loan QR** | Printed on the pledge receipt | `https://<domain>/g/<loans.public_token>` | Permanent | **No.** Shows only "Loan #… — sign in to view". |
| **Activation QR** | Displayed on the shop's phone at the counter | `https://<domain>/a/<login_token>` | 5 minutes, single use | Yes — this is the one from Phase 2. |

If a permanent printed QR granted access, anyone who photographs a customer's
receipt owns their loan history. Keep them separate.

> **Cursor prompt — 5a, generate and display**
>
> [guardrails block]
>
> Add QR rendering. Pick a QR library that works on **both** react-native and
> react-native-web (state which you chose and why; `react-native-qrcode-svg`
> with `react-native-svg` is the usual answer — verify it exports correctly in
> the web build before committing to it).
>
> 1. Render the loan QR (`https://<EXPO_PUBLIC_WEB_ORIGIN>/g/<public_token>`)
>    on `src/app/(admin)/loan/[id]/index.tsx` and inside the printed pledge
>    document generated by `src/services/printService.ts`. In the print path the
>    QR must be an inline data-URI image — a remote image will not render
>    reliably in `expo-print`.
> 2. Replace the Phase 2c placeholder with the real activation QR
>    (`/a/<login_token>`), full screen, with the expiry countdown.
> 3. Add `EXPO_PUBLIC_WEB_ORIGIN` to both env files and `.env.example`.
> 4. Never encode a phone number, customer name, amount, or `serial_number` into
>    a QR. The token is the only payload.
>
> Update the print snapshot tests rather than deleting them.

> **Cursor prompt — 5b, the redirect endpoint**
>
> [guardrails block]
>
> Add a Vercel edge function handling `GET /g/:token` and `GET /a/:token` that
> sends the scanner to the right place:
>
> - Android + the app installed → the app, via an Android App Link.
> - Android without the app → the Play Store listing (fall back to the web
>   dashboard until the listing exists — make this a single config constant).
> - iOS, iPadOS, desktop, anything else → the web dashboard route.
>
> Implementation requirements:
> - Detect platform from `User-Agent`. Treat it as a **hint, not a fact** — it
>   is trivially spoofed and often wrong. The web route must be fully functional
>   for every platform, so a wrong guess degrades to a working page, never a
>   dead end.
> - Preserve the token through the redirect.
> - The endpoint must not touch the database and must not leak whether a token
>   is valid — validity is decided after login, by SQL.
> - `Cache-Control: no-store` on both routes. A cached redirect on a single-use
>   activation token is a bug that will be very hard to reproduce.
>
> Also serve `/.well-known/assetlinks.json` for Android App Links, with the
> `com.anonymous.jewelrygirviapp` package name and a placeholder for the release
> signing SHA-256 fingerprint — tell me the exact `keytool`/EAS command to get
> the real fingerprint. Add `intentFilters` for the domain to the `android`
> block of `app.json` with `autoVerify: true`, and matching `expo-linking`
> handling so the app routes `/g/:token` and `/a/:token` to the right screens.
>
> Do not add iOS Universal Links or `apple-app-site-association` — there is no
> iOS app, and a broken AASA file causes silent, confusing failures.

> **Cursor prompt — 5c, the landing route**
>
> [guardrails block]
>
> Add `src/app/(customer)/g/[token].tsx`. Signed out, it shows only the loan's
> masked reference (last 4 of `serial_number`) and a sign-in prompt — **no
> amount, no name, no item, no dates.** Signed in, it verifies via RLS that the
> loan belongs to the caller and routes to the existing loan detail; if it does
> not belong to them, show a neutral not-found, never "this belongs to someone
> else".
>
> Add a pgTAP test proving customer B cannot read loan data by
> `public_token` belonging to customer A. That test is the actual security
> boundary here; the screen is just UI.

---

## PHASE 6 — Push notifications (after the website works, not before)

> **Cursor prompt**
>
> [guardrails block]
>
> `src/lib/local-notifications.ts` schedules reminders on-device only, so a
> customer who reinstalls loses them and the shop cannot reach anyone.
>
> 1. Store Expo push tokens per profile in a new table with RLS restricting each
>    row to its owner. New migration + pgTAP.
> 2. Add a Supabase Edge Function that reads `generate_loan_notices` output and
>    sends via Expo's push API. It must be idempotent against the existing
>    spam-proof notice unique key — a retried invocation must not double-send.
> 3. Keep local notifications as the offline fallback; do not fire both for the
>    same notice.
> 4. Web push is out of scope for this turn. Note in the code why: on iOS,
>    browser push requires the site to be installed to the Home Screen first,
>    which most customers will not do.
>
> `.cursorrules` forbids adding SMS/WhatsApp sending. That still holds — push
> and the CSV call list only.

---

## PHASE 7 — Play Store submission

Mostly not code. Ordered by lead time, longest first.

1. **Decide account type now.** Organisation account (needs business
   registration + D-U-N-S) skips the 12-testers/14-days closed test. Personal
   account does not. This decision costs two weeks if you get it wrong.
2. **Change the app identity.** `app.json` still says
   `com.anonymous.jewelry-girvi-app` / `com.anonymous.jewelrygirviapp` and the
   name `jewelry-girvi-app`. The package name is **permanent once published**.
   Fix it before your first upload, not after.
3. **Store listing wording** — per §0.2. Pledge/receipt/record-keeping language.
   No credit-marketing verbs.
4. **Financial features declaration** — complete honestly; have the state
   pawnbroker/money-lender licence ready.
5. **Data safety form** — you collect phone numbers, KYC photos, ID last-4, and
   pledged-item photos. Declare all of it. A false data-safety form is a
   removal offence and is checked against the actual binary.
6. **Privacy policy at a public URL** — mandatory. It must cover KYC photo
   retention and deletion, and match the data safety form exactly.
7. **Account deletion** — Play requires **both** an in-app path *and* a public
   web URL, for any app that lets users create an account in-app. Your
   activation flow (scan QR → set own PIN) very likely counts.

   The current build ships an honest placeholder: the confirm sheet states in
   `en` and `hi`, *before* the user commits, that deletion is unavailable in
   this version and to visit the shop. That is fine for a staff-APK + website
   release. It is not sufficient for Play.

   **The compliant version is smaller than it looks.** Google explicitly permits
   retaining data for "security, fraud prevention or regulatory compliance",
   provided you disclose the retention in your privacy policy. So the
   anonymise-open-loans-but-delete-the-sign-in design is already the shape
   Google accepts — you need the RPC, plus a deletion-request page on the same
   Vercel domain, plus a privacy-policy paragraph matching the wording already
   in `settings.deleteAccountBody`.

> **Cursor prompt — release config**
>
> [guardrails block]
>
> Prepare the Android release without changing app behaviour:
> 1. In `app.json`, replace the `com.anonymous.*` identifiers with real ones I
>    will supply, and set a proper display name. List every other file that
>    hard-codes the old package (`android/`, `e2e/*.yaml`, README) and update
>    them consistently.
> 2. Configure `eas.json` `production` for an `app-bundle` build and add an EAS
>    Submit configuration for Play internal testing.
> 3. Add an in-app "Delete my account" flow on the customer settings screen that
>    calls a new SECURITY DEFINER RPC. It must **anonymise, not hard-delete**,
>    any loan that is not yet redeemed — the shop has a legal record-keeping
>    obligation for an open pledge, and a hard delete would destroy it. Make the
>    screen state that plainly to the customer. New migration + pgTAP proving a
>    customer cannot delete another customer's data and that an active loan
>    survives anonymisation.
> 4. Confirm no `EXPO_PUBLIC_*` variable contains a service-role key or any
>    OCR/gold API key, and paste the evidence.

---

## Suggested order and what it costs you

| Phase | Effort | Blocks |
| --- | --- | --- |
| 0 — verify hosted backend | hours | everything |
| 1 — env split | hours | safety of all later testing |
| 2 — PIN + token auth | 2–3 days | customer access, QR |
| 3 — realtime + offline | 2 days | production trust |
| 4 — web export + Vercel | 2–3 days | all iOS customers |
| 5 — QR + redirect | 2 days | needs 2 and 4 |
| 6 — push | 1–2 days | nothing |
| 7 — Play Store | 2 weeks elapsed, mostly waiting | start the account today |

**What you give up by this order:** nothing customer-visible ships for about a
week. Phases 0–1 feel like standing still. The alternative — building the
website first on an unverified hosted schema — means discovering in Phase 4
that production drifted three migrations ago, with a live website on top of it.

**Start Phase 7 step 1 today, in parallel.** It is the only item whose clock
runs while you write code.

---

## What this plan deliberately does not include

- **An iOS app.** The website covers iOS. Add one only if customers ask, and
  only after the Play listing survives review — App Store financial-app review
  is stricter, not looser.
- **SMS or WhatsApp.** Per §0.1 and `.cursorrules`.
- **A payment gateway.** Money moves at the counter. Accepting online repayment
  pulls in PCI scope, an RBI payment-aggregator relationship, and a completely
  different Play policy category.
- **Multi-shop tenancy.** `shop_defaults` is pinned to `id = 1`. That is correct
  for one shop and a rewrite for two. Decide before, not during.
- **An offline write queue.** Phase 3b asks Cursor to scope it, not build it.
  Getting serial-number allocation right across offline devices is genuinely
  hard and should be its own project.
