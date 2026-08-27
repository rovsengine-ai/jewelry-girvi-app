/**
 * Language preference on native — SecureStore.
 * https://docs.expo.dev/versions/v57.0.0/sdk/securestore/
 */
import * as SecureStore from 'expo-secure-store';

import { isAppLanguage, type AppLanguage } from '@/i18n';

export async function readStoredLanguage(key: string): Promise<AppLanguage | null> {
  try {
    const stored = await SecureStore.getItemAsync(key);
    return isAppLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

export async function persistStoredLanguage(key: string, language: AppLanguage): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, language);
  } catch {
    // Best-effort persistence.
  }
}
