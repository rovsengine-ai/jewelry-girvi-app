# Store release — Play Store and App Store

Store binaries cannot use Docker on your Mac. They must talk to a **hosted
Supabase project** so owner, staff, and customer phones share the same live
data.

This file is the runbook. Apple and Google still have to approve the first
listing; that part cannot be finished from this repo alone.

Docs used while writing this:

- [Create an EAS Build](https://docs.expo.dev/build/setup/)
- [Submit to app stores](https://docs.expo.dev/deploy/submit-to-app-stores/)
- [EAS environment variables](https://docs.expo.dev/eas/environment-variables/)
- [EAS Update](https://docs.expo.dev/eas-update/getting-started/)
- [eas.json](https://docs.expo.dev/eas/json/)

## What “live and syncing” means here

| Layer | What ships |
| --- | --- |
| Data | Hosted Postgres + RLS. Every signed-in device reads/writes the same shop book. |
| Auth | Real SMS OTP on the hosted project (not the local `123456` test map). |
| Files | Private Storage buckets, signed URLs only, paths namespaced by user id. |
| OCR / walk-in | Edge Functions deployed to the hosted project with server secrets. |
| Lists | Loan lists refetch on tab focus, pull-to-refresh, and when the app returns to the foreground. |
| JS fixes | EAS Update on the `production` channel after a store binary is installed. |

Local README test phones (`9000000001` / `123456`) **must not** exist on hosted.

## 1. Hosted Supabase (do this before any store build)

1. Create or open the project in the [Supabase dashboard](https://supabase.com/dashboard).
2. From this repo (logged in):

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase functions deploy extract-receipt
npx supabase functions deploy create-walkin-customer
npx supabase functions deploy refresh-gold-rate
npx supabase secrets set GEMINI_API_KEY=...
# optional: MOONSHOT_API_KEY, GOLDAPI_API_KEY, …
```

3. Auth → Providers → **Phone**: enable Phone. Attach a real SMS provider
   (Twilio, MessageBird, Textlocal, or Vonage). Do **not** copy
   `[auth.sms.test_otp]` from `supabase/config.toml` to hosted.
4. Confirm Storage bucket `receipts` (or whatever the migrations created) is
   **private**.
5. Copy the **anon / publishable** URL and key (never the service role) into
   EAS, next section.

## 2. EAS secrets for store builds

Production `eas.json` uses `"environment": "production"`. Set:

```bash
npx eas-cli@latest login
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR-PROJECT.supabase.co --environment production --visibility plaintext
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR_ANON_KEY --environment production --visibility sensitive
npx eas-cli@latest env:set --name EXPO_PUBLIC_ENABLE_ANDROID_BLUR --value true --environment production --visibility plaintext
```

Use the same names for `preview` if you want a TestFlight / internal APK on
hosted data.

A production binary that still points at `http://127.0.0.1:54321` will refuse
to start (`src/lib/hosted-supabase.ts`).

## 3. Accounts you must have

- [Expo](https://expo.dev/signup) — EAS Build / Submit / Update (project id
  `03e59023-9a4a-468c-8054-76a65237f8f7` is already in `app.json`).
- [Apple Developer Program](https://developer.apple.com/programs) — paid
  membership. Team id in `app.json` is `U5RDM8MM7T`.
- [Google Play Console](https://play.google.com/console) — one-time registration.
  First Play upload needs a [Google service account key](https://docs.expo.dev/submit/android/)
  linked in EAS credentials; do not commit the JSON.

Bundle ids in this repo (change **before** the first store listing if you want
a cleaner name; you cannot rename after Google/Apple create the apps):

- iOS `com.anonymous.jewelry-girvi-app`
- Android `com.anonymous.jewelrygirviapp`

## 4. Build store binaries

```bash
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production
```

Android produces an **.aab** for Play. iOS produces an **.ipa** for
App Store Connect / TestFlight.

## 5. Submit

```bash
npx eas-cli@latest submit --platform android --latest --profile production
npx eas-cli@latest submit --platform ios --latest --profile production
```

`eas.json` sends Android to the **internal** track as a **draft** so nothing
goes public until you promote it in Play Console.

iOS lands in **TestFlight**. Production App Store release is a separate
App Store Connect step (screenshots, privacy, age rating, then Submit for
Review).

## 6. Store listing (you fill these in the consoles)

Required by both stores:

- Privacy policy URL (host [`docs/privacy-policy.md`](privacy-policy.md) on a
  public HTTPS page).
- Support URL / email.
- Screenshots (phone, both languages if you claim EN+HI).
- Data-safety / App Privacy answers: account (phone), photos you choose to
  upload, approximate location **not** collected, no advertising ID.

Play: complete Data safety, content rating, target audience, store listing.
Apple: encryption question is covered by `ITSAppUsesNonExemptEncryption: false`
in `app.json` (standard HTTPS only). Confirm that in App Store Connect.

## 7. After the first store install

JS-only fixes (copy, layout, OCR prompt) can ship without a new native binary:

```bash
npx eas-cli@latest update --channel production --environment production --message "describe the fix"
```

Rebuild and resubmit when you add native modules, change `app.json` plugins,
or bump the Expo SDK.

## 8. Smoke test on real phones (hosted)

Sign in with a **real** Indian mobile (OTP via SMS). As owner: add walk-in
customer, pledge + extra item, signature, print, payment, redeem. On a second
phone as that customer: confirm only their receipts appear after the app
returns to the foreground.
