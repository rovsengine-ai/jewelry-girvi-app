import { I18n, type TranslateOptions } from 'i18n-js';
import { getLocales } from 'expo-localization';

import { en } from '@/i18n/en';
import { hi } from '@/i18n/hi';

export type AppLanguage = 'en' | 'hi';

export type TranslateFn = (key: string, options?: Record<string, string | number>) => string;

export const LANGUAGE_STORE_KEY = 'girvi.language';

const i18n = new I18n({ en, hi });
i18n.enableFallback = true;
i18n.defaultLocale = 'en';
i18n.locale = 'en';

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return value === 'en' || value === 'hi';
}

/** Device language. Only Hindi is treated as hi; everything else is en. */
export function deviceLanguage(): AppLanguage {
  // https://docs.expo.dev/versions/v57.0.0/sdk/localization/
  return getLocales()[0]?.languageCode === 'hi' ? 'hi' : 'en';
}

export function setI18nLocale(language: AppLanguage): void {
  i18n.locale = language;
}

export function currentI18nLocale(): AppLanguage {
  return isAppLanguage(i18n.locale) ? i18n.locale : 'en';
}

export function translate(
  key: string,
  options?: Record<string, string | number>,
  language?: AppLanguage,
): string {
  const extras: TranslateOptions = { ...(options ?? {}) };
  if (language) {
    extras.locale = language;
  }
  return i18n.t(key, extras);
}

export function unknownMessage(error: unknown, t: TranslateFn): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }
  return t('errors.unknown');
}

export { i18n };
