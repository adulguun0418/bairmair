import type { Metadata } from 'next';
import { ListingEditor } from '@/components/my-listings/ListingEditor';
import { getI18n } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('listingForm.newTitle'), robots: { index: false } };
}

/** A new listing; it exists on the server from its first save. */
export default async function NewListingPage() {
  const { locale } = await getI18n();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <ListingEditor listingId={null} locale={locale} />
    </div>
  );
}
