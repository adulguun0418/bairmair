import type { Metadata } from 'next';
import { SavedListings } from '@/components/account/SavedListings';
import { getI18n } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('favorites.title'), robots: { index: false } };
}

/** The signed-in visitor's saved listings (rendered in the browser; signed out → sign-in). */
export default async function SavedPage() {
  const { locale, t } = await getI18n();
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">{t('favorites.title')}</h1>
      <SavedListings locale={locale} />
    </div>
  );
}
