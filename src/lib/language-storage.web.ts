/**
 * Language preference on web — localStorage (SecureStore is native-only).
 * https://docs.expo.dev/versions/v57.0.0/sdk/securestore/
 */
import { isAppLanguage, type AppLanguage } from '@/i18n';

export async function readStoredLanguage(key: string): Promise<AppLanguage | null> {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const stored = localStorage.getItem(key);
    return isAppLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

export async function persistStoredLanguage(key: string, language: AppLanguage): Promise<void> {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(key, language);
  } catch {
    // Best-effort persistence.
  }
}
