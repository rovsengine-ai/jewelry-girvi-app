# One-shot Cursor prompt — visual redesign

The engineering under the UI is fine. What looks bad is a specific, nameable set
of design-language mistakes, listed below so Cursor fixes causes and not vibes.

**Diagnosis (why it currently looks like a wireframe):**

1. **Everything is a bordered `Card`.** Every loan row, every settings block,
   every notice is `Card` — 1px border + radius + shadow. A list of 20 cards
   reads as 20 boxes of equal importance. Real list UIs (WhatsApp, Messages)
   use flat rows with a hairline divider and no border at all.
2. **`warmPaper` has almost no surface separation.** `background #F4EFE6` vs
   `elevated #FFFBF3` is a ~3% luminance delta, so `border #D4CBBA` is doing
   100% of the separation work. That is exactly what makes a screen look
   unfinished.
3. **No leading visual anchor.** Rows are four stacked text lines with nothing
   on the left. Lists scan fast because of a left-hand avatar/thumbnail.
4. **Flat hierarchy inside the row.** Serial, name, phone, item and money are
   all similar size and weight, so the eye has no entry point.
5. **Compressed type ramp** — 12 → 16 → 22 with only 500/700 weights, and
   `small` used for three different jobs.
6. **Uniform spacing.** `padding: three, gap: two` everywhere, so nothing is
   visually grouped.
7. **The EN/हिं chips sit next to the title on every single header**, two
   bordered buttons competing with the screen name.
8. **No FAB.** The primary action (scan a pledge) is a normal button in a row
   of buttons.
9. **Bare loading/empty states** — a centred `ActivityIndicator` on a blank view.
10. **`Badge` is a plain rectangle**, no tonal background, no icon.

---

## The prompt — paste this whole block into Cursor as one turn

```
Before writing code, read AGENTS.md, .cursorrules, docs/RULES.md and
docs/CURSOR-FRONTEND-BRIEF.md. Check the exact versioned Expo docs at
https://docs.expo.dev/versions/v57.0.0/ before using any Expo API.

TASK: a visual redesign of this app's UI. Do not change any business logic,
service call, SQL call, role gate, RLS assumption or navigation structure. This
is a presentation-layer change only. If a fix seems to require a logic change,
stop and tell me instead of doing it.

WHY: the UI currently reads as an unstyled wireframe. The causes are specific
and listed below. Fix the causes, not the symptoms.

=== HARD CONSTRAINTS (violating any of these fails the task) ===
- Money is INTEGER PAISE, rates INTEGER BPS, weights INTEGER MILLIGRAMS. All
  arithmetic stays in SQL. You are formatting, not calculating.
- Every colour, spacing, radius, shadow and type style comes from
  src/constants/theme.ts. No new hex, no magic numbers, in any screen or
  component. If you need a new token, ADD IT TO theme.ts and to all four
  palettes (Colors + all three PaletteDirections), light and dark.
- No user-visible English literal anywhere. Every string goes through t().
  src/app/__tests__/no-hardcoded-english-test.ts must stay green and must NOT
  be weakened, skipped, or have files excluded from it.
- Do NOT touch src/app/(customer)/. The customer side's minimal scope is a
  deliberate product decision. You may restyle customer screens with the new
  primitives, but you may NOT add a balance, a payment history, or a customer
  loan-detail screen.
- Never put glass, blur or any translucent surface behind MoneyText, a weight,
  a rate or a date. Glass stays on chrome only (tab bar, header, sheets).
- Keep every accessibility behaviour that exists: MinTouchTarget 44,
  useReduceMotion, reduce-transparency fallback in GlassSurface,
  accessibilityRole / accessibilityState / accessibilityLabel on every control,
  and testID on everything that has one today. Do not drop a testID.
- Keep tabular figures: MoneyText's fontVariant ['tabular-nums','lining-nums']
  stays, and any new numeric style gets it too.
- Contrast: body text ≥ 4.5:1, large text and status pills ≥ 3:1, in BOTH light
  and dark, in every palette you touch. State the ratios you achieved.

=== 1. FIX THE PALETTE'S SURFACE SEPARATION ===
In theme.ts, for warmPaper (the live palette) and the other two directions:
- Widen the gap between `background` and `elevated` so a surface is legible
  WITHOUT a border. Keep the warm cream character; do not turn it grey or blue.
- Add these tokens to the Palette type and to every palette, light and dark:
    divider          - hairline for flat list rows, much lighter than `border`
    surfaceSunken    - recessed background for grouped-list screens
    tintPrimary      - low-alpha primary wash for selected states
    tintDanger, tintWarning, tintSuccess - tonal backgrounds for pills
    onTintDanger, onTintWarning, onTintSuccess - text on those
  Derive them from the palette's existing hues. Comment every alpha choice.

=== 2. EXPAND THE TYPE RAMP ===
In TypeScale add, and use consistently:
    overline  (11, +0.5 letter-spacing, 600, uppercase) - section labels
    label     (13, 600)   - metadata, timestamps
    bodyLarge (17, 500)   - primary row title
    moneyLarge(28, 700)   - hero figure on detail screens
Keep every existing key so nothing breaks. Document what each is FOR in a
comment, so a later contributor does not pick by eye.

=== 3. REPLACE CARD-ON-EVERYTHING WITH A REAL ROW COMPONENT ===
Add src/components/list-row.tsx exporting <ListRow>, the app's list primitive:
- flat: background `surface`, NO border, NO shadow, NO radius
- a 1px `divider` hairline at the bottom, inset to start after the leading slot
  (WhatsApp-style inset divider), and suppressed on the last row
- three slots: `leading` (48x48), `content` (flex), `trailing` (right-aligned)
- pressed state fills with `backgroundSelected`, not a scale-only feedback
- minHeight 72
Add src/components/avatar-monogram.tsx: a 48px circle showing the customer's
initials (up to 2 chars, derived from full_name, Devanagari-safe), with a
deterministic background picked from a small set of palette-derived tints so the
same customer is always the same colour. Fall back to a person icon when the
name is missing.

Then rewrite src/components/admin-loan-row.tsx to use them:
  leading  = AvatarMonogram
  content  = line 1: customer full_name, bodyLarge, 1 line, ellipsized
             line 2: serial · item_name, label, textSecondary, 1 line
  trailing = line 1: MoneyText (principal), right-aligned
             line 2: Badge (status), right-aligned
Keep the ReanimatedSwipeable, the Call and Archive actions, the owner-only
gating, the ArchiveConfirm flow, the rowEntering animation and every testID
exactly as they are. Only the visual composition changes.

Reserve `Card` for genuinely card-shaped things: the gold rate card, summary
tiles, form groups. It must no longer be the default wrapper for a list row.

=== 4. RESTYLE Badge AS A TONAL PILL ===
Radii.pill, tonal background from the new tint tokens (not the full-strength
status colour), matching-tone text, an optional small leading dot, and
Devanagari-safe padding. Verify contrast in both schemes and both languages.

=== 5. MOVE THE LANGUAGE TOGGLE OUT OF THE TITLE ROW ===
Replace the two chips in ScreenHeader with ONE compact segmented pill
(EN | हिं as a single control with a sliding selected indicator), sized to sit
comfortably as a trailing accessory, not as two competing buttons. Keep both
testIDs (language-en, language-hi), keep the full LanguageSettingsRow in both
Settings tabs, and keep it reachable from every screen including login.
Give ScreenHeader an optional `subtitle` and an optional trailing slot, and a
title that shrinks to `label` size when the header collapses on scroll.

=== 6. GIVE THE LOANS TAB A REAL LIST CHROME ===
- Search: a rounded, filled search field (surfaceSunken, no border, leading
  magnifier icon, clear button) pinned under the header — not the generic Field.
- Status and customer-type filters: horizontally scrollable pill chips, selected
  = tintPrimary fill, using the existing filter state. Do not change what they
  filter.
- Section the list by status with a sticky `overline` section header.
- Replace the scan button with a floating action button, bottom-right, above the
  tab bar (respect useTabBarScrollPadding and safe-area insets), primary fill,
  with a shadow and a press-scale. It must not cover the last row.
- Skeleton loading rows (shimmering placeholder ListRows) instead of the bare
  ActivityIndicator. Respect useReduceMotion: no shimmer when it is on.
- Restyle EmptyState: a large muted icon, a title, one line of guidance, and a
  primary action where one makes sense.

=== 7. GROUPED SETTINGS ===
Restyle both Settings tabs as a grouped list on surfaceSunken: `overline`
section headers, ListRows with a leading icon in a tinted rounded square, a
chevron on anything that navigates, and destructive actions (sign out) in
`danger` in their own final group. Do not change what any row does.

=== 8. DETAIL SCREENS ===
On the admin loan detail screen, add a hero block at the top: customer name,
status pill, and the balance in `moneyLarge` with its label in `overline`.
Below it, group facts into labelled sections instead of one long stack of Rows.
Actions (redeem, renew, terms, archive) become a clearly separated action group
at the bottom, keeping their exact current owner-only gating.

=== 9. ICONS ===
Use expo-symbols on iOS with a matching Android set (already the pattern in
tab-bar-symbol.tsx). No emoji anywhere. Every icon needs an accessibilityLabel
or aria-hidden equivalent.

=== DELIVERABLE ORDER ===
Do it in this order and keep the build green at each step: theme tokens →
primitives (ListRow, AvatarMonogram, Badge, ScreenHeader, FAB, skeletons) →
loans tab → settings tabs → loan detail → remaining screens.

=== WHEN DONE ===
- Update src/app/__tests__/__snapshots__/bilingual-screen-snapshots-test.tsx.snap
  by re-recording it. Do not delete the test and do not stop asserting both
  languages.
- Add component tests for ListRow (all three slots, last-row divider
  suppression, pressed state) and AvatarMonogram (2-char initials, Devanagari
  name, missing-name fallback, deterministic colour).
- Run: npx tsc --noEmit && npm test && npx supabase test db
- Report: every token you added and why; the contrast ratios you achieved for
  body text and status pills in light and dark; any screen you could not
  restyle without touching logic; and anything in this prompt you did not do.

Do not run a formatter across untouched files. Keep the diff reviewable.
```

---

## Check it yourself afterwards

Look at these five things on a real device before accepting the work.

1. **Turn the phone's brightness down and stand under a tube light.** If the
   cream-on-cream surfaces have merged again, the palette fix did not land.
2. **Scroll the loans list fast on Android.** The FAB and glass tab bar are the
   two most likely places to drop frames.
3. **Switch to हिं on every screen.** Hindi strings run longer; look for
   clipped labels, wrapped pills, and a row title colliding with the money.
4. **Turn on reduce-motion and reduce-transparency in OS settings.** Skeletons
   must stop shimmering, glass must go opaque, and everything must stay legible.
5. **Sign in as staff.** Restyling is where role gates get dropped by accident —
   confirm Insights, Archive, redeem, renew and term-edit are all still absent.
