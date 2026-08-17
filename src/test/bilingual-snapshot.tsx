import { type ReactElement, type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setI18nLocale, translate, type AppLanguage } from '@/i18n';

export const SNAPSHOT_SAFE_AREA = {
  frame: { x: 0, y: 0, width: 393, height: 851 },
  insets: { top: 24, left: 0, right: 0, bottom: 48 },
};

let activeLanguage: AppLanguage = 'en';

export function setSnapshotLanguage(language: AppLanguage): void {
  activeLanguage = language;
  setI18nLocale(language);
}

export function getSnapshotLanguage(): AppLanguage {
  return activeLanguage;
}

export function renderForSnapshot(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, {
    ...options,
    wrapper: ({ children }: { children: ReactNode }) => (
      <SafeAreaProvider initialMetrics={SNAPSHOT_SAFE_AREA}>{children}</SafeAreaProvider>
    ),
  });
}
