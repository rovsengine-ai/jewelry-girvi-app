# GIRVI SEWA — Google Play listing & launch checklist

Use this copy in Play Console. It follows India pawn-shop **record-keeping**
positioning (not personal-loan / DLA wording).

## App identity

| Field | Value |
| --- | --- |
| App name | **GIRVI SEWA** |
| Package | `com.girvisewa.app` |
| Default language | English (India) + Hindi in-app |
| Privacy policy URL | `https://girvi-sewa.vercel.app/privacy` |
| Delete account URL | `https://girvi-sewa.vercel.app/delete-account` |
| Website | `https://girvi-sewa.vercel.app` |

## Short description (≤80 chars)

Shop ledger for pawn-broking records, receipts, and customer receipt viewing.

## Full description

GIRVI SEWA is record-keeping software for a pawn-broking shop.

Shop owner and staff can keep pledge records, scan paper receipts, store item
photos, view due amounts with the shop calculator, and share a receipt QR so
customers can view their own records after signing in.

Customers use the same app to view their own receipts and pledge status only.
Money moves at the counter — this app does not collect repayments online and
does not let customers apply for credit inside the app.

Features
• Owner and staff shop book (PIN sign-in)
• Customer receipt viewer (PIN sign-in)
• Pledge records, item photos, person verification photos
• Interest / payoff calculator for shop use
• English and Hindi

## Login entry (web + app)

• Default login: customers
• Top-right **shop** icon on the login screen: owner / staff PIN sign-in

## Store listing — do not use

loan, gold loan, girvi finance, credit, EMI, interest rate (in listing text /
screenshot captions). Prefer: pledge, pawn shop, record keeping, receipt,
ledger, shop book.

---

## Launch checklist (Play Console)

### A. One-time account

- [x] Google Play Developer account created / verified
- [ ] Create app: **GIRVI SEWA**, package `com.girvisewa.app`
- [ ] App category: **Business** (or Productivity) — not Finance/lending
- [ ] Contact email + privacy policy URL above

### B. Store listing assets

- [ ] Short + full description (paste from this file)
- [ ] App icon 512×512 (from Play Console “App icon”)
- [ ] Feature graphic 1024×500
- [ ] Phone screenshots (min 2): login, shop ledger, receipt, calculator —
  **no banned words on image text**
- [ ] Optional: Hindi listing if you want a second locale

### C. App content / declarations (answer honestly)

- [ ] Privacy policy URL set
- [ ] Data safety: phone, photos, account data as collected; not sold
- [ ] **Financial features:** this is shop record-keeping — **no** in-app
  repayment collection, **no** customer apply-for-credit. Do not declare as a
  lending / DLA product unless you later add those features.
- [ ] Photos / camera: for receipts, pledged items, ID captured by shop staff
- [ ] Target audience: 18+
- [ ] Ads: none (unless you add them)

### D. Release binary

Production profile builds an **AAB** (required for new Play apps):

```bash
npx eas-cli build --platform android --profile production
# when AAB is ready:
npx eas-cli submit --platform android --profile production
```

`eas.json` submit profile uploads to **internal** track as **draft** so you
finish listing/setup in Console before testers see it.

Local alternative after `android/` exists:

```bash
cd android && ./gradlew bundleRelease
# output: android/app/build/outputs/bundle/release/app-release.aab
```

- [ ] Upload AAB to **Internal testing** first
- [ ] Add yourself as internal tester; install from Play
- [ ] Promote to Closed / Production when ready

### E. After first upload — App Links

`https://girvi-sewa.vercel.app/.well-known/assetlinks.json` still has a
placeholder SHA-256. After Play App Signing is enabled:

1. Play Console → App integrity → App signing key certificate → SHA-256
2. Replace `REPLACE_WITH_RELEASE_SHA256_FINGERPRINT` in
   `public/.well-known/assetlinks.json`
3. Redeploy the website
4. Optionally also include the **upload key** SHA-256 if testing sideloads

### F. Optional polish

- [ ] Set `ANDROID_NO_APP_FALLBACK_URL` in `api/lib/qr-redirect.ts` to the Play
  Store listing URL once published
- [ ] Confirm Supabase Auth redirect allow-list includes `girvi-sewa.vercel.app`
