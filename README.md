# Girvi Sewa

Expo SDK 57 app for a jewellery pawn-broking (girvi) counter. Shop users
(`owner` / `staff`) issue and redeem loans. Customers see only their own
receipts. Domain rules live in [`docs/RULES.md`](docs/RULES.md). The last
read-only pass of this tree is [`docs/AUDIT.md`](docs/AUDIT.md).

## Stack

- React Native + Expo Router (SDK 57)
- Supabase (Postgres, Auth phone OTP, Storage, Edge Functions)
- TypeScript strict

Admin routes are under `src/app/(admin)/`. Customer routes are under
`src/app/(customer)/`. Do not mix them.

## Prerequisites

- Node 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker (for local Postgres + `supabase test db`)

## Local Supabase

```bash
npx supabase start
npx supabase db reset
```

`db reset` applies every file in `supabase/migrations/` to the **local**
database only. It is destructive locally. Hosted production is not updated by
this command.

Edge Function secrets (never `EXPO_PUBLIC_*`):

**Local OCR — Gemini free tier (recommended):**

```bash
cp supabase/functions/.env.example supabase/functions/.env
# Edit .env — key from https://aistudio.google.com/apikey
# GEMINI_API_KEY=...
npx supabase stop && npx supabase start
```

If both `GEMINI_API_KEY` and `MOONSHOT_API_KEY` are set, Gemini is used.

**Local OCR — Kimi / Moonshot (paid):**

```bash
# Key from https://platform.kimi.ai/api-keys (international Secret Key sk-...)
# MOONSHOT_API_KEY=sk-...
npx supabase stop && npx supabase start
```

If your key is from `platform.moonshot.cn`, set
`MOONSHOT_API_BASE_URL=https://api.moonshot.cn/v1` in that same file.

**Modal Kimi (OpenAI-compatible proxy):**

```bash
# 1. Create proxy token: modal token new  → wk-... and ws-...
# 2. Get endpoint URL: modal endpoint list  (NOT https://modal.com)
cp supabase/functions/.env.example supabase/functions/.env
```

In `supabase/functions/.env`:

```bash
MOONSHOT_API_BASE_URL=https://YOUR-ENDPOINT.modal.run/v1
MOONSHOT_API_KEY=wk-YOUR-ID.ws-YOUR-SECRET
MOONSHOT_MODEL=moonshotai/Kimi-K3
npx supabase stop && npx supabase start
```

See [Modal endpoints](https://modal.com/docs/guide/endpoints) and [Kimi K3 on Modal](https://modal.com/library/moonshot/kimi-k3).

**Hosted project:**

```bash
npx supabase secrets set GEMINI_API_KEY=...
# or: npx supabase secrets set MOONSHOT_API_KEY=sk-...
```

Copy `.env.example` to `.env` and fill the **anon** URL and key from
`npx supabase status`.

## Test accounts

These exist only in the local CLI database after `npx supabase db reset` — never on a hosted project.

`EXPO_PUBLIC_SUPABASE_URL` in `.env` must be the local API from
`npx supabase status` (`http://127.0.0.1:54321`), not a hosted project.
Restart Metro after changing `.env` (`npx expo start -c`). A physical
phone needs the Mac’s LAN IP instead of `127.0.0.1`. OTP is fixed via
`[auth.sms.test_otp]` in `supabase/config.toml`; there is no SMS provider.

| Role | Phone (10 digits) | OTP |
| --- | --- | --- |
| owner | `9000000001` | `123456` |
| staff | `9000000002` | `123456` |
| retail customer | `9000000003` | `123456` |

## Run the app

```bash
npm install
npx expo start
```

Then open iOS simulator, Android emulator, or a dev client. Expo Go may not
include every native module this app uses (`expo-notifications`, `expo-print`,
camera). Prefer a development build.

## Customer website (Vercel)

The customer dashboard is a static Expo web export (`web.output: "static"`).
Shop UI is not shipped in that bundle; staff use the native app.

```bash
npm run build:web   # → dist/
```

[`vercel.json`](vercel.json) sets `buildCommand` to `npm run build:web`,
`outputDirectory` to `dist`, rewrites for `/g/:token` and `/a/:token` to the
Edge Function at `api/qr-redirect.ts` (Android Intent vs web shell; never
touches the database), a catch-all rewrite for other client-side deep links,
`/.well-known/assetlinks.json` for Android App Links, and security headers.
See [Publish websites](https://docs.expo.dev/guides/publishing-websites/) and
[Android App Links](https://docs.expo.dev/linking/android-app-links/).

### Android App Links fingerprint

`public/.well-known/assetlinks.json` ships with package
`com.girvisewa.app` and a placeholder SHA-256. Replace
`REPLACE_WITH_RELEASE_SHA256_FINGERPRINT` before relying on verified App Links:

```bash
# EAS-managed credentials (preferred)
eas credentials -p android
# Select the production (or preview) profile → copy "SHA256 Fingerprint"

# Or from a local upload keystore
keytool -list -v -keystore /path/to/your-upload-key.keystore -alias your-key-alias
# Use the SHA256 line (colon-separated hex)
```

Until a Play Store listing exists, Android-without-app falls back to the web
dashboard (`api/lib/qr-redirect.ts` → `ANDROID_NO_APP_FALLBACK_URL = null`).
Set that constant to the Play Store URL when the listing goes live.

### Environment variables on Vercel

Set these in the Vercel project (Production / Preview as needed). They are
baked in at **build** time (`EXPO_PUBLIC_*`).

| Variable | Required | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_ENV` | yes | Must be `production` for the live site |
| `EXPO_PUBLIC_SUPABASE_URL` | yes | Hosted project URL (`https://….supabase.co`), never localhost |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes | **Anon** (publishable) key only |
| `EXPO_PUBLIC_WEB_ORIGIN` | yes | Public site origin for loan/activation QR URLs (no trailing slash), e.g. `https://your-app.vercel.app` |
| `EXPO_PUBLIC_AUTH_MODE` | no | `pin` (default) or `otp` when SMS OTP is ready |
| `EXPO_PUBLIC_ENABLE_ANDROID_BLUR` | no | Native chrome only; harmless if unset on web |

Never set a Supabase **service-role** key (or any other secret) as
`EXPO_PUBLIC_*` — those values are embedded in the public JS bundle. Service
role belongs only in Edge Function secrets (`npx supabase secrets set …`).

After you have a Vercel domain, add it in Supabase Dashboard → Authentication →
URL Configuration (Site URL and Redirect URLs), or auth redirects will fail.

## Tests

```bash
npx supabase test db   # pgTAP against local Postgres
npm test               # Jest (jest-expo)
npx tsc --noEmit       # TypeScript
```

Interest, redemption, RLS, and `create_loan` are asserted in SQL. Jest covers
money/phone helpers, storage path allowlisting, UI units, and bilingual screen
snapshots. Do not add money or weight arithmetic in JavaScript except input
parsing and display formatting.

## Maestro E2E

Flows live in [`e2e/`](e2e/). They target the **local seeded** database and a
native dev build (not Expo Go).

1. Install [Maestro](https://maestro.mobile.dev/getting-started/installing-maestro).
2. `npx supabase start && npx supabase db reset`
3. Copy `.env.example` → `.env` from `npx supabase status`, then
   `npx expo run:android` or `npx expo run:ios` (app id Android
   `com.girvisewa.app`).
4. With the app installed on an emulator/simulator:

```bash
npm run e2e:maestro              # all flows under e2e/
npm run e2e:maestro:owner        # payment → redeem → print (SEED-ACTIVE)
npm run e2e:maestro:staff        # Insights / redeem / renew / archive absent
npm run e2e:maestro:customer     # list + Hindi language toggle
npm run e2e:maestro:archive      # archive SEED-OVERDUE hides it from customer
```

Accounts (OTP `123456`): owner `9000000001`, staff `9000000002`, customer
`9000000003`. Reset the DB between destructive flows (redeem / archive).

Customer detail and balance are **not** covered here (Prompt 6 declined). Jest
snapshots catch Hindi string layout drift in the component tree; Maestro is the
pass for “no clipped text” on device.

## Admin vs customer

| Role | App |
| --- | --- |
| `owner`, `staff` | `/(admin)/dashboard` — all loans, scanner, redeem/renew |
| `retail_customer`, `merchant` | `/(customer)/dashboard` — own receipts only |

Row Level Security in the migrations is the isolation boundary, not the
client `.eq('customer_id', …)` filter.

Walk-in customers are created at the counter by
`supabase/functions/create-walkin-customer` (service role). They sign in later
with OTP on the same number.

## Money, rates, weights

See `docs/RULES.md`. Amounts are integer paise, rates integer basis points,
weights integer milligrams, shop calendar `Asia/Kolkata`.
