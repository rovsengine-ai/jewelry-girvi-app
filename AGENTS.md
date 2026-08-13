# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Cursor Cloud specific instructions

This is a single Expo (SDK ~57) + React Native + TypeScript app (`jewelry-girvi-app`, a
jewelry pawn-loan / "girvi" shop) backed by **Supabase** (Postgres, phone-OTP auth, Storage).
Package manager is **npm** (`package-lock.json`). The startup update script runs `npm install`.

### Commands (see `package.json` scripts)
- Run (Metro dev server): `npx expo start` — primary target is iOS/Android (`npm run ios` / `npm run android`).
- Web: `npx expo start --web` (port 8081). See the web SSR gotcha below.
- Lint: `npm run lint` (`expo lint`). The repo currently has **pre-existing** lint errors/warnings
  in app source (react-hooks / react-compiler rules); these are not caused by env setup.
- Tests: none configured (no test runner in the repo).
- `eslint` + `eslint-config-expo` + `eslint.config.js` were added so `npm run lint` runs non-interactively.

### Environment variables
Copy `.env.example` → `.env`. Required: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
(a Supabase `sb_publishable_...` key works as the anon key). Optional: `EXPO_PUBLIC_MOONSHOT_API_KEY`
(receipt OCR only). `.env` is gitignored. Expo only exposes vars prefixed `EXPO_PUBLIC_`.

### GOTCHA — web dev server crashes under SSR
`app.json` sets `web.output: "static"`, so `expo start --web` **server-renders in Node and crashes**:
`src/lib/supabase.ts` builds the Supabase client at import, and its auth init calls `expo-secure-store`,
whose native module does not exist server-side (`ExpoSecureStore.default.getValueWithKeyAsync is not a
function`). This is SSR/Node-only; a real browser/device has `localStorage`/native storage and is fine.
To run/verify the app on web in this headless VM, **temporarily** set `web.output` to `"single"` (client-only
SPA) — do not commit that change. Otherwise test on a device/emulator.

### GOTCHA — admin dashboard runtime error (pre-existing app bug)
After login, `src/app/(admin)/dashboard.tsx` throws an Expo Router SDK 57 error
("passing an array of styles to a child of `<Slot>`") from its `<Link asChild><Pressable style={[...]}>`.
The **customer** dashboard renders fine. Not a setup issue; noted for future fix.

### Running a fully local Supabase backend (for end-to-end testing)
There is no in-repo backend. For local end-to-end testing you can run the Supabase stack with Docker
+ the Supabase CLI (`supabase init` / `supabase start`), then apply `database/schema.sql` to the
Postgres container and point `.env` at `http://127.0.0.1:54321`. Phone-OTP login needs no real SMS
provider if you enable a test-OTP map in `supabase/config.toml` (`[auth.sms.test_otp]`) and enable a
provider block (`[auth.sms.twilio] enabled = true` with dummy creds — test-OTP numbers bypass the
provider). Docker/Supabase-CLI are not part of the update script; install them only when you need the
local backend.
