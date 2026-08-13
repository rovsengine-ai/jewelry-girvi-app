# jewelry-girvi-app — read-only audit

`src/app/` is majority domain code (OTP auth, admin scanner/dashboard/loan detail, customer receipts), not the create-expo-app tabs starter. Orphan starter components still exist outside the router.

---

## STEP 0 — DOC GATE

Fetched: https://docs.expo.dev/versions/v57.0.0/

Doc pages successfully read:

| Package | URL | Title / date from page |
| --- | --- | --- |
| Expo SDK index | https://docs.expo.dev/versions/v57.0.0/ | Expo SDK reference (mod. July 29, 2026) |
| expo-router | https://docs.expo.dev/versions/v57.0.0/sdk/router/ | Router (mod. June 29, 2026) |
| expo-secure-store | https://docs.expo.dev/versions/v57.0.0/sdk/securestore/ | SecureStore (mod. July 20, 2026) |
| expo-camera | https://docs.expo.dev/versions/v57.0.0/sdk/camera/ | Camera (mod. August 13, 2026) |
| expo-image-picker | https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/ | ImagePicker (mod. August 12, 2026) |
| expo-file-system | https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/ | FileSystem (mod. June 29, 2026) |

DOC GATE: passed.

Note: `package.json` currently declares `"expo": "^53.0.27"` and `"react-native": "^0.72.17"` while listing many `~57.0.x` packages (`package.json:8–36`). That mismatch is recorded as a red flag; version claims below about app code cite repo files, not resolved install trees.

---

## STEP 1 — WHERE DOES THE SCHEMA LIVE?

- There is **no** `supabase/` directory and **no** migration history in this repo.
- There is an unversioned SQL artifact at `database/schema.sql` (tables, helpers, proposed RLS, storage bucket insert). That file is **not** a versioned migration chain and does **not** prove what is applied on any hosted Supabase project.
- Therefore: **the live schema is unversioned from this repo’s perspective; whether `database/schema.sql` matches the hosted dashboard is NOT VERIFIABLE FROM REPO.**
- **Every RLS / policy question below is marked `NOT VERIFIABLE FROM REPO`.** Policy text in `database/schema.sql` is treated as proposed DDL only, not as confirmed live enforcement. No policy contents are asserted as applied.

---

## STEP 2 — IS THIS STILL THE STARTER TEMPLATE?

There is no root `app/` directory. Expo Router files live under `src/app/` (`tsconfig.json` paths `@/*` → `./src/*`). Classification of every route file:

| File | Classification |
| --- | --- |
| `src/app/_layout.tsx` | DOMAIN CODE — `AuthProvider`, session `AuthGate`, stack for auth/admin/customer |
| `src/app/index.tsx` | DOMAIN CODE — loading / login / role redirect |
| `src/app/(auth)/_layout.tsx` | DOMAIN CODE — auth stack shell |
| `src/app/(auth)/login.tsx` | DOMAIN CODE — phone OTP send/verify |
| `src/app/(admin)/_layout.tsx` | DOMAIN CODE — admin stack (dashboard, scanner, loan/[id]) |
| `src/app/(admin)/dashboard.tsx` | DOMAIN CODE — loans list, search, analytics |
| `src/app/(admin)/scanner.tsx` | DOMAIN CODE — camera, OCR, signature, create loan |
| `src/app/(admin)/loan/[id].tsx` | DOMAIN CODE — loan detail, payments |
| `src/app/(customer)/_layout.tsx` | DOMAIN CODE — customer stack |
| `src/app/(customer)/index.tsx` | DOMAIN CODE — redirect to customer dashboard |
| `src/app/(customer)/dashboard.tsx` | DOMAIN CODE — own receipts list |

**Ratio (route files):** DOMAIN CODE 11 / CREATE-EXPO-APP BOILERPLATE 0 / EMPTY-OR-TODO 0.

Unused starter leftovers still in repo but **not** mounted by current routes: `src/components/app-tabs.tsx` (Home/Explore `NativeTabs`), `src/components/hint-row.tsx` (“Try editing”), `src/components/web-badge.tsx`, `src/components/ui/collapsible.tsx`, `scripts/reset-project.js`, template `README.md`.

---

## STEP 3 — SUPABASE WIRING

| Check | Result |
| --- | --- |
| Client created | `src/lib/supabase.ts:33` — `createClient<Database>(supabaseUrl, supabaseAnonKey, …)` |
| Env mechanism | `process.env.EXPO_PUBLIC_SUPABASE_URL` and `process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY` with `?? ''` (`src/lib/supabase.ts:9–10`). Not `expo-constants`. Not hardcoded URL/key values. |
| SecureStore auth adapter | Yes on native: `ExpoSecureStoreAdapter` with `getItem`/`setItem`/`removeItem` (`src/lib/supabase.ts:12–16`, wired at `:35`). Web uses `localStorage` adapter (`src/lib/supabase.ts:18–31`, `:35`). |
| `react-native-url-polyfill` at entry | Imported at top of client module: `import 'react-native-url-polyfill/auto'` (`src/lib/supabase.ts:1`). Not separately in `src/app/_layout.tsx`; loads when `@/lib/supabase` is first imported (via auth provider). |
| `autoRefreshToken` | `true` (`src/lib/supabase.ts:36`) |
| AppState refresh handling | **MISSING** — no `AppState` listener calling `supabase.auth.startAutoRefresh` / `stopAutoRefresh` anywhere under `src/`. |
| Keys committed | **No live secrets found in tracked source.** Exhaustive checks: |
| | `.env` — **MISSING** (only `.env.example` present with placeholders: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MOONSHOT_API_KEY` at `.env.example:2–7`). |
| | `app.json` `extra` — **MISSING**; no Supabase keys (`app.json` entire file). |
| | Source — no `eyJ…` JWTs, no `service_role` key strings, no real project URLs. `service_role` appears only as SQL role names in `database/schema.sql:280–285`. |
| | `.gitignore` ignores `.env*.local` (`.gitignore:34`) but **does not ignore `.env`**, so a future real `.env` could be committed unnoticed. |

---

## STEP 4 — AUTH & ROLE MODEL

### Mobile OTP chain

| Link | Status | Evidence |
| --- | --- | --- |
| Send OTP | Present | `supabase.auth.signInWithOtp({ phone })` — `src/app/(auth)/login.tsx:52` |
| Verify OTP | Present | `supabase.auth.verifyOtp({ phone, token, type: 'sms' })` — `src/app/(auth)/login.tsx:72–76` |
| Session persist | Present | `persistSession: true` + SecureStore/localStorage adapter — `src/lib/supabase.ts:35–37`; restore via `getSession` — `src/providers/auth-provider.tsx:43–46` |
| Refresh | Partial | `autoRefreshToken: true` (`src/lib/supabase.ts:36`); **MISSING** AppState foreground/background refresh wiring |
| Sign-out | Present | `supabase.auth.signOut()` — `src/providers/auth-provider.tsx:68–69`; UI buttons `src/app/(admin)/dashboard.tsx:148`, `src/app/(customer)/dashboard.tsx:78` |
| Auth state listener | Present | `onAuthStateChange` — `src/providers/auth-provider.tsx:49–52` |

Post-verify: updates `profiles.phone_number` (`src/app/(auth)/login.tsx:89–92`), reloads profile, routes by role (`src/app/(auth)/login.tsx:94–103`).

### How admin vs customer is determined

- **Not** a JWT custom claim read in app code.
- **`profiles.role`** loaded from Supabase: `supabase.from('profiles').select('*').eq('id', userId)` — `src/providers/auth-provider.tsx:17–23`.
- Routing helper: `role === 'admin'` → `/(admin)/dashboard`, else `/(customer)/dashboard` — `src/providers/auth-provider.tsx:89–94`.
- Types allow `'admin' | 'retail_customer' | 'merchant'` — `src/types/database.ts:1`.
- How a user becomes `admin` in the database (seed, dashboard edit, trigger metadata) is **NOT VERIFIABLE FROM REPO** beyond proposed trigger reading `raw_user_meta_data.role` in unversioned `database/schema.sql` (not asserted as live).

### Are admin routes gated or only hidden?

- **Not gated by role on the admin route group.** `src/app/(admin)/_layout.tsx:1–10` is an ungated `Stack` with no `profile.role` check.
- Root `AuthGate` only: (1) sends unauthenticated users to login; (2) sends authenticated users *out of* `(auth)` via `routeForRole` — `src/app/_layout.tsx:17–31`. It does **not** block a non-admin session from opening `/(admin)/*`.
- `src/app/index.tsx:17–21` and login `router.replace(routeForRole(…))` only choose the initial destination.
- Conclusion: admin vs customer is **client navigation preference**, not an enforced route gate. Any data isolation depends on hosted RLS — **NOT VERIFIABLE FROM REPO**.

---

## STEP 5 — DOMAIN FEATURE INVENTORY

Constraint: without confirmed applied RLS, maximum status is **PARTIAL**.

| # | Feature | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Customer/borrower registry (KYC, phone identity) | PARTIAL | Phone OTP identity: `login.tsx:52`, `:72–76`. Profile fields used: `full_name`, `phone_number`, `address`, `role` (`database.ts:7–15`; updates in `loanService.ts:68–74`, `login.tsx:89–92`). No KYC fields (Aadhaar/PAN/doc photos) in types or UI. No dedicated registry screen. RLS: **NOT VERIFIABLE FROM REPO**. |
| 2 | Pledged item entry (type, gross/net, purity, valuation) | PARTIAL | Form/DB: `item_name`, single `weight_grams` (`scanner.tsx:224–230`; `loanService.ts:82–83`; `database.ts:22–23`). No ornament type, gross/net split, or purity columns/UI. Client gold estimate: `goldRateService.ts:41–45`, shown `scanner.tsx:205–212`. RLS: **NOT VERIFIABLE FROM REPO**. |
| 3 | Item photographs per-loan | PARTIAL | Stores **receipt-pad** image URL on loan (`receipt_image_url`) via `uploadImageToStorage` → bucket `receipts` (`loanService.ts:10–37`, `scanner.tsx:112–113`). Not a separate item-photo gallery. RLS/storage policies: **NOT VERIFIABLE FROM REPO**. |
| 4 | Loan issuance (principal, rate, tenure, issue date) | PARTIAL | Insert: principal, monthly rate, status, serial, customer (`loanService.ts:76–88`). UI fields `scanner.tsx:215–242`. **No tenure field.** Issue time is `created_at` only (`database.ts:28`). RLS: **NOT VERIFIABLE FROM REPO**. |
| 5 | Interest accrual / outstanding | PARTIAL | **Client-side only:** `calculateLoanBalances` uses JS `Date` month difference × rate × remaining principal (`loanService.ts:99–132`); displayed `loan/[id].tsx:82–91`, `:154–155`. No DB function/trigger for accrual in app queries. |
| 6 | Repayment recording | PARTIAL | `logPayment` insert (`loanService.ts:135–148`); UI type chips + amount (`loan/[id].tsx:159–190`); history list (`loan/[id].tsx:196–207`). Auto-close when remaining principal ≤ 0 (`loanService.ts:151–159`, `loan/[id].tsx:108–111`). RLS: **NOT VERIFIABLE FROM REPO**. |
| 7 | Handwritten receipt-pad scanning / OCR | PARTIAL | Camera capture `expo-camera` (`scanner.tsx:11`, `:179`, `:104`); OCR via Moonshot Kimi (`ocrService.ts:97–149`) using `EXPO_PUBLIC_MOONSHOT_API_KEY` (`ocrService.ts:98–100`); then upload + review form (`scanner.tsx:109–124`). Not photo-storage-only. |
| 8 | Borrower signature on pledge | PARTIAL | `react-native-signature-canvas` (`scanner.tsx:15`, `:246–255`); upload path `signatures/…` inside same `receipts` bucket (`scanner.tsx:269–274`, `loanService.ts:12–15`, `:27`); stored as `digital_signature_url` (`loanService.ts:87`). RLS/storage: **NOT VERIFIABLE FROM REPO**. |
| 9 | Redemption / item release | SCAFFOLD ONLY | Closing sets `status: 'closed'` when principal remaining is 0 (`loanService.ts:151–159`). No release checklist, physical return confirmation, or redemption-specific screen. |
| 10 | Overdue / forfeiture / auction | NOT STARTED | No matches for overdue/forfeit/auction flows in `src/`. Loan status is only `active` \| `closed` (`database.ts:3`). |
| 11 | Admin dashboard: all-loans, search, filters | PARTIAL | Loads active loans with customer join (`dashboard.tsx:93–110`); client search + retail/merchant tabs (`dashboard.tsx:121–133`, `:177–201`); analytics cards (`dashboard.tsx:154–175`). Route not role-gated (Step 4). RLS: **NOT VERIFIABLE FROM REPO**. |
| 12 | Customer view: own loans / own receipts | PARTIAL | Selects `id, receipt_image_url, status` with `.eq('customer_id', session.user.id)` (`dashboard.tsx:45–49`). Client filter is UX; server isolation **NOT VERIFIABLE FROM REPO**. |
| 13 | Storage bucket structure / path namespacing | PARTIAL | Code always uses bucket id `'receipts'` (`loanService.ts:27`); paths `${folder}/${Date.now()}-…` where folder is `receipts` or `signatures` (`loanService.ts:15`) — **no `auth.uid()` / user-id namespace**. Public URL via `getPublicUrl` (`loanService.ts:36–37`). Hosted bucket privacy: **NOT VERIFIABLE FROM REPO** (proposed `public: true` exists only in unversioned `database/schema.sql`). |
| 14 | Printable / exportable receipt or agreement | NOT STARTED | No print/PDF/share/export implementation under `src/`. |

---

## STEP 6 — PLATFORM PARITY (`@expo/ui` / `expo-glass-effect`)

| Library | Declared | Usage in `src/` | Android path |
| --- | --- | --- | --- |
| `@expo/ui` | `package.json:6` | **No imports** (grep of `src/` empty) | N/A — unused |
| `expo-glass-effect` | `package.json:14` | **No imports** | N/A — unused |

No iOS-only `@expo/ui` / glass components are rendered, so there are no missing Android fallbacks for those libraries today. UI is React Native primitives + local themed components (`ThemedText`, `ThemedView`).

Related unused dependency: `expo-image-picker` is in `package.json:16` but never imported under `src/` (camera path uses `expo-camera` only).

---

## STEP 7 — RED FLAGS (severity descending)

1. **RLS / live schema not auditable from repo** — no `supabase/migrations`; hosted policies **NOT VERIFIABLE FROM REPO**. Client `.eq('customer_id', …)` (`customer/dashboard.tsx:48`) is not a security boundary.
2. **Admin privilege is client-routed only** — non-admin can be sent to customer UI by default, but `(admin)` layouts never check `profile.role` (`(admin)/_layout.tsx`; contrast `routeForRole` in `auth-provider.tsx:89–94`).
3. **Storage uses public URLs** — `getPublicUrl` after upload (`loanService.ts:36–37`). Object paths are not user-namespaced (`loanService.ts:15`). Hosted bucket public/private: **NOT VERIFIABLE FROM REPO**.
4. **OCR vendor API key is designed as `EXPO_PUBLIC_*`** — `EXPO_PUBLIC_MOONSHOT_API_KEY` read in client (`ocrService.ts:98–100`; `.env.example:7`). Any real key in that slot ships in the app bundle.
5. **Money as JavaScript `number` / float arithmetic** — `Number(loan.loan_amount)`, `projectYield` multiplies floats (`dashboard.tsx:31–32`, `:38–42`); payments `Number(amount)` (`loan/[id].tsx:97`); balances use float math then `Math.round(…*100)/100` (`loanService.ts:105–131`). Types/DB proposed as `numeric` in SQL artifact only; app has no integer paise representation.
6. **Timezone / interest month math is client calendar months** — `getFullYear`/`getMonth` local device time (`loanService.ts:115–120`); loan “issue date” is `created_at` timestamptz string with no shop-timezone policy in app code.
7. **Phone normalization inconsistency** — login forces `+91…` (`login.tsx:23–31`); `findCustomerIdByPhone` only strips spaces/leading zeros (`loanService.ts:6–7`, `:41–46`). OCR/admin-entered phones may fail customer lookup.
8. **`.gitignore` does not ignore `.env`** — only `.env*.local` (`.gitignore:34`); real env files are one mistake away from commit.
9. **`package.json` Expo/RN version skew** — `expo` `^53.0.27` and `react-native` `^0.72.17` alongside many SDK 57 packages (`package.json:8–27`).
10. **No AppState-based auth refresh** — `autoRefreshToken: true` only (`supabase.ts:36`); background resume refresh pattern **MISSING**.
11. **Declared UI stack unused** — `@expo/ui` and `expo-glass-effect` installed but never used; platform-parity debt deferred until first adoption.

---

## STEP 8 — THREE QUESTIONS

1. Has any Supabase project already applied a schema (and if so, which environment URL), and are the `receipts` bucket and table RLS policies currently matching anything you consider source of truth — or is the hosted DB still empty / hand-edited?
2. How must the first shop-owner `admin` account be created in production (manual SQL role flip, invite metadata, allowlist of phone numbers), and will there ever be more than one admin or more than one shop?
3. What is the shop’s real interest and overdue rule set (simple monthly on remaining principal vs 30-day periods, grace days, compounding, forfeiture/auction timeline), since the app currently estimates accrual only as local calendar-month × rate on the device?
