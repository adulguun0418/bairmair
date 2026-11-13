import type { Metadata } from 'next';
import { MyListings } from '@/components/my-listings/MyListings';
import { getI18n } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('listings.title'), robots: { index: false } };
}

/** The signed-in seller's listings (rendered in the browser; signed out → sign-in). */
export default async function MyListingsPage() {
  const { locale } = await getI18n();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <MyListings locale={locale} />
    </div>
  );
}
