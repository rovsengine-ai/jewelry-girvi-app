/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { createContext, createElement, useContext, type ReactNode } from 'react';

import { Colors, type Palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const PaletteOverrideContext = createContext<Palette | null>(null);

/** Preview a proposed palette without swapping live `Colors`. Gate 2 only. */
export function ThemePaletteProvider({
  palette,
  children,
}: {
  palette: Palette;
  children: ReactNode;
}) {
  return createElement(PaletteOverrideContext.Provider, { value: palette }, children);
}

export function useTheme(): Palette {
  const override = useContext(PaletteOverrideContext);
  if (override) return override;

  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;
  return Colors[theme];
}
