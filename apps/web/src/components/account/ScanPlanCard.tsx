'use client';

import { fetchScanPlan, formatProUntil, type ScanPlan } from '@bairmair/browse';
import { createTranslator, localePath, type Locale } from '@bairmair/i18n';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase-browser';

const card = 'space-y-3 rounded-2xl bg-surface p-5 shadow-sm';
const secondary =
  'inline-block rounded-full border border-line-2 px-4 py-2 font-medium hover:bg-surface-2';

/**
 * The account's bairmair scan plan (free n / 2, or Pro until …) with a link to `/scan-pro`.
 * Shown only to people who use bairmair scan (a scan kept, or Pro), so marketplace-only
 * accounts do not see it.
 */
export function ScanPlanCard({ userId, locale }: { userId: string; locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [plan, setPlan] = useState<ScanPlan | null>(null);

  useEffect(() => {
    let active = true;
    fetchScanPlan(browserClient())
      .then((next) => active && setPlan(next))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  if (!plan || (plan.kept === 0 && !plan.proUntil)) return null;

  return (
    <section className={card}>
      <h2 className="font-semibold">{t('account.scanPlan.title')}</h2>
      <p>
        {plan.proUntil
          ? t('account.scanPlan.pro', {
              date: formatProUntil(plan.proUntil, locale),
              kept: plan.kept,
            })
          : t('account.scanPlan.free', { kept: plan.kept, limit: plan.limit })}
      </p>
      <Link href={localePath(locale, '/scan-pro')} className={secondary}>
        {plan.proUntil ? t('account.scanPlan.extend') : t('account.scanPlan.upgrade')}
      </Link>
    </section>
  );
}
