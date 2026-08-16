# Girvi shopfront UI — analysis + one-shot Cursor prompt

Written 2026-08-16 against the six reference screenshots (Home, Customers,
Transactions, Account, Loan detail, Customer profile) and the current tree
(`warmPaper` live palette, ListRow / FAB / ScreenHeader already in place).

Paste **only** the fenced prompt in section 3 into a new Cursor turn. Do not
paste this whole file.

---

## 1. What the reference actually is

This is a **shop-counter fintech** look (Technicul Girvi), not a bank app and
not WhatsApp. Six screens share one language:

| Trait | What to copy |
| --- | --- |
| Chrome | Solid deep royal purple header + matching solid purple tab bar. White icons and titles. Gold/amber tick for the active tab. |
| Page | Cool off-white (`#F4F5F8` range), not cream. White cards and white list rows sit on that page. |
| Money | Indian Rupee, grouped (`₹ 1,50,000`). Green = received / interest / market value. Coral = pending / principal remaining. Gold pill = hero total. |
| Rows | 48px circular avatar, **name** (bold) + **meta** (date or phone, grey), trailing **amount** + coloured caption. Hairline divider. Chevron if it navigates. |
| Search | Pill field, sunken grey, leading magnifier, no border. |
| Buttons | Purple pill for primary (`+ Add Loan`, `+ Add Transaction`). Circular purple FAB with white `+`. |
| Cards | 12–16px radius, very light shadow, 16px inner padding. Loan ID as a small orange/teal badge, not a status pill. |
| Accordions | “Total items” / “View items” with a chevron that rotates. |

### Screen → this repo (copy the look, keep our IA)

| Reference | This app | What to restyle |
| --- | --- | --- |
| Home (GIRVI + gold total + two summary cards + recent tx + FAB) | `(admin)/(tabs)/insights.tsx` (owner) + a compact summary strip on `(admin)/(tabs)/loans.tsx` | Purple chrome, gold hero, two white tiles. **Do not invent Received/Pending.** Map hero → `shop_rate_yield` totals already on Insights. Recent list → Alerts or skip; do not add a fake transaction feed. |
| Customers (search + avatar rows + chevron) | `(admin)/(tabs)/loans.tsx` | This **is** the customer book. Keep search, chips, swipe Call/Archive. Make rows match the Customers list. **Do not add a Customers tab.** |
| Transactions | `(admin)/loan/[id]/index.tsx` payments block | Same row recipe: avatar, name, date, amount colour by payment kind (interest vs principal) using **existing payment rows**, not a new table. |
| Account | `(admin)/(tabs)/settings.tsx` | Shop card on top (name, phone, owner from `profile`), then grouped menu rows with leading outline icon + chevron. **Do not add Subscription / SMS remaining / Buy.** |
| Loan detail | `(admin)/loan/[id]/index.tsx` | Orange serial badge, 4-up terms grid, market-value bar (frozen valuation, labelled not-IBJA), 3×3 total/paid/balance table, items accordion, transactions + purple add-payment. |
| Customer profile | No dedicated screen. Closest: loan detail header + KYC `kyc/[customerId].tsx` | Add a **collapsible customer header card** on loan detail (avatar, name, phone, call/chat icons that already exist as Linking). Do **not** build a new Profile route. Header icons: phone (existing `tel:`), omit WhatsApp send. |

### What not to copy from the mock

- Tab labels Home / Customers / Dues / Account — ours stay Loans / Alerts / Insights / Settings.
- Photo avatars from the internet — keep `AvatarMonogram` (deterministic initials). Use a signed receipt/item photo only where we already have one (loan items).
- SMS remaining, subscription expiry, Buy pill, WhatsApp blast, printer as a new feature — printer already exists on loan detail; keep it.
- Inter / Poppins / Google Fonts — this app is bilingual EN + हिं. System UI fonts only.
- Calculating Received/Pending/Market Value in JS. Format SQL figures only.
- Customer-app payment history or balances. `(customer)/` stays receipts + notices.

---

## 2. Current gap (why a restyle is still needed)

The last polish pass built the **shell** (ListRow, tonal Badge, FAB, search pill,
MOTION budget, glass tab bar) on a **warm cream / maroon** palette. The
reference is the opposite chrome: **solid purple, gold hero, cool grey page,
green/coral money**. Headers are still glass, tab bar is still translucent,
Insights is two plain cards, loan detail is a long stack, Settings has no shop
identity card.

Keep the primitives. Change the **tokens and chrome**. Do not throw ListRow away.

---

## 3. The prompt — paste this whole block into Cursor as one turn

```
Before writing any code:
1. Read AGENTS.md, .cursorrules, .cursor/rules/projet.mdc, docs/RULES.md.
2. For every Expo / RN API you touch, fetch the versioned page at
   https://docs.expo.dev/versions/v57.0.0/ and cite the URL in a comment.
   If you cannot fetch it, stop. Do not write from memory.
3. UI kit is @expo/ui + expo-glass-effect + expo-symbols. Do NOT install
   react-native-paper, NativeWind, Tailwind, or any other UI framework.
4. Do not add a custom webfont. Fonts stay system-ui / Roboto / Noto
   (Devanagari). expo-font is already a dep; do not load Inter/Poppins.

TASK: restyle this jewelry girvi app to match the attached Girvi shopfront
UI (solid royal-purple chrome, gold hero pill, cool off-white page, white
cards, green/coral money, pill search, circular FAB, avatar list rows,
accordion loan items). Presentation only.

WHY: the shell primitives exist (ListRow, AvatarMonogram, Badge, FAB,
SearchField, ScreenHeader, PressableScale, MOTION) but they still render
the warmPaper cream/maroon glass look. The target is the purple shopfront
in the six reference screenshots.

=== HARD CONSTRAINTS (any violation fails the task) ===
- Do not change business logic, RPCs, SQL, RLS, role gates, or navigation
  structure (no new tabs, no new Profile route, no customer-side balances).
- Money INTEGER PAISE, rates INTEGER BPS, weights INTEGER MILLIGRAMS.
  JavaScript formats; SQL calculates. Never invent Received/Pending/Market
  Value in the client.
- Every colour, spacing, radius, shadow, type style comes from
  src/constants/theme.ts. No hex and no magic numbers in screens. New tokens
  go into Palette + ALL three PaletteDirections, light AND dark, plus live
  Colors.
- No user-visible English literal. Every string through t(). Do not weaken
  src/app/__tests__/no-hardcoded-english-test.ts.
- Do not add SMS/WhatsApp sending, subscriptions, or “SMS remaining”.
- Gold figures that come from gold_rates stay labelled not-IBJA.
- Never put glass/blur behind MoneyText, a weight, a rate, or a date.
- Keep MinTouchTarget 44, useReduceMotion, reduce-transparency fallback,
  accessibilityRole/State/Label, and every existing testID.
- MoneyText keeps fontVariant ['tabular-nums','lining-nums'].
- Contrast: body ≥ 4.5:1, large text and pills ≥ 3:1, light AND dark.
- React Compiler is ON. Do not add new useMemo/useCallback unless a screen
  already has them; do not “clean up” existing ones as a drive-by.
- Motion budget stays in src/lib/motion.ts. Nothing longer than 300ms.
  Timing, not decoration springs (PressableScale may keep its 100ms spring).
- iOS and Android both ship. If you use expo-glass-effect, state the Android
  fallback (for this restyle, chrome is SOLID primary — Android is the same
  solid fill, not a fake blur).
- Do not run a formatter across untouched files. Keep the diff reviewable.

=== 0. MAP REFERENCE → EXISTING SCREENS (do not invent IA) ===
- Home mock            → Insights tab (owner). Staff never see it (href:null
                         already). Optionally a compact hero on Loans that
                         only shows figures already loaded for that list
                         (loan count of the filtered set is OK; do not RPC
                         a new aggregate).
- Customers mock       → Admin Loans tab list + SearchField.
- Transactions mock    → Loan detail payments section.
- Account mock         → Admin Settings tab.
- Loan mock            → src/app/(admin)/loan/[id]/index.tsx.
- Profile mock         → collapsible customer header ON loan detail, plus
                         existing phone Linking. No new route. No WhatsApp.

Customer app (src/app/(customer)/): restyle chrome/type/rows to the same
tokens so it does not look like a different product. Do not add money,
due dates, or payment history on the customer side.

=== 1. PALETTE: make shopfront purple the LIVE Colors ===
Add a fourth PaletteDirection id `girviShopfront` (or replace the live
Colors mapping — do not delete warmPaper/coolLedger/shopfrontContrast;
they stay as reference). Point `export const Colors` at girviShopfront.

Light (target the mock; tweak only to hit contrast):
  primary        #4A148C   header, tab bar, FAB, primary buttons
  onPrimary      #FFFFFF
  gold           #F5C400   hero total pill, active-tab indicator
  onGold         #1A1228   text on the gold pill
  background / surface / surfaceSunken  cool off-white ~#F4F5F8
  elevated       #FFFFFF   cards and list rows
  text           #1A1228
  textSecondary  #5C5670
  success        #1B8A5A   received, interest paid, market value
  danger         #D64545   pending, principal remaining
  warning        #E67E22   loan-id badge, phone accent
  plus existing status* / tint* / glass* tokens derived from these hues

Dark: deep purple-ink background (~#160C24), elevated #2A1840, primary
lightened so white type still contrasts, gold stays gold, success/danger
lightened to ≥3:1 on elevated.

Add tokens if missing (all palettes, both schemes):
  gold, onGold
  chrome          = primary (solid header/tab fill)
  onChrome        = onPrimary
  accentWarning   = warning (loan-id chip)

Comment every hex and every alpha. Measure and report contrast.

Do NOT keep cream as the live page colour.

=== 2. TYPE AND FONTS ===
Keep Fonts = system (iOS system-ui / ui-rounded for pills if you want,
Android normal → Roboto). No custom display face.

Tune TypeScale jobs to the mock, keep existing keys:
  overline     11/16 600 +0.5 uppercase   section labels
  caption      12/16 500                  payment-type under amount
  label        13/18 600                  dates, phone, serial
  body         16/24 500                  body
  bodyLarge    17/22 600                  customer name (mock is bold)
  money        18/24 700 tabular          row amount (mock ~16–18 bold)
  title        20/26 600                  nav titles (white on chrome)
  moneyLarge   28/34 700 tabular          gold hero / detail balance
  display      32/40 600                  empty-state only

ThemedText type="title" is currently 48px — that is a splash size, NOT a
nav title. Do not use it in ScreenHeader. ScreenHeader uses TypeScale.title.

Hindi: no textTransform on Devanagari. overline already notes this; keep it.
Long Hindi labels must wrap inside chips/rows; do not clip names.

=== 3. CHROME: solid purple, not glass headers ===
ScreenHeader:
- Fill = colors.chrome (solid). White title (onChrome). Language segmented
  pill stays trailing; selected segment uses gold or tintPrimary on chrome
  — verify contrast. Keep testIDs language-en / language-hi.
- Optional leading back slot for stack screens (use existing router.back).
- Optional trailing icon slot (print, more) already needed on loan detail.
- Height: safe-area top + Glass.headerHeight. Collapse title to label on
  scroll where that already exists.

Tab bar (glass-tab-bar-options.tsx):
- Solid chrome background, not translucent GlassSurface.
- Inactive: onChrome at ~0.7 opacity (add onChromeMuted token if needed).
- Active: onChrome + a 3px gold bar sitting on the TOP edge of the tab item
  (Customers mock) with withTiming 150ms, ReduceMotion.System. Reuse the
  LanguageChips sliding-indicator pattern; do not invent a new animation lib.
- Android: same solid bar. No dimezis blur.

FAB: keep Fab. Icon for scan stays camera on Loans. PressableScale already
wired. Shadow from Elevation.fab. Sit above tabBarOccupiedHeight.

=== 4. LIST ROW RECIPE (Customers + Transactions + recent) ===
ListRow is already the primitive. Restyle tone default for book lists to
elevated (white) on surfaceSunken page.

AdminLoanRow composition (keep swipe Call/Archive, owner gate, testIDs,
rowEntering):
  leading  AvatarMonogram 48
  content  name bodyLarge 1-line
           serial · item  label textSecondary
  trailing MoneyText
           Badge status (tonal pill)

Payment rows on loan detail:
  trailing amount uses success if the payment allocated to interest,
  danger/primary if principal — ONLY if that split is already on the
  payment row type. If the row is a single amount, keep one colour and
  label t('payments.kind') from existing fields. Do not compute allocation
  in JS.

SearchField: already a pill. Sit it on the sunken page, 16px inset.

FilterChip: selected = gold or tintPrimary; unselected = elevated. 44pt.

=== 5. INSIGHTS = HOME DASHBOARD ===
Owner only. Use shop_rate_yield data already fetched:
- Purple header with shop wordmark: t('app.name') + Hindi already in i18n
  if present; otherwise add keys. Optional diamond via expo-symbols
  (no emoji).
- Gold rounded pill with MoneyText large = sum of principal_paise
  (active capital). Info icon allowed; do not put money on glass.
- Two white Cards in a row:
    left  capital + 30-day yield (existing labels)
    right loan_count from yield rows (sum). Do not invent customer count
          unless a count is already in the payload.
- Yield-by-rate stays a grouped ListRow list under SectionLabel.
- Do not add a fake “recent transactions” feed.

=== 6. SETTINGS = ACCOUNT ===
Top: white Card
  leading  TintedIconWell / shop icon (expo-symbols storefront)
  content  profile.full_name as shop/owner line, phone in warning colour,
           role label
  trailing existing edit only if an edit path exists; otherwise omit
Then SettingsGroup rows: leading TintedIconWell + label + chevron.
Sign out in a final danger group.
Do not add subscription or SMS tiles.

=== 7. LOAN DETAIL = LOAN MOCK ===
Keep every RPC, print, redeem/renew/terms/archive owner gate, payment form.

Layout (tokens only):
1. Collapsible customer header Card: AvatarMonogram, name, phone (warning),
   chevron rotates 180deg on expand (Reanimated withTiming ≤220ms).
   Expanded: existing totals from fetchLoanBalances (total/principal/interest)
   as a 3-up labelled row. Header icons that already work: tel: call.
   Do not add WhatsApp.
2. Terms Card: warning-coloured serial badge, date range with calendar
   symbol, 4-up grid (principal, interest model, rate via formatBpsAsPercent,
   tenure from simple_period_days). Labels overline/label, values bodyBold.
3. Market value bar: tintSuccess wash, MoneyText from SUM of item
   valuation_paise that are non-null. Caption must include not-IBJA.
   If all valuations null, show the existing empty copy, not ₹0 pretending
   to be a quote.
4. 3-column summary from balances: row1 current, row2 paid (success),
   row3 remaining (danger). IPM only if a period-interest figure is already
   returned — do not divide in JS.
5. Items accordion: header “Total items : N”, chevron, expand to item
   cards (thumbnail from signed URL if present, else metal icon). Keep
   position order. Three-dot menu only if actions already exist.
6. Transactions: SectionLabel + existing add-payment control restyled as
   purple pill “+ Add Transaction” (same handler). Date grouping if dates
   are already on rows.

Stack screens: slide_from_right 300ms via existing stackMotionOptions.

=== 8. MOTION (extend src/lib/motion.ts, do not scatter durations) ===
Keep: stackDurationMs 300, tabFadeMs 150, rowEnterMs 150, rowStaggerMs 18,
rowEnterCap 8, pressMs 100, pressScale 0.98, shimmerMs 900.

Add:
  accordionMs 220
  chevronRotateDeg 180
  tabIndicatorMs 150  (alias of tabFadeMs is fine)

Rules:
- Accordion height: Reanimated withTiming, not LayoutAnimation.
- Chevron: rotate interpolate, ReduceMotion.System → snap with no anim.
- List enter: existing rowEntering only. Do not stagger the whole page.
- Press: PressableScale everywhere for pills/FAB/menu rows.
- Tab indicator: translateX withTiming.
- Respect useReduceMotion on every new animation.
- No Lottie, no Moti, no extra animation deps.

Haptics: keep selectionAsync on press-in (already in PressableScale/ListRow).

=== 9. ICONS ===
expo-symbols on iOS, Material-style Android names via existing AppIcon /
TabBarSymbol. No emoji. Every decorative icon aria-hidden or labelled.

=== 10. ORDER OF WORK (keep tsc + jest green at each step) ===
1. theme.ts tokens + Colors → girviShopfront + palette-preview if it lists
   directions.
2. Chrome: ScreenHeader, glass-tab-bar-options, LanguageChips on chrome.
3. Primitives: Card shadow, Badge, FilterChip, SearchField, Fab, ListRow
   elevated-on-sunken.
4. Insights dashboard.
5. Loans tab (list + search + chips + FAB).
6. Settings account card + groups.
7. Loan detail (header, terms, items accordion, payments).
8. Remaining admin stack screens (alerts, archive, redeem, renew, terms,
   default, scanner, kyc) — same header/type, no logic changes.
9. Customer tabs: same chrome/tokens only.

=== WHEN DONE ===
- Re-record src/app/__tests__/__snapshots__/bilingual-screen-snapshots-test.tsx.snap
  if snapshots fail. Do not delete the test. Both languages still asserted.
- Update component tests that assert colours if they pin old cream hex.
- Run: npx tsc --noEmit && npm test
- Do not run supabase test db unless you touched SQL (you should not).
- Report:
  • every new token and why
  • contrast ratios (body, gold-on-purple, success/danger on white, onChrome)
    light and dark
  • Android fallback for chrome
  • any mock feature you refused because it needed new data
  • anything in this prompt you did not do

Cite Expo docs URLs you fetched. Keep the diff reviewable.
```

---

## 4. Check it yourself on device

1. Header and tab bar are the **same** solid purple. If the tab bar is still
   frosted cream, chrome did not land.
2. Gold hero on Insights is tabular ₹ and does not sit on blur.
3. Switch to हिं: names wrap, chips do not uppercase Devanagari, language
   pill still works on purple.
4. Reduce Motion: accordion snaps, tab gold bar jumps, list does not stagger.
5. Staff login: Insights tab gone, redeem/renew/archive still absent.
6. Android: solid purple bar, 44pt chips, FAB clear of the nav.
