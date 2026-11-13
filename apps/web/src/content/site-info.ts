import type { Locale } from '@bairmair/i18n';

/**
 * Who runs bairmair and how to reach them: shown on the about, help, terms and privacy pages.
 *
 * TODO before the store review: replace every value in [brackets] with the real details
 * (registered company name and number, address, support e-mail and phone).
 */
export const SITE_INFO = {
  operator: { mn: '[Компанийн нэр] ХХК', en: '[Company name] LLC' } satisfies Record<
    Locale,
    string
  >,
  registrationNumber: '[Регистрийн дугаар]',
  address: {
    mn: '[Хаяг], Улаанбаатар, Монгол Улс',
    en: '[Address], Ulaanbaatar, Mongolia',
  } satisfies Record<Locale, string>,
  email: 'support@[domain]',
  phone: '[+976 0000 0000]',
  /** When the legal pages last changed (shown on them as "last updated"). */
  legalUpdated: '2026-11-13',
};
