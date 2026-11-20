import { createTranslator, DEFAULT_LOCALE, type Locale, type Translator } from '@bairmair/i18n';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface I18nValue {
  locale: Locale;
  t: Translator;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * The app starts in Mongolian whatever the phone's language: iOS has no Mongolian system
 * language, so most phones in Mongolia run in English or Russian. English is chosen in the app.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const value = useMemo(() => ({ locale, t: createTranslator(locale), setLocale }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
