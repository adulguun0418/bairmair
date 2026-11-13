import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { EmbedSignal, ListingEmbed } from '@/components/embed/ListingEmbed';
import { getI18n } from '@/lib/i18n';
import { getListingPage } from '@/server/listing-page';

// Pinch zooms the 3D view, never the page; the room strip pads itself above the home indicator.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export async function generateMetadata({
  params,
}: PageProps<'/[lang]/embed/listings/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const page = await getListingPage(id);
  // The listing page is the address to share and index; this one is for the app.
  return { title: page?.listing.title, robots: { index: false, follow: false } };
}

/**
 * A listing's 3D view and floor plan on their own, filling the viewport: the mobile app shows
 * this page in a WebView, so the 3D experience is built once. It reports `ready`, `missing` or
 * `no-model` to the app (see `@bairmair/browse` `embed.ts`).
 *
 * Same data and cache as the listing page; RLS decides what is public.
 */
export default function ListingEmbedPage(props: PageProps<'/[lang]/embed/listings/[id]'>) {
  return (
    <Suspense fallback={<div className="fixed inset-0 animate-pulse bg-stone-200" />}>
      <EmbedContent params={props.params} />
    </Suspense>
  );
}

async function EmbedContent({ params }: Pick<PageProps<'/[lang]/embed/listings/[id]'>, 'params'>) {
  const { id } = await params;
  const [page, { locale, t }] = await Promise.all([getListingPage(id), getI18n()]);

  if (!page?.model) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-stone-100 p-6 text-center text-stone-700">
        <p>{page ? t('viewer.noModel') : t('browse.notFound')}</p>
        <EmbedSignal event={page ? 'no-model' : 'missing'} listingId={id} />
      </div>
    );
  }

  const photos = page.photos.flatMap((photo) =>
    photo.roomId ? [{ id: photo.id, roomId: photo.roomId, src: photo.src }] : [],
  );
  return <ListingEmbed listingId={id} locale={locale} model={page.model} photos={photos} />;
}
