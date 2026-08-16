import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  currentI18nLocale,
  isAppLanguage,
  LANGUAGE_STORE_KEY,
  setI18nLocale,
  translate,
  type AppLanguage,
  type TranslateFn,
} from '@/i18n';

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: TranslateFn;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readWebLanguage(): AppLanguage | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const stored = localStorage.getItem(LANGUAGE_STORE_KEY);
    return isAppLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

async function readStoredLanguage(): Promise<AppLanguage | null> {
  try {
    if (Platform.OS === 'web') {
      return readWebLanguage();
    }
    // https://docs.expo.dev/versions/v57.0.0/sdk/securestore/
    const stored = await SecureStore.getItemAsync(LANGUAGE_STORE_KEY);
    return isAppLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

async function persistLanguage(language: AppLanguage): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LANGUAGE_STORE_KEY, language);
      }
      return;
    }
    await SecureStore.setItemAsync(LANGUAGE_STORE_KEY, language);
  } catch {
    // Persistence is best-effort; the in-memory locale still updates.
  }
}

const fallbackT: TranslateFn = (key, options) => translate(key, options);

const fallbackValue: LanguageContextValue = {
  language: 'en',
  setLanguage: (language) => {
    setI18nLocale(language);
  },
  t: fallbackT,
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    setI18nLocale('hi');
    return 'hi';
  });

  useEffect(() => {
    let mounted = true;
    void readStoredLanguage().then((stored) => {
      if (!mounted) return;
      const next = stored ?? 'hi';
      setI18nLocale(next);
      setLanguageState(next);
      if (!stored) {
        void persistLanguage('hi');
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setLanguage = (next: AppLanguage) => {
    setI18nLocale(next);
    setLanguageState(next);
    void persistLanguage(next);
  };

  const t: TranslateFn = (key, options) => translate(key, options, language);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext) ?? fallbackValue;
}

export function useI18nLocale(): AppLanguage {
  const ctx = useContext(LanguageContext);
  return ctx?.language ?? currentI18nLocale();
}
