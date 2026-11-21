import type { Metadata } from 'next';
import { ListingPackageView } from '@/components/listing-package/ListingPackageView';
import { getI18n } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('listingPackage.title'), robots: { index: false } };
}

/** The listing package with QPay (rendered in the browser; signed out → sign-in). */
export default async function ListingPackagePage() {
  const { locale } = await getI18n();
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <ListingPackageView locale={locale} />
    </div>
  );
}
