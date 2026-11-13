import { DISTRICTS } from '@bairmair/db';
import Link from 'next/link';
import { ListingGrid } from '@/components/listing/ListingCard';
import { getI18n, localePath } from '@/lib/i18n';
import { publicEnv } from '@/lib/public-env';
import { DEFAULT_FILTERS, searchQuery } from '@bairmair/browse';
import { searchListings } from '@/server/search';

/** Main districts offered as shortcuts (the outlying ones are in the search filters). */
const CENTRAL_DISTRICTS = DISTRICTS.slice(0, 6);

/** Home: search entry points, then the newest 3D listings and the newest listings overall. */
export default async function HomePage() {
  const { locale, t } = await getI18n();
  const search = (query: string) => `${localePath(locale, '/search')}${query}`;
  const [with3d, newest] = await Promise.all([
    searchListings({ p_has_3d: true, p_sort: 'newest', p_limit: 4 }),
    searchListings({ p_sort: 'newest', p_limit: 8 }),
  ]);
  const supabaseUrl = publicEnv.supabaseUrl;

  return (
    <div className="mx-auto max-w-7xl space-y-12 px-4 py-10">
      <section className="space-y-6">
        <div className="max-w-2xl space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('home.title')}</h1>
          <p className="text-fg-muted">{t('home.body')}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={search('?type=sale')} className={primaryClass}>
            {t('home.searchSale')}
          </Link>
          <Link href={search('?type=rent')} className={primaryClass}>
            {t('home.searchRent')}
          </Link>
          <Link href={localePath(locale, '/samples')} className={secondaryClass}>
            {t('home.cta')}
          </Link>
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-fg-muted">{t('home.byDistrict')}</h2>
          <ul className="flex flex-wrap gap-2">
            {CENTRAL_DISTRICTS.map((district) => (
              <li key={district.slug}>
                <Link
                  href={search(searchQuery({ ...DEFAULT_FILTERS, districts: [district.slug] }))}
                  className="inline-block rounded-full border border-line-2 bg-surface px-3 py-1 text-sm hover:border-primary"
                >
                  {locale === 'mn' ? district.nameMn : district.nameEn}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {with3d.rows.length > 0 && (
        <section className="space-y-4">
          <Heading
            title={t('home.latest3d')}
            href={search(searchQuery({ ...DEFAULT_FILTERS, has3d: true, sort: 'newest' }))}
            more={t('home.seeAll')}
          />
          <ListingGrid cards={with3d.rows} locale={locale} supabaseUrl={supabaseUrl} />
        </section>
      )}

      <section className="space-y-4">
        <Heading
          title={t('home.latest')}
          href={search(searchQuery({ ...DEFAULT_FILTERS, sort: 'newest' }))}
          more={t('home.seeAll')}
        />
        {newest.rows.length === 0 ? (
          <p className="text-fg-muted">{t('home.empty')}</p>
        ) : (
          <ListingGrid cards={newest.rows} locale={locale} supabaseUrl={supabaseUrl} />
        )}
      </section>
    </div>
  );
}

function Heading({ title, href, more }: { title: string; href: string; more: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <Link href={href} className="text-sm font-medium hover:underline">
        {more}
      </Link>
    </div>
  );
}

const primaryClass =
  'rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-on-primary hover:bg-primary-hover';
const secondaryClass =
  'rounded-full border border-line-2 bg-surface px-5 py-2.5 text-sm font-medium hover:border-primary';
