import { formatArea, roomDisplayName } from '@bairmair/i18n';
import { computeMetrics, renderFloorPlanSvg, type FloorPlanText } from '@bairmair/room-model';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getI18n, localePath } from '@/lib/i18n';
import { getSample, SAMPLE_NAMES } from '@/lib/samples';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('samples.title') };
}

export default async function SamplesPage() {
  const { locale, t } = await getI18n();
  const text: FloorPlanText = {
    roomName: (room) => roomDisplayName(t, room),
    area: (squareMeters) => formatArea(squareMeters, locale),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t('samples.title')}</h1>
      <p className="mt-2 max-w-2xl text-fg-muted">{t('samples.intro')}</p>
      <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {SAMPLE_NAMES.map((name) => {
          const { model } = getSample(name);
          const title = t(`samples.names.${name}`);
          // Rendered on the server: the plan is plain SVG in the HTML, no JavaScript needed.
          const svg = renderFloorPlanSvg(model, { text, title, showHotspots: false });
          return (
            <li key={name}>
              <Link
                href={localePath(locale, `/samples/${name}`)}
                className="block overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-line transition hover:shadow-md"
              >
                <div className="aspect-[4/3] p-2" dangerouslySetInnerHTML={{ __html: svg }} />
                <div className="flex items-baseline justify-between gap-3 border-t border-line p-4">
                  <h2 className="font-medium">{title}</h2>
                  <span className="shrink-0 text-sm text-fg-muted">
                    {formatArea(computeMetrics(model).totalAreaM2, locale)}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
