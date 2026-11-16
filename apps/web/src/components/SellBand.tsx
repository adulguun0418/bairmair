import type { Locale, Translator } from '@bairmair/i18n';
import Link from 'next/link';
import { PlusIcon } from '@/components/icons';
import { TrackClick } from '@/components/TrackClick';
import { localePath } from '@/lib/i18n';

/**
 * For sellers: a navy band with the call to add a listing. On the home page and at the end of
 * every listing page, where visitors from shared links include people with their own apartment
 * to sell.
 */
export function SellBand({
  locale,
  t,
  placement,
}: {
  locale: Locale;
  t: Translator;
  placement: 'home' | 'listing';
}) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-[#1a2b60] px-6 py-10 text-white sm:px-10 sm:py-14">
      <div
        aria-hidden
        className="absolute inset-0 text-white opacity-40 bg-blueprint [mask-image:linear-gradient(to_left,black,transparent_70%)]"
      />
      <div
        aria-hidden
        className="absolute -right-24 -top-24 size-80 rounded-full bg-[#199ed6]/40 blur-3xl"
      />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('home.sellTitle')}
          </h2>
          <p className="text-white/75">{t('home.sellBody')}</p>
        </div>
        <TrackClick event="sell_band_clicked" properties={{ placement }} className="shrink-0">
          <Link
            href={localePath(locale, '/my-listings/new')}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-[#1a2b60] transition hover:bg-[#eaf6fd] md:w-auto"
          >
            <PlusIcon className="size-5" />
            {t('home.sellCta')}
          </Link>
        </TrackClick>
      </div>
    </section>
  );
}
