import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignInForm } from '@/components/auth/SignInForm';
import { getI18n } from '@/lib/i18n';
import { publicEnv } from '@/lib/public-env';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('auth.title'), robots: { index: false } };
}

/** Phone sign-in (`?next=` is where to return afterwards). */
export default async function SignInPage() {
  const { locale } = await getI18n();
  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-3" />}>
        <SignInForm locale={locale} siteKey={publicEnv.turnstileSiteKey} />
      </Suspense>
    </div>
  );
}
