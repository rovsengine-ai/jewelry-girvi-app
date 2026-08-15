/**
 * Design tokens. Palette hex lives only here.
 *
 * `Colors` is the live set (Warm paper). Hex lives only in this file.
 *
 * `PaletteDirections` stay as the three complete proposals for reference.
 * Do not edit screens to hard-code a favourite.
 *
 * Type: system fonts only (Devanagari on print later). No custom display face.
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
};

export type PaletteDirectionId = 'warmPaper' | 'coolLedger' | 'shopfrontContrast';

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

const warmPaper: PaletteDirection = {
  id: 'warmPaper',
  label: 'Warm paper',
  summary:
    'Cream ledger, ink-brown type, maroon seal. Shop feels like a passbook; customer feels like a stamp, not an app.',
  contrast:
    'Light body ~12.8:1 (#1F1B16 on #E8DCC8). Elevated #FFFBF3 vs page #E8DCC8 is a real paper lift, not a 3% cream-on-cream delta. Target WCAG AA 4.5:1 body, 3:1 large / pills.',
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
  },
};

const coolLedger: PaletteDirection = {
  id: 'coolLedger',
  label: 'Cool ledger',
  summary:
    'Slate passbook. Institutional, not playful. Dense shop list stays cool-grey; customer receipt reads like a bank slip.',
  contrast:
    'Light body ~12:1 (#1A2332 on #E4E9F0). Elevated #FFFFFF vs page #E4E9F0 is a paper lift without a border. Target WCAG AA 4.5:1 body, 3:1 large / pills.',
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
  },
};

const shopfrontContrast: PaletteDirection = {
  id: 'shopfrontContrast',
  label: 'Shopfront contrast',
  summary:
    'Built for sun through a glass shopfront. Off-white / charcoal, not #000 on #fff. Thick status colours. Same product, louder edges.',
  contrast:
    'Light body ~13:1 (#171717 on #E2E1DB). Elevated #F7F6F1 vs page #E2E1DB is a paper lift without a border. Target WCAG AA 4.5:1 body, 3:1 large / pills.',
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
  },
};

export const PaletteDirections: Record<PaletteDirectionId, PaletteDirection> = {
  warmPaper,
  coolLedger,
  shopfrontContrast,
};

/**
 * Live tokens: Warm paper. The three PaletteDirections stay below for
 * reference; screens must keep reading Colors, never a direction id.
 */
export const Colors = {
  light: PaletteDirections.warmPaper.light,
  dark: PaletteDirections.warmPaper.dark,
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
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  /** Default paragraph and form helper copy. */
  body: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  /** Emphasis inside a body stack (running totals). */
  bodyBold: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  /** Screen titles in chrome. Not ThemedText type="title" (that stays display-sized). */
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  /** Rare hero words and large empty-state titles. */
  display: { fontSize: 32, lineHeight: 40, fontWeight: '600' },
  /** Inline money in rows. Pair with tabular-nums. */
  money: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  /** Section labels above grouped lists. Uppercase Latin; Devanagari is unchanged. */
  overline: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  /** Metadata, timestamps, serial · item. */
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  /** Primary row title (customer name). */
  bodyLarge: { fontSize: 17, lineHeight: 22, fontWeight: '500' },
  /** Hero figure on detail screens. Pair with tabular-nums. */
  moneyLarge: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
} as const satisfies Record<string, TextStyle>;

export const Radii = {
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
} as const;

/**
 * Chrome sizes and blur. `supportsNativeGlass` is the runtime Liquid Glass
 * check from expo-glass-effect (iOS 26+ API + compiled-in availability).
 * https://docs.expo.dev/versions/v57.0.0/sdk/glass-effect/
 */
export const Glass = {
  blurIntensity: Platform.select({ ios: 40, android: 24, default: 24 }) ?? 24,
  tabBarHeight: Platform.select({ ios: 50, android: 56, default: 56 }) ?? 56,
  headerHeight: 56,
  get supportsNativeGlass(): boolean {
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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
