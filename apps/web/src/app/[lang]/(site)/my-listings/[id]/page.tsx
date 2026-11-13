import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ListingEditor } from '@/components/my-listings/ListingEditor';
import { getI18n } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('listingForm.editTitle'), robots: { index: false } };
}

/** Edit one of the signed-in seller's listings. */
export default function EditListingPage(props: PageProps<'/[lang]/my-listings/[id]'>) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface-3" />}>
        <Editor params={props.params} />
      </Suspense>
    </div>
  );
}

async function Editor({ params }: Pick<PageProps<'/[lang]/my-listings/[id]'>, 'params'>) {
  const { id } = await params;
  const { locale } = await getI18n();
  return <ListingEditor key={id} listingId={id} locale={locale} />;
}
