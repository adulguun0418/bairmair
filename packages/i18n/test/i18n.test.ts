import { ROOM_LABELS } from '@bairmair/room-model';
import { describe, expect, it } from 'vitest';
import {
  createTranslator,
  DEFAULT_LOCALE,
  en,
  formatArea,
  formatDecimal,
  formatFileSize,
  formatMoney,
  formatMoneyCompact,
  isLocale,
  localePath,
  mn,
  roomDisplayName,
  stripLocale,
} from '../src/index';

/** Every key path in a catalog, e.g. `viewer.resetView`. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

function leafValues(value: unknown): unknown[] {
  if (typeof value !== 'object' || value === null) return [value];
  return Object.values(value).flatMap(leafValues);
}

describe('catalogs', () => {
  it('Mongolian and English have exactly the same keys', () => {
    expect(keyPaths(en).sort()).toEqual(keyPaths(mn).sort());
  });

  it('have no empty strings', () => {
    for (const catalog of [mn, en]) {
      for (const value of leafValues(catalog)) {
        expect(typeof value).toBe('string');
        expect((value as string).trim()).not.toBe('');
      }
    }
  });

  it('use the same placeholders in both languages', () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    const enPaths = keyPaths(en);
    for (const path of enPaths) {
      const get = (catalog: unknown) =>
        path
          .split('.')
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], catalog);
      expect(placeholders(get(en) as string), path).toEqual(placeholders(get(mn) as string));
    }
  });

  it('translate every room label in RoomModel', () => {
    for (const label of ROOM_LABELS) {
      expect(mn.rooms[label]).toBeTruthy();
      expect(en.rooms[label]).toBeTruthy();
    }
  });
});

describe('createTranslator', () => {
  it('translates into each language', () => {
    expect(createTranslator('mn')('rooms.kitchen')).toBe('Гал тогоо');
    expect(createTranslator('en')('rooms.kitchen')).toBe('Kitchen');
  });

  it('interpolates values without HTML-escaping them', () => {
    const t = createTranslator('en');
    expect(t('viewer.photoInRoom', { index: 2, room: 'Kids & guests' })).toBe(
      'Photo 2: Kids & guests',
    );
  });

  it('returns the same translator for the same locale', () => {
    expect(createTranslator('mn')).toBe(createTranslator('mn'));
  });

  it('names a room by its custom name, else by its label', () => {
    const t = createTranslator('mn');
    expect(roomDisplayName(t, { label: 'bedroom' })).toBe('Унтлагын өрөө');
    expect(roomDisplayName(t, { label: 'bedroom', name: 'Хүүхдийн өрөө' })).toBe('Хүүхдийн өрөө');
  });
});

describe('formatDecimal', () => {
  it('groups thousands and drops trailing zeros', () => {
    expect(formatDecimal(0)).toBe('0');
    expect(formatDecimal(12)).toBe('12');
    expect(formatDecimal(12.5)).toBe('12.5');
    expect(formatDecimal(12.04)).toBe('12');
    expect(formatDecimal(1234567.89, 2)).toBe('1,234,567.89');
    expect(formatDecimal(1000, 0)).toBe('1,000');
  });

  it('rounds half up', () => {
    expect(formatDecimal(54.96)).toBe('55');
    expect(formatDecimal(6.55, 1)).toBe('6.6');
  });

  it('handles negative values and non-finite input', () => {
    expect(formatDecimal(-1234.5)).toBe('-1,234.5');
    expect(formatDecimal(-0.01)).toBe('0');
    expect(formatDecimal(NaN)).toBe('–');
    expect(formatDecimal(Infinity)).toBe('–');
  });
});

describe('formatArea', () => {
  it('uses the Cyrillic unit in Mongolian and a no-break space', () => {
    expect(formatArea(54.96, 'mn')).toBe('55 м²');
    expect(formatArea(16.8, 'en')).toBe('16.8 m²');
  });
});

describe('formatFileSize', () => {
  it('uses decimal units, with Cyrillic abbreviations in Mongolian', () => {
    expect(formatFileSize(512, 'mn')).toBe('512 Б');
    expect(formatFileSize(840_400, 'mn')).toBe('840 КБ');
    expect(formatFileSize(2_449_000, 'mn')).toBe('2.4 МБ');
    expect(formatFileSize(12_000_000, 'en')).toBe('12 MB');
    expect(formatFileSize(999, 'en')).toBe('999 B');
  });
});

// The formatters put a no-break space between number and unit.
const nb = (text: string) => text.replaceAll(' ', ' ');

describe('formatMoney', () => {
  it('writes tögrög after the number and dollars before it', () => {
    expect(formatMoney(250_000_000, 'MNT')).toBe(nb('250,000,000 ₮'));
    expect(formatMoney(1_800_000.4, 'MNT')).toBe(nb('1,800,000 ₮'));
    expect(formatMoney(1200, 'USD')).toBe('$1,200');
    expect(formatMoney(1200.5, 'USD')).toBe('$1,200.5');
  });
});

describe('formatMoneyCompact', () => {
  it('uses the local words in Mongolian', () => {
    expect(formatMoneyCompact(250_000_000, 'MNT', 'mn')).toBe(nb('250 сая ₮'));
    expect(formatMoneyCompact(1_800_000, 'MNT', 'mn')).toBe(nb('1.8 сая ₮'));
    expect(formatMoneyCompact(1_250_000_000, 'MNT', 'mn')).toBe(nb('1.3 тэрбум ₮'));
    expect(formatMoneyCompact(850_000, 'MNT', 'mn')).toBe(nb('850 мянга ₮'));
    expect(formatMoneyCompact(900, 'MNT', 'mn')).toBe(nb('900 ₮'));
  });

  it('uses letters in English and keeps dollars whole', () => {
    expect(formatMoneyCompact(250_000_000, 'MNT', 'en')).toBe(nb('250M ₮'));
    expect(formatMoneyCompact(1200, 'USD', 'en')).toBe('$1,200');
    expect(formatMoneyCompact(1200.6, 'USD', 'mn')).toBe('$1,201');
  });
});

describe('locale paths', () => {
  it('recognizes supported locales', () => {
    expect(DEFAULT_LOCALE).toBe('mn');
    expect(isLocale('mn')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('ru')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it('leaves Mongolian paths unprefixed and prefixes the others', () => {
    expect(localePath('mn', '/')).toBe('/');
    expect(localePath('mn', '/samples')).toBe('/samples');
    expect(localePath('en', '/')).toBe('/en');
    expect(localePath('en', '/samples')).toBe('/en/samples');
    expect(localePath('en', 'samples')).toBe('/en/samples');
  });

  it('strips a locale prefix', () => {
    expect(stripLocale('/')).toBe('/');
    expect(stripLocale('')).toBe('/');
    expect(stripLocale('/en')).toBe('/');
    expect(stripLocale('/en/')).toBe('/');
    expect(stripLocale('/en/samples/studio')).toBe('/samples/studio');
    expect(stripLocale('/mn/samples')).toBe('/samples');
    expect(stripLocale('/samples')).toBe('/samples');
    expect(stripLocale('/english')).toBe('/english');
  });
});
