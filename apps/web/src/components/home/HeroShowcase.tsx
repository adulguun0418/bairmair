'use client';

import type { Locale } from '@bairmair/i18n';
import { computeMetrics, type RoomModelV1 } from '@bairmair/room-model';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRightIcon, CubeIcon } from '@/components/icons';
import { useViewerText } from '@/components/viewer/use-viewer-text';

// three.js is large and needs WebGL: load it in the browser only, after the page.
const RoomViewer3D = dynamic(
  () => import('@bairmair/viewer/3d').then((module) => module.RoomViewer3D),
  { ssr: false, loading: () => <ShowcaseLoading /> },
);

export interface ShowcaseListing {
  href: string;
  price: string;
  facts: string;
}

/**
 * The home page's eye-catcher: a scanned apartment turning slowly in 3D, with its floor plan
 * and price floating over it. A real live listing when one has a scan, otherwise a sample.
 */
export function HeroShowcase({
  locale,
  model,
  planSvg,
  listing,
  sampleHref,
}: {
  locale: Locale;
  model: RoomModelV1;
  /** The floor plan drawing (our own SVG, from `renderFloorPlanSvg`). */
  planSvg: string;
  /** The listing shown, or null for the sample. */
  listing: ShowcaseListing | null;
  sampleHref: string;
}) {
  const { t, text } = useViewerText(locale);
  const sampleFacts = useMemo(
    () => `${text.area(computeMetrics(model).totalAreaM2)} · ${t('viewer.view3d')}`,
    [model, text, t],
  );

  return (
    <div className="relative">
      <section
        aria-label={t('home.showcaseLabel')}
        className="relative h-[24rem] overflow-hidden rounded-[2rem] bg-gradient-to-b from-scene-from to-scene-to shadow-2xl shadow-primary/15 ring-1 ring-line sm:h-[30rem] lg:h-[34rem]"
      >
        <div className="absolute inset-0 text-primary opacity-60 bg-blueprint [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <RoomViewer3D model={model} text={text} mode="showcase" />
        <span className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-[#1a2b60]/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#7fd0f3] opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-[#7fd0f3]" />
          </span>
          {listing ? t('home.showcaseLive') : t('home.showcaseSample')}
        </span>
        <span className="pointer-events-none absolute bottom-4 right-4 hidden rounded-full bg-white/80 px-3 py-1 text-xs text-[#525d78] backdrop-blur sm:block">
          {t('home.showcaseDrag')}
        </span>
      </section>

      {/* Floor plan card, overlapping the top right corner. */}
      <div
        aria-hidden
        className="absolute -right-3 -top-6 hidden w-40 rounded-2xl bg-white p-2.5 shadow-xl ring-1 ring-black/5 animate-drift sm:block lg:-right-6 lg:w-48"
      >
        <div
          className="aspect-square [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: planSvg }}
        />
      </div>

      {/* Price card, overlapping the bottom left corner. */}
      <Link
        href={listing?.href ?? sampleHref}
        className="group absolute -bottom-6 left-4 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-surface/95 p-3 pr-4 shadow-xl ring-1 ring-line backdrop-blur transition hover:-translate-y-0.5 sm:-left-4 lg:-left-8"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-accent">
          <CubeIcon className="size-6" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-lg font-semibold tracking-tight">
            {listing ? listing.price : t('home.showcaseSample')}
          </span>
          <span className="block truncate text-sm text-fg-muted">
            {listing ? listing.facts : sampleFacts}
          </span>
        </span>
        <span className="ml-1 inline-flex shrink-0 items-center gap-1 text-sm font-medium text-accent">
          <span className="hidden sm:inline">
            {listing ? t('home.showcaseOpen') : t('home.showcaseSampleOpen')}
          </span>
          <ArrowRightIcon className="size-4 transition group-hover:translate-x-0.5" />
        </span>
      </Link>
    </div>
  );
}

function ShowcaseLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="size-10 animate-spin rounded-full border-2 border-[#1a2b60]/15 border-t-[#199ed6]" />
    </div>
  );
}
