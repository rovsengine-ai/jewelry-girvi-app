/**
 * Design tokens. Palette hex lives only here.
 *
 * `Colors` is the live set (maroon + gold). Hex lives only in this file.
 *
 * `PaletteDirections` keep warmPaper / coolLedger / shopfrontContrast /
 * girviShopfront as complete reference proposals, plus maroonGold (live).
 * Do not edit screens to hard-code a favourite.
 *
 * Type: system fonts only (Devanagari on print later). No custom display face.
 * Chrome is SOLID primary on iOS and Android — not glass. Glass tokens remain
 * for any leftover GlassSurface uses; headers and the tab bar do not blur.
 */

import '@/global.css';

import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export type Palette = {
  text: string;
  background: string;
  backgroundElement: string;
  backgroundSelected: string;
  textSecondary: string;
  surface: string;
  elevated: string;
  /** Recessed page behind iOS-style grouped lists. Darker than `background`. */
  surfaceSunken: string;
  border: string;
  /** Hairline for flat list rows. Lighter than `border` so it is not a box. */
  divider: string;
  primary: string;
  onPrimary: string;
  statusActive: string;
  statusRedeemed: string;
  statusClosed: string;
  statusDefaulted: string;
  onStatus: string;
  success: string;
  warning: string;
  danger: string;
  onDanger: string;
  /** Low-alpha primary wash for selected chips and wells. */
  tintPrimary: string;
  tintDanger: string;
  tintWarning: string;
  tintSuccess: string;
  /** Extra washes so redeemed/closed pills stay distinct from success/danger. */
  tintRedeemed: string;
  tintClosed: string;
  onTintDanger: string;
  onTintWarning: string;
  onTintSuccess: string;
  onTintRedeemed: string;
  onTintClosed: string;
  overlay: string;
  overlayShadow: string;
  link: string;
  shadow: string;
  glassTint: string;
  glassTintStrong: string;
  glassBorder: string;
  glassHighlight: string;
  /** Hero pill / selected chip / tab indicator. */
  gold: string;
  /** Text on `gold`. */
  onGold: string;
  /** Solid header and tab fill. Same hue as `primary`. */
  chrome: string;
  /** Title and active tab on chrome. Same as `onPrimary`. */
  onChrome: string;
  /** Inactive tab / header meta. `onChrome` at 0.70 alpha. */
  onChromeMuted: string;
  /** Language-chip track on chrome. `onChrome` at 0.16 alpha. */
  chromeWell: string;
  /** Loan-id chip and phone accent. Same hue as `warning`. */
  accentWarning: string;
};

export type PaletteDirectionId =
  | 'warmPaper'
  | 'coolLedger'
  | 'shopfrontContrast'
  | 'girviShopfront'
  | 'maroonGold';

export type PaletteDirection = {
  id: PaletteDirectionId;
  label: string;
  summary: string;
  contrast: string;
  light: Palette;
  dark: Palette;
};

function hexToRgba(hex: string, alpha: number): string {
  const digits = hex.replace('#', '');
  const r = Number.parseInt(digits.slice(0, 2), 16);
  const g = Number.parseInt(digits.slice(2, 4), 16);
  const b = Number.parseInt(digits.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Glass chrome, derived from each direction's surface / elevated / border.
 * Do not introduce a new hue.
 *
 * glassTint 0.72 — tint under iOS blur / liquid glass so chrome stays
 *   coloured without hiding content behind it.
 * glassTintStrong 0.94 — Android default and reduce-transparency: almost
 *   opaque so type stays readable without blur.
 * glassBorder 0.60 — 1px hairline from palette.border.
 * glassHighlight 0.45 — inner top edge from palette.elevated.
 */
function glassFrom(
  surface: string,
  elevated: string,
  border: string,
): Pick<Palette, 'glassTint' | 'glassTintStrong' | 'glassBorder' | 'glassHighlight'> {
  return {
    glassTint: hexToRgba(surface, 0.72),
    glassTintStrong: hexToRgba(surface, 0.94),
    glassBorder: hexToRgba(border, 0.6),
    glassHighlight: hexToRgba(elevated, 0.45),
  };
}

/**
 * Ink washes for hairlines and tonal pills. Alpha is the only variable;
 * hues come from the palette so cream stays cream and slate stays slate.
 *
 * divider 0.10 light / 0.18 dark — lighter than `border`, WhatsApp-style.
 * tintPrimary 0.12 light / 0.22 dark — selected chip fill, not a button.
 * status tints 0.16 light / 0.24 dark — pill chrome without full-strength fills.
 * warning 0.18 light / 0.28 dark — yellow-brown needs more alpha on cream.
 */
function inkWashes(
  hues: {
    text: string;
    primary: string;
    danger: string;
    warning: string;
    success: string;
    statusRedeemed: string;
    statusClosed: string;
    dark: boolean;
  },
): Pick<
  Palette,
  | 'divider'
  | 'tintPrimary'
  | 'tintDanger'
  | 'tintWarning'
  | 'tintSuccess'
  | 'tintRedeemed'
  | 'tintClosed'
  | 'onTintDanger'
  | 'onTintWarning'
  | 'onTintSuccess'
  | 'onTintRedeemed'
  | 'onTintClosed'
> {
  const dividerAlpha = hues.dark ? 0.18 : 0.1;
  const primaryAlpha = hues.dark ? 0.22 : 0.12;
  const statusAlpha = hues.dark ? 0.24 : 0.16;
  const warningAlpha = hues.dark ? 0.28 : 0.18;
  return {
    divider: hexToRgba(hues.text, dividerAlpha),
    tintPrimary: hexToRgba(hues.primary, primaryAlpha),
    tintDanger: hexToRgba(hues.danger, statusAlpha),
    tintWarning: hexToRgba(hues.warning, warningAlpha),
    tintSuccess: hexToRgba(hues.success, statusAlpha),
    tintRedeemed: hexToRgba(hues.statusRedeemed, statusAlpha),
    tintClosed: hexToRgba(hues.statusClosed, statusAlpha),
    onTintDanger: hues.danger,
    onTintWarning: hues.warning,
    onTintSuccess: hues.success,
    onTintRedeemed: hues.statusRedeemed,
    onTintClosed: hues.statusClosed,
  };
}

/**
 * Solid chrome + gold shopfront tokens. `chrome` tracks `primary` so a
 * direction never gets a second brand hue for the header.
 *
 * onChromeMuted 0.70 — inactive tab icon/label on solid chrome.
 * chromeWell 0.16 — language segmented track sitting on chrome.
 */
function chromeFrom(
  primary: string,
  onPrimary: string,
  warning: string,
  gold: string,
  onGold: string,
): Pick<
  Palette,
  | 'gold'
  | 'onGold'
  | 'chrome'
  | 'onChrome'
  | 'onChromeMuted'
  | 'chromeWell'
  | 'accentWarning'
> {
  return {
    gold,
    onGold,
    chrome: primary,
    onChrome: onPrimary,
    onChromeMuted: hexToRgba(onPrimary, 0.7),
    chromeWell: hexToRgba(onPrimary, 0.16),
    accentWarning: warning,
  };
}

const warmPaper: PaletteDirection = {
  id: 'warmPaper',
  label: 'Warm paper',
  summary:
    'Cream ledger, ink-brown type, maroon seal. Shop feels like a passbook; customer feels like a stamp, not an app.',
  contrast:
    'Measured WCAG: light body 12.64:1 (#1F1B16 on #E8DCC8), secondary 5.56:1, pills 3.50–6.15:1. Dark body 15.14:1 (#F0E6D8 on #141210), secondary 8.07:1, pills 3.44–5.26:1. Elevated #FFFBF3 vs page #E8DCC8 is a paper lift, not a 3% cream-on-cream delta.',
  light: {
    text: '#1F1B16',
    background: '#E8DCC8',
    backgroundElement: '#DDD0BA',
    backgroundSelected: '#D0C3AB',
    textSecondary: '#5C5348',
    surface: '#E8DCC8',
    elevated: '#FFFBF3',
    surfaceSunken: '#D4C6AE',
    border: '#D4CBBA',
    primary: '#6B2E2E',
    onPrimary: '#FFFBF3',
    statusActive: '#2F6B3A',
    statusRedeemed: '#4A5C6B',
    statusClosed: '#6B6560',
    statusDefaulted: '#8B2E2E',
    onStatus: '#FFFBF3',
    success: '#2F6B3A',
    warning: '#8A5A12',
    danger: '#8B2E2E',
    onDanger: '#FFFBF3',
    overlay: '#E8DCC8',
    overlayShadow: '#1F1B16',
    link: '#6B2E2E',
    shadow: '#1F1B16',
    ...inkWashes({
      text: '#1F1B16',
      primary: '#6B2E2E',
      danger: '#8B2E2E',
      warning: '#8A5A12',
      success: '#2F6B3A',
      statusRedeemed: '#4A5C6B',
      statusClosed: '#6B6560',
      dark: false,
    }),
    ...glassFrom('#E8DCC8', '#FFFBF3', '#D4CBBA'),
    ...chromeFrom('#6B2E2E', '#FFFBF3', '#8A5A12', '#C9A227', '#1F1B16'),
  },
  dark: {
    text: '#F0E6D8',
    background: '#141210',
    backgroundElement: '#221E1A',
    backgroundSelected: '#3A322A',
    textSecondary: '#B7A898',
    surface: '#141210',
    elevated: '#322B24',
    surfaceSunken: '#0B0908',
    border: '#4A4036',
    primary: '#C98989',
    onPrimary: '#141210',
    statusActive: '#7CB389',
    statusRedeemed: '#8AA0B3',
    statusClosed: '#A89F96',
    statusDefaulted: '#E08A8A',
    onStatus: '#141210',
    success: '#7CB389',
    warning: '#E0B36A',
    danger: '#E08A8A',
    onDanger: '#141210',
    overlay: '#F0E6D8',
    overlayShadow: '#0D0B09',
    link: '#C98989',
    shadow: '#0D0B09',
    ...inkWashes({
      text: '#F0E6D8',
      primary: '#C98989',
      danger: '#E08A8A',
      warning: '#E0B36A',
      success: '#7CB389',
      statusRedeemed: '#8AA0B3',
      statusClosed: '#A89F96',
      dark: true,
    }),
    ...glassFrom('#141210', '#322B24', '#4A4036'),
    ...chromeFrom('#C98989', '#141210', '#E0B36A', '#E0B36A', '#141210'),
  },
};

const coolLedger: PaletteDirection = {
  id: 'coolLedger',
  label: 'Cool ledger',
  summary:
    'Slate passbook. Institutional, not playful. Dense shop list stays cool-grey; customer receipt reads like a bank slip.',
  contrast:
    'Measured WCAG: light body 12.94:1, secondary 4.71:1, pills 3.82–5.69:1. Dark body 15.96:1, secondary 7.68:1, pills 3.75–5.92:1. Elevated #FFFFFF vs page #E4E9F0 is a paper lift without a border.',
  light: {
    text: '#1A2332',
    background: '#E4E9F0',
    backgroundElement: '#D8DEE8',
    backgroundSelected: '#C9D2DE',
    textSecondary: '#5B6778',
    surface: '#E4E9F0',
    elevated: '#FFFFFF',
    surfaceSunken: '#D5DCE6',
    border: '#C5CDD8',
    primary: '#1E4A73',
    onPrimary: '#F3F5F8',
    statusActive: '#1B6B45',
    statusRedeemed: '#3D5A73',
    statusClosed: '#5C6773',
    statusDefaulted: '#A12622',
    onStatus: '#FFFFFF',
    success: '#1B6B45',
    warning: '#8A5A00',
    danger: '#A12622',
    onDanger: '#FFFFFF',
    overlay: '#E4E9F0',
    overlayShadow: '#1A2332',
    link: '#1E4A73',
    shadow: '#1A2332',
    ...inkWashes({
      text: '#1A2332',
      primary: '#1E4A73',
      danger: '#A12622',
      warning: '#8A5A00',
      success: '#1B6B45',
      statusRedeemed: '#3D5A73',
      statusClosed: '#5C6773',
      dark: false,
    }),
    ...glassFrom('#E4E9F0', '#FFFFFF', '#C5CDD8'),
    ...chromeFrom('#1E4A73', '#F3F5F8', '#8A5A00', '#C9A227', '#1A2332'),
  },
  dark: {
    text: '#E8EDF4',
    background: '#0E1218',
    backgroundElement: '#1C232C',
    backgroundSelected: '#2A3340',
    textSecondary: '#9AA7B8',
    surface: '#0E1218',
    elevated: '#222A35',
    surfaceSunken: '#0A0D11',
    border: '#3A4554',
    primary: '#8BB4D9',
    onPrimary: '#0E1218',
    statusActive: '#7DCCA3',
    statusRedeemed: '#9BB4C9',
    statusClosed: '#A8B0B8',
    statusDefaulted: '#E08B88',
    onStatus: '#0E1218',
    success: '#7DCCA3',
    warning: '#E0C07A',
    danger: '#E08B88',
    onDanger: '#0E1218',
    overlay: '#E8EDF4',
    overlayShadow: '#07090C',
    link: '#8BB4D9',
    shadow: '#07090C',
    ...inkWashes({
      text: '#E8EDF4',
      primary: '#8BB4D9',
      danger: '#E08B88',
      warning: '#E0C07A',
      success: '#7DCCA3',
      statusRedeemed: '#9BB4C9',
      statusClosed: '#A8B0B8',
      dark: true,
    }),
    ...glassFrom('#0E1218', '#222A35', '#3A4554'),
    ...chromeFrom('#8BB4D9', '#0E1218', '#E0C07A', '#E0C07A', '#0E1218'),
  },
};

const shopfrontContrast: PaletteDirection = {
  id: 'shopfrontContrast',
  label: 'Shopfront contrast',
  summary:
    'Built for sun through a glass shopfront. Off-white / charcoal, not #000 on #fff. Thick status colours. Same product, louder edges.',
  contrast:
    'Measured WCAG: light body 13.68:1, secondary 6.79:1, pills 4.04–6.36:1. Dark body 17.30:1, secondary 9.39:1, pills 4.23–6.81:1. Elevated #F7F6F1 vs page #E2E1DB is a paper lift without a border.',
  light: {
    text: '#171717',
    background: '#E2E1DB',
    backgroundElement: '#D6D5CF',
    backgroundSelected: '#C8C7C1',
    textSecondary: '#4A4A46',
    surface: '#E2E1DB',
    elevated: '#F7F6F1',
    surfaceSunken: '#D4D3CD',
    border: '#B8B7B1',
    primary: '#0D3B2E',
    onPrimary: '#F7F6F1',
    statusActive: '#0F6B38',
    statusRedeemed: '#1F4E79',
    statusClosed: '#4A4A46',
    statusDefaulted: '#9B1B1B',
    onStatus: '#F7F6F1',
    success: '#0F6B38',
    warning: '#7A4A00',
    danger: '#9B1B1B',
    onDanger: '#F7F6F1',
    overlay: '#F7F6F1',
    overlayShadow: '#171717',
    link: '#0D3B2E',
    shadow: '#171717',
    ...inkWashes({
      text: '#171717',
      primary: '#0D3B2E',
      danger: '#9B1B1B',
      warning: '#7A4A00',
      success: '#0F6B38',
      statusRedeemed: '#1F4E79',
      statusClosed: '#4A4A46',
      dark: false,
    }),
    ...glassFrom('#E2E1DB', '#F7F6F1', '#B8B7B1'),
    ...chromeFrom('#0D3B2E', '#F7F6F1', '#7A4A00', '#C9A227', '#171717'),
  },
  dark: {
    text: '#F2F1EC',
    background: '#0C0C0C',
    backgroundElement: '#1C1C1C',
    backgroundSelected: '#2A2A2A',
    textSecondary: '#B4B4AE',
    surface: '#0C0C0C',
    elevated: '#222222',
    surfaceSunken: '#080808',
    border: '#3A3A3A',
    primary: '#8FCBB3',
    onPrimary: '#0C0C0C',
    statusActive: '#6DDB9A',
    statusRedeemed: '#8EB6E0',
    statusClosed: '#C4C4BE',
    statusDefaulted: '#F08A8A',
    onStatus: '#0C0C0C',
    success: '#6DDB9A',
    warning: '#E8C36A',
    danger: '#F08A8A',
    onDanger: '#0C0C0C',
    overlay: '#F2F1EC',
    overlayShadow: '#000000',
    link: '#8FCBB3',
    shadow: '#000000',
    ...inkWashes({
      text: '#F2F1EC',
      primary: '#8FCBB3',
      danger: '#F08A8A',
      warning: '#E8C36A',
      success: '#6DDB9A',
      statusRedeemed: '#8EB6E0',
      statusClosed: '#C4C4BE',
      dark: true,
    }),
    ...glassFrom('#0C0C0C', '#222222', '#3A3A3A'),
    ...chromeFrom('#8FCBB3', '#0C0C0C', '#E8C36A', '#E8C36A', '#0C0C0C'),
  },
};

/**
 * Reference shopfront. Royal purple chrome, gold hero, cool off-white page.
 *
 * Light WCAG (measured):
 *   body 16.59:1 (#1A1228 on #F4F5F8), secondary 6.38:1 (#5C5670 on #F4F5F8)
 *   onChrome 11.86:1 (#FFFFFF on #4A148C)
 *   onGold 11.01:1 (#1A1228 on #F5C400)
 *   gold-on-purple 7.22:1 (#F5C400 on #4A148C)
 *   success 4.52:1 on white (#188757; mock #1B8A5A was 4.35:1)
 *   danger 4.54:1 on white (#D34242; mock #D64545 was 4.38:1)
 *   warning tweaked #C05612 (4.58:1) — mock #E67E22 was 2.85:1 on white
 * Dark WCAG (measured):
 *   body 16.54:1 (#F3EEF8 on #160C24), secondary 8.79:1 (#B5ADC8 on #160C24)
 *   onChrome 8.20:1 (#FFFFFF on #7B1FA2)
 *   success 7.82:1 / danger 6.22:1 / warning 7.60:1 on elevated #2A1840
 *
 * Android chrome: the same solid `chrome` fill as iOS. No dimezis blur.
 */
const girviShopfront: PaletteDirection = {
  id: 'girviShopfront',
  label: 'Girvi shopfront',
  summary:
    'Solid royal-purple chrome, gold hero pill, cool off-white page, white cards.',
  contrast:
    'Light body 16.59:1, secondary 6.38:1, onChrome 11.86:1, onGold 11.01:1, gold-on-purple 7.22:1, success 4.52:1 / danger 4.54:1 on white, warning 4.58:1. Dark body 16.54:1, secondary 8.79:1, onChrome 8.20:1, success 7.82:1 / danger 6.22:1 on elevated.',
  light: {
    // Ink on cool off-white page.
    text: '#1A1228',
    background: '#F4F5F8',
    backgroundElement: '#E2E3EA',
    backgroundSelected: '#D8D9E2',
    textSecondary: '#5C5670',
    surface: '#F4F5F8',
    elevated: '#FFFFFF',
    surfaceSunken: '#E8E9EE',
    border: '#D5D6DE',
    // Royal purple chrome / FAB / primary buttons.
    primary: '#4A148C',
    onPrimary: '#FFFFFF',
    statusActive: '#188757',
    statusRedeemed: '#3D5A8A',
    statusClosed: '#6B6578',
    statusDefaulted: '#D34242',
    onStatus: '#FFFFFF',
    // Money on white: mock #1B8A5A was 4.35:1; #188757 is 4.52:1 body.
    success: '#188757',
    // Phone / loan-id: mock #E67E22 was 2.85:1 on white; darkened to body 4.5:1.
    warning: '#C05612',
    danger: '#D34242',
    onDanger: '#FFFFFF',
    overlay: '#F4F5F8',
    overlayShadow: '#1A1228',
    link: '#4A148C',
    shadow: '#1A1228',
    ...inkWashes({
      text: '#1A1228',
      primary: '#4A148C',
      danger: '#D34242',
      warning: '#C05612',
      success: '#188757',
      statusRedeemed: '#3D5A8A',
      statusClosed: '#6B6578',
      dark: false,
    }),
    ...glassFrom('#F4F5F8', '#FFFFFF', '#D5D6DE'),
    ...chromeFrom('#4A148C', '#FFFFFF', '#C05612', '#F5C400', '#1A1228'),
  },
  dark: {
    // Deep purple-ink page.
    text: '#F3EEF8',
    background: '#160C24',
    backgroundElement: '#241536',
    backgroundSelected: '#3A2258',
    textSecondary: '#B5ADC8',
    surface: '#160C24',
    elevated: '#2A1840',
    surfaceSunken: '#10081A',
    border: '#4A3560',
    // Lightened purple so white type still contrasts (8.20:1).
    primary: '#7B1FA2',
    onPrimary: '#FFFFFF',
    statusActive: '#3DCC88',
    statusRedeemed: '#8EB6E0',
    statusClosed: '#C4BDD4',
    statusDefaulted: '#F08080',
    onStatus: '#160C24',
    success: '#3DCC88',
    warning: '#F0A14A',
    danger: '#F08080',
    onDanger: '#160C24',
    overlay: '#F3EEF8',
    overlayShadow: '#0A0612',
    link: '#D4B3F0',
    shadow: '#0A0612',
    ...inkWashes({
      text: '#F3EEF8',
      primary: '#7B1FA2',
      danger: '#F08080',
      warning: '#F0A14A',
      success: '#3DCC88',
      statusRedeemed: '#8EB6E0',
      statusClosed: '#C4BDD4',
      dark: true,
    }),
    ...glassFrom('#160C24', '#2A1840', '#4A3560'),
    ...chromeFrom('#7B1FA2', '#FFFFFF', '#F0A14A', '#F5C400', '#1A1228'),
  },
};

/**
 * Live shopfront. Oxblood chrome, gold hero, warm off-white page, white cards.
 *
 * Light WCAG (measured, same sRGB formula as button-contrast-test):
 *   body 16.99:1 (#1C1410 on #FAF7F2), secondary 5.87:1 (#6B5E52 on #FAF7F2)
 *   onChrome 14.92:1 (#FFFFFF on #4E0F1A)
 *   onGold 11.05:1 (#1C1410 on #F5C400)
 *   gold-on-maroon 9.08:1 (#F5C400 on #4E0F1A)
 *   success 6.03:1 on page (#146C45; girvi #188757 was 4.23:1 on this cream)
 *   danger 4.52:1 on page (#DC2626; girvi #D34242 was 4.28:1 on this cream)
 *   warning 4.55:1 on page (#9A6708 amber — not orange-red on oxblood)
 * Dark WCAG (measured):
 *   body 16.94:1 (#F6EDE8 on #16080C), secondary 9.90:1 (#C9B4B0 on #16080C)
 *   onChrome 11.65:1 (#FFFFFF on #6A1B2A)
 *   success 8.41:1 / danger 7.57:1 / warning 9.22:1 on elevated #2A1418
 *
 * Android chrome: the same solid `chrome` fill as iOS. No dimezis blur.
 */
const maroonGold: PaletteDirection = {
  id: 'maroonGold',
  label: 'Maroon gold',
  summary:
    'Solid oxblood chrome, gold hero pill, warm off-white page, white cards.',
  contrast:
    'Light body 16.99:1, secondary 5.87:1, onChrome 14.92:1, onGold 11.05:1, gold-on-maroon 9.08:1, success 6.03:1 / danger 4.52:1 / warning 4.55:1 on page. Dark body 16.94:1, secondary 9.90:1, onChrome 11.65:1, success 8.41:1 / danger 7.57:1 / warning 9.22:1 on elevated.',
  light: {
    // Warm ink on near-white cream page.
    text: '#1C1410',
    background: '#FAF7F2',
    backgroundElement: '#EFE8DC',
    backgroundSelected: '#E5DCCE',
    textSecondary: '#6B5E52',
    surface: '#FAF7F2',
    elevated: '#FFFFFF',
    surfaceSunken: '#F0E9DE',
    border: '#E4D9CC',
    // Oxblood chrome / FAB / primary — darker than #6A1B2A so vermillion danger separates by value.
    primary: '#4E0F1A',
    onPrimary: '#FFFFFF',
    statusActive: '#146C45',
    statusRedeemed: '#3D5A8A',
    statusClosed: '#6B5E52',
    statusDefaulted: '#DC2626',
    onStatus: '#FFFFFF',
    success: '#146C45',
    // Amber, not orange-red: same hue family as maroon would collapse loan-id chips into chrome.
    warning: '#9A6708',
    danger: '#DC2626',
    onDanger: '#FFFFFF',
    overlay: '#FAF7F2',
    overlayShadow: '#1C1410',
    link: '#4E0F1A',
    shadow: '#1C1410',
    ...inkWashes({
      text: '#1C1410',
      primary: '#4E0F1A',
      danger: '#DC2626',
      warning: '#9A6708',
      success: '#146C45',
      statusRedeemed: '#3D5A8A',
      statusClosed: '#6B5E52',
      dark: false,
    }),
    ...glassFrom('#FAF7F2', '#FFFFFF', '#E4D9CC'),
    ...chromeFrom('#4E0F1A', '#FFFFFF', '#9A6708', '#F5C400', '#1C1410'),
  },
  dark: {
    // Warm oxblood-night page.
    text: '#F6EDE8',
    background: '#16080C',
    backgroundElement: '#241418',
    backgroundSelected: '#3A2228',
    textSecondary: '#C9B4B0',
    surface: '#16080C',
    elevated: '#2A1418',
    surfaceSunken: '#100608',
    border: '#4A3036',
    // Original maroon so dark chrome is wine, not a black bar.
    primary: '#6A1B2A',
    onPrimary: '#FFFFFF',
    statusActive: '#3DCC88',
    statusRedeemed: '#8EB6E0',
    statusClosed: '#C4B8B4',
    statusDefaulted: '#FF8A7A',
    onStatus: '#16080C',
    success: '#3DCC88',
    warning: '#F0B24A',
    danger: '#FF8A7A',
    onDanger: '#16080C',
    overlay: '#F6EDE8',
    overlayShadow: '#0A0406',
    link: '#E8B4B8',
    shadow: '#0A0406',
    ...inkWashes({
      text: '#F6EDE8',
      primary: '#6A1B2A',
      danger: '#FF8A7A',
      warning: '#F0B24A',
      success: '#3DCC88',
      statusRedeemed: '#8EB6E0',
      statusClosed: '#C4B8B4',
      dark: true,
    }),
    ...glassFrom('#16080C', '#2A1418', '#4A3036'),
    ...chromeFrom('#6A1B2A', '#FFFFFF', '#F0B24A', '#F5C400', '#1C1410'),
  },
};

export const PaletteDirections: Record<PaletteDirectionId, PaletteDirection> = {
  warmPaper,
  coolLedger,
  shopfrontContrast,
  girviShopfront,
  maroonGold,
};

/**
 * Live tokens: maroon + gold. The other PaletteDirections stay for
 * reference; screens must keep reading Colors, never a direction id.
 */
export const Colors = {
  light: PaletteDirections.maroonGold.light,
  dark: PaletteDirections.maroonGold.dark,
} as const satisfies { light: Palette; dark: Palette };

export type ThemeColor = keyof Palette;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** Unchanged. Screens already depend on these steps. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * What each size is FOR — pick by job, not by eye.
 * Existing keys stay so screens that already use them do not break.
 */
export const TypeScale = {
  /** Fine print, legal asides, compact badge labels. Not a section header. */
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
  /** Default paragraph and form helper copy. */
  body: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  /** Emphasis inside a body stack (running totals). */
  bodyBold: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  /** Screen titles in chrome. Not ThemedText type="title" (that stays display-sized). */
  title: { fontSize: 22, lineHeight: 30, fontWeight: '600' },
  /** Rare hero words and large empty-state titles. */
  display: { fontSize: 32, lineHeight: 44, fontWeight: '600' },
  /** Inline money in rows. Pair with tabular-nums. */
  money: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  /**
   * Section labels above grouped lists. Uppercase Latin only.
   * Do not rely on textTransform for Devanagari — it is unchanged.
   */
  overline: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  /** Metadata, timestamps, serial · item. */
  label: { fontSize: 13, lineHeight: 20, fontWeight: '500' },
  /** Secondary body one step below default (form hints, compact rows). */
  small: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  /** Tappable inline links. */
  link: { fontSize: 14, lineHeight: 30, fontWeight: '500' },
  /** Login / marketing hero only — not ScreenHeader title. */
  heroTitle: { fontSize: 48, lineHeight: 52, fontWeight: '600' },
  heroSubtitle: { fontSize: 32, lineHeight: 44, fontWeight: '600' },
  /** Monospace snippets; pair with Fonts.mono in ThemedText. */
  codeSize: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  /** Primary row title (customer name). */
  bodyLarge: { fontSize: 17, lineHeight: 24, fontWeight: '700' },
  /** Hero figure on detail screens. Pair with tabular-nums. */
  moneyLarge: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
} as const satisfies Record<string, TextStyle>;

export const Radii = {
  xs: 4,
  sm: 8,
  md: 12,
  pill: 999,
} as const;

/** Layout sizes. Screens must not invent 48 / 56 / 72. */
export const Sizes = {
  avatar: 48,
  listRowMinHeight: 72,
  fab: 56,
  leadingIcon: 22,
  hairline: 1,
  /** Release checklist and similar checkbox glyphs (row hit target stays MinTouchTarget). */
  checkbox: 18,
  /** Customer receipt card image on My Receipts. */
  receiptImageHeight: 220,
  /** Placeholder well when no receipt image is stored. */
  receiptPlaceholderHeight: 160,
  /** Scanner OCR preview and similar still previews. */
  imagePreviewHeight: 200,
  /** Pledged-item photo thumbnail on create-loan review. */
  itemPhotoThumbHeight: 96,
  /** Loan detail receipt thumbnail. */
  receiptThumbHeight: 180,
  /** Stored pledge / release signature still. */
  signatureThumbHeight: 140,
  /** Signature pad on create-loan review (taller canvas). */
  signaturePadHeight: 220,
  /** Signature pad on redeem (compact canvas). */
  signaturePadHeightCompact: 180,
  /** Loan receipt QR on loan detail. */
  qrCode: 160,
  /** Full-screen counter activation QR. */
  qrCodeLarge: 240,
  /** Inline QR size inside printed pledge HTML (pixels). */
  qrCodePrint: 128,
  /** Gold bar on the top edge of the active tab item. */
  tabIndicator: 3,
} as const;

/**
 * Chrome sizes and blur. `supportsNativeGlass` is the runtime Liquid Glass
 * check from expo-glass-effect (iOS 26+ API + compiled-in availability).
 * https://docs.expo.dev/versions/v57.0.0/sdk/glass-effect/
 */
export const Glass = {
  blurIntensity: Platform.select({ ios: 40, android: 28, default: 28 }) ?? 28,
  /** Stronger soft blur for floating docks / choice sheets. */
  blurIntensityStrong: Platform.select({ ios: 64, android: 42, default: 42 }) ?? 42,
  tabBarHeight: Platform.select({ ios: 50, android: 56, web: 64, default: 56 }) ?? 56,
  headerHeight: 56,
  get supportsNativeGlass(): boolean {
    // Liquid Glass is iOS-only; never probe the native module on web/Android.
    if (Platform.OS !== 'ios') {
      return false;
    }
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  },
};

export const MinTouchTarget = 44;

export const Elevation = {
  none: {} as ViewStyle,
  card: Platform.select<ViewStyle>({
    ios: {
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    android: { elevation: 2 },
    default: {},
  }) as ViewStyle,
  fab: Platform.select<ViewStyle>({
    ios: {
      shadowOpacity: 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 6 },
    default: {},
  }) as ViewStyle,
};

export const BottomTabInset = Platform.select({ ios: 50, android: 80, web: 88, default: 80 }) ?? 80;
export const MaxContentWidth = 800;
