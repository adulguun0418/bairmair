import { localePath, stripLocale, type Locale } from '@bairmair/i18n/locales';

export type NavKey = 'sale' | 'rent' | 'map';

/** The site's main sections, as `nav.<key>` labels and their links. */
export function navItems(locale: Locale): { key: NavKey; href: string }[] {
  return [
    { key: 'sale', href: localePath(locale, '/search?type=sale') },
    { key: 'rent', href: localePath(locale, '/search?type=rent') },
    { key: 'map', href: localePath(locale, '/search?view=map') },
  ];
}

/** Which main section a URL belongs to: the map view first, then sale or rent searches. */
export function activeNav(pathname: string, params: URLSearchParams): NavKey | null {
  if (stripLocale(pathname) !== '/search') return null;
  if (params.get('view') === 'map') return 'map';
  const type = params.get('type');
  return type === 'sale' || type === 'rent' ? type : null;
}
