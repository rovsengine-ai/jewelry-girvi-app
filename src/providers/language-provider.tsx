import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import {
  currentI18nLocale,
  LANGUAGE_STORE_KEY,
  setI18nLocale,
  translate,
  type AppLanguage,
  type TranslateFn,
} from '@/i18n';
import { persistStoredLanguage, readStoredLanguage } from '@/lib/language-storage';

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: TranslateFn;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

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
    void readStoredLanguage(LANGUAGE_STORE_KEY).then((stored) => {
      if (!mounted) return;
      const next = stored ?? 'hi';
      setI18nLocale(next);
      setLanguageState(next);
      if (!stored) {
        void persistStoredLanguage(LANGUAGE_STORE_KEY, 'hi');
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setLanguage = (next: AppLanguage) => {
    setI18nLocale(next);
    setLanguageState(next);
    void persistStoredLanguage(LANGUAGE_STORE_KEY, next);
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
