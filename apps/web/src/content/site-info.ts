import type { Locale } from '@bairmair/i18n';

/**
 * Who runs bairmair and how to reach them: shown on the about, help, terms and privacy pages.
 * Bump `legalUpdated` whenever these details change (the terms and privacy pages quote them).
 */
export const SITE_INFO = {
  operator: { mn: 'НЕКСУС КАЙРОС ХХК', en: 'NEXUS KAIROS LLC' } satisfies Record<Locale, string>,
  registrationNumber: '7203201',
  address: {
    mn: 'Монгол Улс, Улаанбаатар хот, Баянгол дүүрэг, 6-р хороо, 43-4',
    en: '43-4, Khoroo 6, Bayangol District, Ulaanbaatar, Mongolia',
  } satisfies Record<Locale, string>,
  email: 'founder@nexuskairos.com',
  phone: '+976 8611 0935',
  /** When the legal pages last changed (shown on them as "last updated"). */
  legalUpdated: '2026-11-18',
};
