import { DISTRICTS, SEARCH_LIMITS } from '@bairmair/db';
import type { Locale, Translator } from '@bairmair/i18n';
import { SearchIcon } from '@/components/icons';
import { localePath } from '@/lib/i18n';

/**
 * The home page's search box: buy/rent, a keyword, district and rooms. A plain GET form to
 * `/search` (the same parameters the search page reads), so it works before JavaScript loads.
 */
export function HeroSearch({ locale, t }: { locale: Locale; t: Translator }) {
  const roomCounts = Array.from({ length: SEARCH_LIMITS.roomsPlus }, (_, index) => index + 1);
  const field =
    'h-12 w-full rounded-xl bg-surface-2 px-3 text-sm text-fg outline-none ring-1 ring-transparent transition focus:bg-surface focus:ring-accent';

  return (
    <form
      action={localePath(locale, '/search')}
      method="get"
      className="rounded-3xl bg-surface/90 p-2.5 shadow-2xl shadow-primary/10 ring-1 ring-line backdrop-blur-xl"
    >
      <fieldset className="mb-2.5 inline-flex rounded-full bg-surface-2 p-1">
        <legend className="sr-only">{t('search.title')}</legend>
        {(['sale', 'rent'] as const).map((type) => (
          <label
            key={type}
            className="rounded-full px-4 py-1.5 text-sm font-medium text-fg-muted transition has-checked:bg-primary has-checked:text-on-primary has-focus-visible:ring-2 has-focus-visible:ring-accent"
          >
            <input
              type="radio"
              name="type"
              value={type}
              defaultChecked={type === 'sale'}
              className="sr-only"
            />
            {type === 'sale' ? t('home.buy') : t('home.rent')}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto]">
        <label className="relative block">
          <span className="sr-only">{t('home.searchPlaceholder')}</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            name="q"
            maxLength={100}
            placeholder={t('home.searchPlaceholder')}
            className={`${field} pl-10`}
          />
        </label>
        <label className="block">
          <span className="sr-only">{t('search.districts')}</span>
          <select name="district" defaultValue="" className={field}>
            <option value="">{t('home.anyDistrict')}</option>
            {DISTRICTS.map((district) => (
              <option key={district.slug} value={district.slug}>
                {locale === 'mn' ? district.nameMn : district.nameEn}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">{t('search.rooms')}</span>
          <select name="rooms" defaultValue="" className={field}>
            <option value="">{t('home.anyRooms')}</option>
            {roomCounts.map((count) => (
              <option key={count} value={count}>
                {count === SEARCH_LIMITS.roomsPlus
                  ? t('home.roomsPlusOption', { count })
                  : t('home.roomsOption', { count })}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-on-primary transition hover:bg-primary-hover"
        >
          <SearchIcon className="size-4" />
          {t('home.searchButton')}
        </button>
      </div>
    </form>
  );
}
