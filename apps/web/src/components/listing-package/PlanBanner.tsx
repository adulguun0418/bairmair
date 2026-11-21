'use client';

import { formatProUntil, type ListingPlan } from '@bairmair/browse';
import { createTranslator, localePath, type Locale } from '@bairmair/i18n';
import Link from 'next/link';
import { useMemo } from 'react';

/**
 * The seller's listing plan above "My listings": free (n / 1) or the package's end and n / 20,
 * listings a package's end hid, and a link to the package page. Nothing while the limit does not
 * apply to this seller.
 */
export function PlanBanner({ plan, locale }: { plan: ListingPlan; locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  if (!plan.enforced) return null;
  const until = plan.packageUntil;
  const full = plan.live >= plan.limit;
  return (
    <section
      aria-label={t('listingPackage.current')}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 shadow-sm ${
        full || plan.paused > 0 ? 'bg-surface ring-2 ring-brand' : 'bg-surface'
      }`}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">
          {until
            ? t('listingPackage.bannerPackage', {
                date: formatProUntil(until, locale),
                live: plan.live,
                limit: plan.limit,
              })
            : t('listingPackage.bannerFree', { live: plan.live, limit: plan.limit })}
        </p>
        {plan.paused > 0 && (
          <p className="text-sm text-warning">
            {t('listingPackage.bannerPaused', { count: plan.paused })}
          </p>
        )}
      </div>
      <Link
        href={localePath(locale, '/my-listings/package')}
        className={
          until && !full
            ? 'rounded-full border border-line-2 px-4 py-2 text-sm font-medium hover:bg-surface-2'
            : 'rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover'
        }
      >
        {until ? t('listingPackage.bannerExtend') : t('listingPackage.bannerBuy')}
      </Link>
    </section>
  );
}
