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

Copy `.env.example` to `.env` and fill the **anon** URL and key from
`npx supabase status`.

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
money/phone helpers, storage path allowlisting, and UI units. Do not add money
or weight arithmetic in JavaScript except input parsing and display formatting.

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
