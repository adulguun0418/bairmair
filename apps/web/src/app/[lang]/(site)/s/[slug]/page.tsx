import { formatArea, formatDate, type Locale } from '@bairmair/i18n';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CubeIcon } from '@/components/icons';
import { ListingScene } from '@/components/ListingScene';
import { getI18n, localePath } from '@/lib/i18n';
import { contentVersion } from '@/lib/og-version';
import { publicEnv } from '@/lib/public-env';
import { getSharedScan } from '@/server/shared-scan-page';

export async function generateMetadata({
  params,
}: PageProps<'/[lang]/s/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const [scan, { locale, t }] = await Promise.all([getSharedScan(slug), getI18n()]);
  // Private links: never indexed, whatever happens to them.
  const robots = { index: false, follow: false };
  if (!scan) return { title: t('sharedScan.title'), robots };

  const area = formatArea(scan.metrics.totalAreaM2, locale);
  const title = scan.title ? `${scan.title} · ${area}` : `${t('sharedScan.title')} · ${area}`;
  const description = t('sharedScan.description', { area });
  const version = contentVersion([
    1,
    scan.title,
    scan.metrics.totalAreaM2,
    scan.model.rooms.map((room) => [room.id, room.label, room.name]),
  ]);
  const image = {
    url: `/api/og/s/${slug}?v=${version}${locale === 'mn' ? '' : `&lang=${locale}`}`,
    width: 1200,
    height: 630,
    alt: title,
  };
  const url = sharedScanUrl(locale, slug);
  return {
    title,
    description,
    robots,
    alternates: { canonical: url },
    openGraph: { type: 'website', title, description, url, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

/**
 * The private link of a bairmair scan: the 3D model, floor plan and rooms, nothing about the
 * owner. Anyone with the link can open it; it is `noindex` and appears nowhere on the site.
 * The slug is read inside `<Suspense>` (one shell for every link, as listing pages do).
 */
export default function SharedScanPage(props: PageProps<'/[lang]/s/[slug]'>) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Suspense
        fallback={
          <div className="space-y-4" aria-hidden>
            <div className="h-10 w-1/2 rounded-xl bg-shimmer" />
            <div className="h-[min(62vh,34rem)] rounded-3xl bg-shimmer" />
          </div>
        }
      >
        <SharedScanContent params={props.params} />
      </Suspense>
    </div>
  );
}

async function SharedScanContent({ params }: Pick<PageProps<'/[lang]/s/[slug]'>, 'params'>) {
  const { slug } = await params;
  const [scan, { locale, t }] = await Promise.all([getSharedScan(slug), getI18n()]);

  if (!scan) {
    return (
      <section className="mx-auto max-w-xl py-16 text-center">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-accent-soft text-brand">
          <CubeIcon className="size-7" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{t('sharedScan.title')}</h1>
        <p className="mt-3 text-fg-muted">{t('sharedScan.notAvailable')}</p>
      </section>
    );
  }

  return (
    <article className="space-y-5">
      <header className="space-y-2">
        <p className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary">
          <CubeIcon className="size-4" />
          {t('sharedScan.title')}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {scan.title ?? formatArea(scan.metrics.totalAreaM2, locale)}
        </h1>
        <p className="text-sm text-fg-muted">
          {t('sharedScan.scannedOn', { date: formatDate(scan.createdAt, locale) })}
          {scan.title ? ` · ${formatArea(scan.metrics.totalAreaM2, locale)}` : ''}
        </p>
      </header>

      <ListingScene locale={locale} model={scan.model} photos={[]} />

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm text-fg-muted">
        <p>{t('sharedScan.privateNote')}</p>
        <p className="font-medium text-fg-2">{t('sharedScan.madeWith')}</p>
      </footer>
    </article>
  );
}

function sharedScanUrl(locale: Locale, slug: string): string {
  return `${publicEnv.siteUrl}${localePath(locale, `/s/${slug}`)}`;
}
