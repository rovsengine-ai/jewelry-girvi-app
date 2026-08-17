# Privacy policy — Girvi Shop

This is a draft you can host at a public HTTPS URL for Play Console and
App Store Connect. It describes what this app actually does. It is not legal
advice. Have counsel review it before you publish.

**App:** Girvi Shop  
**Last updated:** 18 August 2026

## Who we are

Girvi Shop is a jewellery pawn-broking (girvi) counter app. Shop staff record
loans and receipts. Borrowers can sign in to see **their own** receipts only.

## What we collect

- Mobile number, used to send a one-time password and to identify the account.
- Name and address you (or the shop) enter for a customer profile.
- Loan details: serial number, pledged item descriptions, weights, amounts,
  dates, signatures, and photos of receipts or ornaments that you attach.
- Optional KYC: we store at most the last four characters of an ID number.
  The app is built so Aadhaar images are not stored.

We do not sell this data. We do not use advertising identifiers.

## Where it lives

Account and loan data are stored in our hosted database (Supabase). Receipt
and signature images are stored in a private bucket and loaded with short-lived
signed links. Access is enforced in the database (row-level security): a
customer cannot read another customer’s loans.

## Why we need it

- Sign you in with phone OTP.
- Issue, print, and redeem girvi at the counter.
- Let a borrower view their own receipts on their phone.

## Sharing

We use infrastructure providers (hosting, SMS for OTP, optional OCR) only to
run the app. We do not share customer loan books with other shops or
advertisers.

## Retention

Shop records stay until the shop owner archives or deletes them according to
their own record-keeping. You can ask the shop to correct or remove your
profile; we will also honour a deletion request sent to the support address
on the store listing.

## Contact

Put your shop’s support email and postal address here before you publish this
page.
