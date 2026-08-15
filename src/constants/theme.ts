/**
 * Design tokens. Palette hex lives only here.
 *
 * `Colors` is the live set: create-expo-app greys plus status/link hex lifted
 * from existing screens. It is not a brand pick.
 *
 * `PaletteDirections` are the three complete proposals. Swap one into `Colors`
 * after the owner chooses. Do not edit screens to hard-code a favourite.
 *
 * Type: system fonts only (Devanagari on print later). No custom display face.
 */

import '@/global.css';

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export type Palette = {
  text: string;
  background: string;
  backgroundElement: string;
  backgroundSelected: string;
  textSecondary: string;
  surface: string;
  elevated: string;
  border: string;
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
  overlay: string;
  overlayShadow: string;
  link: string;
  shadow: string;
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

const warmPaper: PaletteDirection = {
  id: 'warmPaper',
  label: 'Warm paper',
  summary:
    'Cream ledger, ink-brown type, maroon seal. Shop feels like a passbook; customer feels like a stamp, not an app.',
  contrast:
    'Light body ~12:1 (#1F1B16 on #F4EFE6). Not pure black on white. Target WCAG AA 4.5:1 body, 3:1 large.',
  light: {
    text: '#1F1B16',
    background: '#F4EFE6',
    backgroundElement: '#EBE4D6',
    backgroundSelected: '#DDD4C4',
    textSecondary: '#5C5348',
    surface: '#F4EFE6',
    elevated: '#FFFBF3',
    border: '#D4CBBA',
    primary: '#6B2E2E',
    onPrimary: '#F4EFE6',
    statusActive: '#2F6B3A',
    statusRedeemed: '#4A5C6B',
    statusClosed: '#6B6560',
    statusDefaulted: '#8B2E2E',
    onStatus: '#FFFBF3',
    success: '#2F6B3A',
    warning: '#8A5A12',
    danger: '#8B2E2E',
    onDanger: '#FFFBF3',
    overlay: '#F4EFE6',
    overlayShadow: '#1F1B16',
    link: '#6B2E2E',
    shadow: '#1F1B16',
  },
  dark: {
    text: '#F0E6D8',
    background: '#1A1714',
    backgroundElement: '#2A241E',
    backgroundSelected: '#3A322A',
    textSecondary: '#B7A898',
    surface: '#1A1714',
    elevated: '#2A241E',
    border: '#4A4036',
    primary: '#C98989',
    onPrimary: '#1A1714',
    statusActive: '#7CB389',
    statusRedeemed: '#8AA0B3',
    statusClosed: '#A89F96',
    statusDefaulted: '#E08A8A',
    onStatus: '#1A1714',
    success: '#7CB389',
    warning: '#E0B36A',
    danger: '#E08A8A',
    onDanger: '#1A1714',
    overlay: '#F0E6D8',
    overlayShadow: '#0D0B09',
    link: '#C98989',
    shadow: '#0D0B09',
  },
};

const coolLedger: PaletteDirection = {
  id: 'coolLedger',
  label: 'Cool ledger',
  summary:
    'Slate passbook. Institutional, not playful. Dense shop list stays cool-grey; customer receipt reads like a bank slip.',
  contrast:
    'Light body ~12:1 (#1A2332 on #F3F5F8). Primary #1E4A73 on cream-slate meets AA for large type on buttons with onPrimary.',
  light: {
    text: '#1A2332',
    background: '#F3F5F8',
    backgroundElement: '#E6EAF0',
    backgroundSelected: '#D5DCE6',
    textSecondary: '#5B6778',
    surface: '#F3F5F8',
    elevated: '#FFFFFF',
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
    overlay: '#F3F5F8',
    overlayShadow: '#1A2332',
    link: '#1E4A73',
    shadow: '#1A2332',
  },
  dark: {
    text: '#E8EDF4',
    background: '#12161C',
    backgroundElement: '#1C232C',
    backgroundSelected: '#2A3340',
    textSecondary: '#9AA7B8',
    surface: '#12161C',
    elevated: '#1C232C',
    border: '#3A4554',
    primary: '#8BB4D9',
    onPrimary: '#12161C',
    statusActive: '#7DCCA3',
    statusRedeemed: '#9BB4C9',
    statusClosed: '#A8B0B8',
    statusDefaulted: '#E08B88',
    onStatus: '#12161C',
    success: '#7DCCA3',
    warning: '#E0C07A',
    danger: '#E08B88',
    onDanger: '#12161C',
    overlay: '#E8EDF4',
    overlayShadow: '#07090C',
    link: '#8BB4D9',
    shadow: '#07090C',
  },
};

const shopfrontContrast: PaletteDirection = {
  id: 'shopfrontContrast',
  label: 'Shopfront contrast',
  summary:
    'Built for sun through a glass shopfront. Off-white / charcoal, not #000 on #fff. Thick status colours. Same product, louder edges.',
  contrast:
    'Light body ~13:1 (#171717 on #EEEDE8). Buttons use #0D3B2E / #F4F4F0. Status hues stay distinct at a glance in glare.',
  light: {
    text: '#171717',
    background: '#EEEDE8',
    backgroundElement: '#E2E1DB',
    backgroundSelected: '#D2D1CB',
    textSecondary: '#4A4A46',
    surface: '#EEEDE8',
    elevated: '#F7F6F1',
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
  },
  dark: {
    text: '#F2F1EC',
    background: '#101010',
    backgroundElement: '#1C1C1C',
    backgroundSelected: '#2A2A2A',
    textSecondary: '#B4B4AE',
    surface: '#101010',
    elevated: '#1C1C1C',
    border: '#3A3A3A',
    primary: '#8FCBB3',
    onPrimary: '#101010',
    statusActive: '#6DDB9A',
    statusRedeemed: '#8EB6E0',
    statusClosed: '#C4C4BE',
    statusDefaulted: '#F08A8A',
    onStatus: '#101010',
    success: '#6DDB9A',
    warning: '#E8C36A',
    danger: '#F08A8A',
    onDanger: '#101010',
    overlay: '#F2F1EC',
    overlayShadow: '#000000',
    link: '#8FCBB3',
    shadow: '#000000',
  },
};

export const PaletteDirections: Record<PaletteDirectionId, PaletteDirection> = {
  warmPaper,
  coolLedger,
  shopfrontContrast,
};

/**
 * Live tokens until a PaletteDirections id is chosen. Existing 5 keys are
 * unchanged so current screens do not shift. New keys are lifts of hex already
 * in the repo (customer badge, ThemedText link).
 */
export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    surface: '#ffffff',
    elevated: '#F0F0F3',
    border: '#E0E1E6',
    primary: '#212225',
    onPrimary: '#ffffff',
    statusActive: '#1B7F3A',
    statusRedeemed: '#6B7280',
    statusClosed: '#6B7280',
    statusDefaulted: '#B42318',
    onStatus: '#ffffff',
    success: '#1B7F3A',
    warning: '#60646C',
    danger: '#B42318',
    onDanger: '#ffffff',
    overlay: '#ffffff',
    overlayShadow: '#000000',
    link: '#3c87f7',
    shadow: '#000000',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    surface: '#000000',
    elevated: '#212225',
    border: '#2E3135',
    primary: '#E0E1E6',
    onPrimary: '#000000',
    statusActive: '#1B7F3A',
    statusRedeemed: '#6B7280',
    statusClosed: '#6B7280',
    statusDefaulted: '#B42318',
    onStatus: '#ffffff',
    success: '#1B7F3A',
    warning: '#B0B4BA',
    danger: '#B42318',
    onDanger: '#ffffff',
    overlay: '#ffffff',
    overlayShadow: '#000000',
    link: '#3c87f7',
    shadow: '#000000',
  },
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

export const TypeScale = {
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  bodyBold: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  display: { fontSize: 32, lineHeight: 40, fontWeight: '600' },
  money: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
} as const satisfies Record<string, TextStyle>;

export const Radii = {
  sm: 8,
  md: 12,
  pill: 999,
} as const;

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
};

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
