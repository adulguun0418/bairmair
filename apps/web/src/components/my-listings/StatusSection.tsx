'use client';

import type { PublishRequirement } from '@bairmair/browse';
import { daysLeftInSearch, LISTING_FRESHNESS } from '@bairmair/db';
import { createTranslator, localePath, type Locale } from '@bairmair/i18n';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { confirmAvailable, setListingStatus, type MyListingRow } from '@/lib/my-listings';

type Status = MyListingRow['status'];

/**
 * Publishing: the checklist, the actions for the current status, and "still available" for
 * published listings. The database stays the judge (completeness, verified phone); the buttons
 * only offer what it would accept.
 */
export function StatusSection({
  row,
  missing,
  phoneVerified,
  unsaved,
  onRow,
  locale,
}: {
  row: MyListingRow;
  missing: readonly PublishRequirement[];
  phoneVerified: boolean;
  /** Unsaved form changes: publishing waits for them. */
  unsaved: boolean;
  onRow: (row: MyListingRow) => void;
  locale: Locale;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const change = async (status: Status, question?: string) => {
    if (question && !window.confirm(question)) return;
    setBusy(true);
    setError(null);
    try {
      onRow(await setListingStatus(row.id, status));
    } catch {
      setError(t('listingStatus.refused'));
    } finally {
      setBusy(false);
    }
  };

  const stillAvailable = async () => {
    setBusy(true);
    setError(null);
    try {
      const at = await confirmAvailable(row.id);
      onRow({ ...row, last_confirmed_at: at });
      setConfirmed(true);
    } catch {
      setError(t('listingStatus.freshness.failed'));
    } finally {
      setBusy(false);
    }
  };

  const primary =
    'rounded-full bg-stone-900 px-4 py-2 font-medium text-white hover:bg-stone-700 disabled:opacity-50';
  const secondary =
    'rounded-full border border-stone-300 px-4 py-2 font-medium hover:bg-stone-50 disabled:opacity-50';
  const statusName = t(`listings.statuses.${row.status}`);
  const live = row.status === 'published';
  const canPublish = missing.length === 0 && phoneVerified && !unsaved;
  const daysLeft = live ? daysLeftInSearch(row.last_confirmed_at, new Date()) : null;

  return (
    <div className="space-y-3">
      <p className="font-medium">{t('listingStatus.current', { status: statusName })}</p>

      {!live && (
        <>
          {missing.length > 0 ? (
            <div className="text-sm">
              <p>{t('listingForm.publishMissing')}</p>
              <ul className="mt-1 list-inside list-disc text-stone-700">
                {missing.map((item) => (
                  <li key={item}>{t(`listingForm.requirements.${item}`)}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-emerald-700">{t('listingForm.publishReady')}</p>
          )}
          {!phoneVerified && (
            <p className="text-sm text-amber-800">
              {t('listingStatus.needsPhone')}{' '}
              <Link href={localePath(locale, '/account')} className="underline">
                {t('nav.account')}
              </Link>
            </p>
          )}
          {unsaved && <p className="text-sm text-amber-800">{t('listingForm.unsaved')}</p>}
          <button
            type="button"
            disabled={busy || !canPublish}
            onClick={() => void change('published')}
            className={primary}
          >
            {row.status === 'draft' ? t('listingStatus.publish') : t('listingStatus.publishAgain')}
          </button>
        </>
      )}

      {live && (
        <>
          <p className="text-sm text-stone-600">
            {t('listingStatus.freshness.explain', { days: LISTING_FRESHNESS.confirmEveryDays })}
          </p>
          <p className="text-sm">
            {daysLeft === null
              ? t('listingStatus.freshness.hidden')
              : daysLeft === 0
                ? t('listingStatus.freshness.lastDay')
                : t('listingStatus.freshness.daysLeft', { count: daysLeft })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void stillAvailable()}
              className={primary}
            >
              {busy
                ? t('listingStatus.freshness.confirming')
                : t('listingStatus.freshness.confirm')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void change(
                  'sold_or_rented',
                  `${row.type === 'sale' ? t('listingStatus.soldTitle') : t('listingStatus.rentedTitle')}\n\n${t('listingStatus.soldBody')}`,
                )
              }
              className={secondary}
            >
              {row.type === 'sale' ? t('listingStatus.markSold') : t('listingStatus.markRented')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void change(
                  'archived',
                  `${t('listingStatus.archiveTitle')}\n\n${t('listingStatus.archiveBody')}`,
                )
              }
              className={secondary}
            >
              {t('listingStatus.archive')}
            </button>
          </div>
          {confirmed && (
            <p className="text-sm text-emerald-700">{t('listingStatus.freshness.confirmed')}</p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
