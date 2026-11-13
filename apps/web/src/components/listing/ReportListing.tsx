'use client';

import { UNIQUE_VIOLATION } from '@bairmair/browse';
import { Constants, type Enums } from '@bairmair/db';
import { createTranslator, type Locale } from '@bairmair/i18n';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { currentPath, signInHref } from '@/components/auth/sign-in-href';
import { browserClient } from '@/lib/supabase-browser';

type Reason = Enums<'report_reason'>;
type Result = 'sent' | 'already' | 'failed' | null;

/** `reports.details` CHECK constraint. */
const MAX_DETAILS = 2000;

/**
 * "Report this listing": a reason and optional details, for signed-in visitors (RLS). One
 * report per visitor and listing; a second one says it was already reported. Hidden on the
 * visitor's own listing.
 */
export function ReportListing({
  listingId,
  ownerId,
  locale,
}: {
  listingId: string;
  ownerId: string;
  locale: Locale;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const { session, ready } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  if (!ready || session?.user.id === ownerId) return null;

  const link = 'text-sm text-fg-subtle underline hover:text-fg-2';
  if (!session) {
    return (
      <button
        type="button"
        onClick={() => router.push(signInHref(locale, currentPath()))}
        className={link}
      >
        {t('report.button')}
      </button>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={link}>
        {t('report.button')}
      </button>
    );
  }
  if (result === 'sent' || result === 'already') {
    return (
      <p role="status" className="text-sm text-fg-2">
        {result === 'sent' ? t('report.sent') : t('report.already')}
      </p>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason) return;
    setBusy(true);
    setResult(null);
    const trimmed = details.trim();
    const { error } = await browserClient()
      .from('reports')
      .insert({ listing_id: listingId, reason, details: trimmed || null });
    setBusy(false);
    setResult(!error ? 'sent' : error.code === UNIQUE_VIOLATION ? 'already' : 'failed');
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3 text-sm">
      <fieldset className="space-y-1.5">
        <legend className="mb-1 font-medium">{t('report.reason')}</legend>
        {Constants.public.Enums.report_reason.map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="reason"
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
            />
            {t(`report.reasons.${value}`)}
          </label>
        ))}
      </fieldset>
      <label className="block space-y-1">
        <span className="font-medium">{t('report.details')}</span>
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder={t('report.detailsPlaceholder')}
          maxLength={MAX_DETAILS}
          rows={3}
          className="w-full rounded-lg border border-line-2 p-2"
        />
      </label>
      {result === 'failed' && (
        <p role="alert" className="text-danger">
          {t('report.failed')}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!reason || busy}
          className="rounded-full bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? t('report.sending') : t('report.submit')}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-line-2 px-4 py-2 hover:bg-surface-2"
        >
          {t('report.close')}
        </button>
      </div>
    </form>
  );
}
