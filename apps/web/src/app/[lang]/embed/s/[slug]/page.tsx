import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { EmbedSignal, ListingEmbed } from '@/components/embed/ListingEmbed';
import { getI18n } from '@/lib/i18n';
import { getSharedScan } from '@/server/shared-scan-page';

// Pinch zooms the 3D view, never the page; the room strip pads itself above the home indicator.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * A bairmair scan's 3D view and floor plan filling the viewport, for the scan app's WebView (as
 * `/embed/listings/[id]` is for bairmair). Reports `ready` or `missing` with the slug as the id
 * (see `@bairmair/browse` `embed.ts`). Same data and cache as `/s/[slug]`.
 */
export default function SharedScanEmbedPage(props: PageProps<'/[lang]/embed/s/[slug]'>) {
  return (
    <Suspense fallback={<div className="fixed inset-0 animate-pulse bg-surface-3" />}>
      <EmbedContent params={props.params} />
    </Suspense>
  );
}

async function EmbedContent({ params }: Pick<PageProps<'/[lang]/embed/s/[slug]'>, 'params'>) {
  const { slug } = await params;
  const [scan, { locale, t }] = await Promise.all([getSharedScan(slug), getI18n()]);

  if (!scan) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-surface-2 p-6 text-center text-fg-2">
        <p>{t('sharedScan.notAvailable')}</p>
        <EmbedSignal event="missing" id={slug} />
      </div>
    );
  }
  return <ListingEmbed id={slug} locale={locale} model={scan.model} photos={[]} />;
}
