# Girvi Shop

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

```bash
npx supabase secrets set MOONSHOT_API_KEY=sk-...   # OCR, if used
```

There is no live gold feed. Pledge valuation freezes from manual `gold_rates`
rows (seed / `set_manual_gold_rate`); figures stay labelled not IBJA.

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
   `com.anonymous.jewelrygirviapp`).
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
