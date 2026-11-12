import { createTranslator, isLocale } from '@bairmair/i18n';
import { notFound } from 'next/navigation';
import { lang } from 'next/root-params';

export { localePath } from '@bairmair/i18n/locales';

/** The current locale and its translator, for Server Components. */
export async function getI18n() {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  return { locale, t: createTranslator(locale) };
}
