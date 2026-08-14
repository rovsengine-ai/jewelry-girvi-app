# jewelry-girvi-app — read-only audit

Audited against the working tree after Stages 0–5 plus Defect C (`create_loan`).
Hosted production schema, bucket privacy, and applied RLS on any remote
Supabase project are **NOT VERIFIABLE FROM REPO**.

`src/app/` is domain code (OTP auth, shop scanner/dashboard/loan lifecycle,
customer receipts). Orphan starter components may still exist outside the
router; they are not mounted.

---

## STEP 0 — DOC GATE

Fetched: https://docs.expo.dev/versions/v57.0.0/

| Package | URL | Title / date from page |
| --- | --- | --- |
| Expo SDK index | https://docs.expo.dev/versions/v57.0.0/ | Expo SDK reference (mod. July 29, 2026) |
| expo-router | https://docs.expo.dev/versions/v57.0.0/sdk/router/ | Router (mod. June 29, 2026) |
| expo-secure-store | https://docs.expo.dev/versions/v57.0.0/sdk/securestore/ | SecureStore (mod. July 20, 2026) |
| expo-camera | https://docs.expo.dev/versions/v57.0.0/sdk/camera/ | Camera (mod. August 13, 2026) |
| expo-image-picker | https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/ | ImagePicker (mod. August 12, 2026) |
| expo-file-system | https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/ | FileSystem (mod. June 29, 2026) |
| expo-notifications | https://docs.expo.dev/versions/v57.0.0/sdk/notifications/ | Notifications (mod. August 13, 2026) |
| expo-print | https://docs.expo.dev/versions/v57.0.0/sdk/print/ | Print (mod. August 12, 2026) |
| expo-sharing | https://docs.expo.dev/versions/v57.0.0/sdk/sharing/ | Sharing (mod. August 12, 2026) |

`package.json` declares `"expo": "~57.0.12"` and `"react-native": "0.86.2"`.

---

## STEP 1 — WHERE DOES THE SCHEMA LIVE?

Versioned migrations live in `supabase/migrations/` (12 files). They are the
source of truth **for the local CLI database**. Whether they have been applied
to any hosted project is **NOT VERIFIABLE FROM REPO**.

| File | Role |
| --- | --- |
| `20260813120000_baseline_live_schema.sql` | profiles, loans, payments, storage bucket |
| `20260813130100_integer_money_roles_terms.sql` | paise/bps, shop_defaults, roles |
| `20260813190000_loan_interest_engine.sql` | SQL interest engine |
| `20260813200000_security_rls_storage_phone.sql` | RLS, private receipts, phone |
| `20260815000000_fix_unpaid_interest_carry.sql` | unpaid interest capitalizes |
| `20260815010000_partial_period_mode_min_month.sql` | enum `ADD VALUE` (own transaction) |
| `20260815020000_interest_min_month_threshold.sql` | `min_month_then_pro_rata` + threshold |
| `20260815030000_lifecycle_items_kyc_notices.sql` | `loan_status`, `loan_items`, KYC, notices |
| `20260815040000_redeem_and_renew_rpcs.sql` | `redeem_loan` / `renew_loan` |
| `20260815050000_shop_yield_and_notices.sql` | `shop_rate_yield`, `generate_loan_notices` |
| `20260815060000_customer_loan_reminders.sql` | `customer_loan_reminder_schedule` |
| `20260815070000_atomic_create_loan.sql` | `create_loan` + empty-item redeem refuse |

pgTAP lives in `supabase/tests/` (`000`–`090`). RLS claims below are about
**this migration chain**, exercised by `050-rls-and-permissions_test.sql`.
They are not a statement about hosted production.

There is no `database/schema.sql` in this tree.

---

## STEP 2 — IS THIS STILL THE STARTER TEMPLATE?

There is no root `app/` directory. Expo Router files live under `src/app/`
(`tsconfig.json` paths `@/*` → `./src/*`).

| File | Classification |
| --- | --- |
| `src/app/_layout.tsx` | DOMAIN — `AuthProvider`, `AuthGate` |
| `src/app/index.tsx` | DOMAIN — login / role redirect |
| `src/app/(auth)/_layout.tsx` | DOMAIN — auth stack |
| `src/app/(auth)/login.tsx` | DOMAIN — phone OTP |
| `src/app/(admin)/_layout.tsx` | DOMAIN — shop stack; redirects non-shop roles |
| `src/app/(admin)/dashboard.tsx` | DOMAIN — loans, search, yield, overdue CSV |
| `src/app/(admin)/scanner.tsx` | DOMAIN — camera, OCR, signature, create loan |
| `src/app/(admin)/loan/[id]/_layout.tsx` | DOMAIN — nested stack for detail / redeem / renew |
| `src/app/(admin)/loan/[id]/index.tsx` | DOMAIN — loan detail and payments |
| `src/app/(admin)/loan/[id]/redeem.tsx` | DOMAIN — owner redemption checklist |
| `src/app/(admin)/loan/[id]/renew.tsx` | DOMAIN — interest-only renewal |
| `src/app/(customer)/_layout.tsx` | DOMAIN — customer stack; local DATE reminders |
| `src/app/(customer)/index.tsx` | DOMAIN — redirect to customer dashboard |
| `src/app/(customer)/dashboard.tsx` | DOMAIN — own receipts |

**Ratio (route files):** DOMAIN CODE 14 / CREATE-EXPO-APP BOILERPLATE 0.

The old single file `src/app/(admin)/loan/[id].tsx` is gone. Expo Router
resolves `/(admin)/loan/[id]` to `loan/[id]/index.tsx`.

Unused starter leftovers still in the repo but **not** mounted: template
`scripts/reset-project.js`. `@expo/ui` and `expo-glass-effect` are declared
and unused.

---

## STEP 3 — SUPABASE WIRING

| Check | Result |
| --- | --- |
| Client created | `src/lib/supabase.ts` — `createClient<Database>(…)` |
| Env | `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (`?? ''`). Not hardcoded. |
| SecureStore adapter | Native: `ExpoSecureStoreAdapter`. Web: `localStorage`. |
| `react-native-url-polyfill` | Imported at top of `src/lib/supabase.ts`. |
| `autoRefreshToken` | `true` |
| AppState refresh | Present: `startAutoRefresh` / `stopAutoRefresh` on `AppState` (`src/lib/supabase.ts`). |
| Keys committed | No live secrets found in tracked source. `.env.example` has placeholders only. Moonshot is documented as an Edge Function secret, not `EXPO_PUBLIC_*`. |
| `.gitignore` | Ignores `.env` and `.env*.local`. |

Walk-in customer creation is `supabase/functions/create-walkin-customer/`
(service-role, shop JWT). The service-role key must not reach the client.

---

## STEP 4 — AUTH & ROLE MODEL

### Mobile OTP chain

| Link | Status | Evidence |
| --- | --- | --- |
| Send OTP | Present | `supabase.auth.signInWithOtp({ phone })` — `src/app/(auth)/login.tsx` |
| Verify OTP | Present | `supabase.auth.verifyOtp({ phone, token, type: 'sms' })` |
| Session persist | Present | `persistSession: true` + SecureStore / localStorage |
| Refresh | Present | `autoRefreshToken` + AppState listener |
| Sign-out | Present | `supabase.auth.signOut()` via `useAuth().signOut` |
| Auth state listener | Present | `onAuthStateChange` — `src/providers/auth-provider.tsx` |

### How shop vs customer is determined

- **Not** a JWT custom claim read in app code.
- `profiles.role` from Supabase (`owner` \| `staff` \| `retail_customer` \| `merchant`).
- `routeForRole`: `owner`/`staff` → `/(admin)/dashboard`, else customer dashboard.

### Are admin routes gated or only hidden?

- `(admin)/_layout.tsx` redirects anyone who is not `owner` or `staff`.
- `(customer)/_layout.tsx` redirects anyone who is not `retail_customer` or `merchant`.
- Root `AuthGate` sends unauthenticated users to login.
- Data isolation is RLS in the migration chain (shop vs own-rows). Hosted
  enforcement: **NOT VERIFIABLE FROM REPO**.

---

## STEP 5 — DOMAIN FEATURE INVENTORY

Statuses describe **this repo**, not hosted production.

| # | Feature | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Customer registry (KYC, phone) | PARTIAL | Phone OTP + walk-in Edge Function. KYC columns and `kyc` bucket exist in `20260815030000`. No shop KYC screen yet. |
| 2 | Pledged item entry | PARTIAL | `loan_items` (integer mg, nullable `purity_karat`). Scanner still sends one `item_name` / `weight_grams` pair through `create_loan`. No metal / multi-item UI yet. |
| 3 | Item photographs | PARTIAL | Schema `loan_item_photos` + path CHECK `{uuid}/items/…`. `uploadImageToStorage(…, 'items', …)` exists. Scanner does not capture per-item photos yet. Receipt-pad image is stored on the loan. |
| 4 | Loan issuance | PRESENT | `create_loan` RPC (shop-only, ≥1 item, copies shop defaults). Client: `createLoanWithCustomer`. |
| 5 | Interest accrual | PRESENT | SQL `loan_balances_as_of`. Spec in `docs/RULES.md`. No JS accrual. |
| 6 | Repayment recording | PRESENT | `payments.amount_paid_paise`. Allocation is SQL. |
| 7 | Receipt-pad OCR | PRESENT | `expo-camera` + `src/services/ocrService.ts`. |
| 8 | Borrower signature | PRESENT | `react-native-signature-canvas`; private `receipts` bucket `{customer_id}/signatures/…`. |
| 9 | Redemption / item release | PRESENT | `redeem_loan` (owner-only, checklist, audit snapshot). Empty `loan_items` is refused. UI: `loan/[id]/redeem.tsx`. |
| 10 | Overdue / forfeiture | PARTIAL | `loans_overdue_as_of`, `generate_loan_notices`, overdue CSV share. No auction workflow. |
| 11 | Admin dashboard | PRESENT | All loans, search, yield RPC, overdue export. Layout role-gated. |
| 12 | Customer view | PRESENT | Own loans / receipts. Local DATE notifications from `customer_loan_reminder_schedule` — not remote push. |
| 13 | Storage path namespacing | PRESENT | `{customer_id}/{receipts\|signatures\|items}/…`. Signed URLs. `SAFE_STORAGE_PATH_RE` matches `loan_item_photos_path_chk`. |
| 14 | Printable pledge / redemption | PRESENT | `expo-print` + `expo-sharing`; HTML from frozen loan terms (`src/lib/print-documents.ts`). |

---

## STEP 6 — PLATFORM PARITY (`@expo/ui` / `expo-glass-effect`)

| Library | Declared | Usage in `src/` |
| --- | --- | --- |
| `@expo/ui` | `package.json` | **No imports** |
| `expo-glass-effect` | `package.json` | **No imports** |
| `expo-image-picker` | `package.json` | **No imports** (scanner uses `expo-camera`) |

No iOS-only glass UI is rendered. Unused deps are listed, not removed.

---

## STEP 7 — RED FLAGS (severity descending)

1. **Hosted production drift is unknown** — migrations and pgTAP describe local
   CLI state only. Remote apply / dashboard edits: **NOT VERIFIABLE FROM REPO**.
2. **Live gold rate is a dead/demo path** — `goldRateService.ts` calls
   `https://api.metals.live/v1/spot/gold` and uses `usdToInr = 83.5`. Not IBJA.
   Valuation is not frozen in SQL.
3. **Scanner still one item, no metal, float gram input** — milligram conversion
   is `Math.round(Number(weight) * 1000)` until Stage 6.1 `gramsInputToMg`.
4. **KYC UI is missing** — columns and the Aadhaar-photo CHECK exist; staff
   cannot capture or mark verified from the app yet.
5. **OCR vendor key must stay off the client** — `.env.example` says so;
   confirm no `EXPO_PUBLIC_MOONSHOT_*` is introduced.
6. **`enforce_loan_mutation_permissions` raises if `auth.uid()` is NULL** —
   service-role `UPDATE` of `loans` is unsafe. Known, not widened here.
7. **Phone leading-zero mangling** — `toE164India`, SQL `normalize_phone_e164`,
   and the walk-in function must stay in lockstep. Known.
8. **Declared UI stack unused** — `@expo/ui`, `expo-glass-effect`.

---

## STEP 8 — OPEN QUESTIONS (not inventable from the repo)

1. Has any hosted Supabase project applied this 12-file chain, or does
   production still differ?
2. Will the shop subscribe to official IBJA rates, or use an indicative feed
   plus owner override?
3. Who mints the first `owner` row in production (SQL, invite metadata, phone
   allowlist), and is there more than one shop?
