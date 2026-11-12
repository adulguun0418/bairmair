import i18next, { type TFunction } from 'i18next';
import type { RoomLabel } from '@bairmair/room-model';
import { DEFAULT_LOCALE, LOCALES, type Locale } from './locales';
import { en } from './messages/en';
import { mn, type Messages } from './messages/mn';

// Typed keys: `t('viewer.resetView')` compiles, `t('viewer.typo')` does not.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: Messages };
  }
}

export type Translator = TFunction;

const resources = {
  mn: { translation: mn },
  en: { translation: en },
} satisfies Record<Locale, { translation: Messages }>;

const translators = new Map<Locale, Translator>();

/**
 * Returns a translation function for one locale. Synchronous: all catalogs are bundled.
 * Translators are shared, because the language of an instance never changes.
 */
export function createTranslator(locale: Locale): Translator {
  let t = translators.get(locale);
  if (!t) {
    const instance = i18next.createInstance();
    void instance.init({
      lng: locale,
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: [...LOCALES],
      resources,
      initAsync: false,
      // React and the floor-plan renderer escape output themselves.
      interpolation: { escapeValue: false },
    });
    t = instance.getFixedT(locale);
    translators.set(locale, t);
  }
  return t;
}

/** The name shown for a room: the user's own name for it, otherwise its translated label. */
export function roomDisplayName(t: Translator, room: { label: RoomLabel; name?: string }): string {
  return room.name ?? t(`rooms.${room.label}`);
}
