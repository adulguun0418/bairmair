import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ListingScene } from '@/components/ListingScene';
import { getI18n, localePath } from '@/lib/i18n';
import { getSample, isSampleName, SAMPLE_NAMES } from '@/lib/samples';

export async function generateStaticParams() {
  return SAMPLE_NAMES.map((sample) => ({ sample }));
}

export async function generateMetadata({
  params,
}: PageProps<'/[lang]/samples/[sample]'>): Promise<Metadata> {
  const { sample } = await params;
  if (!isSampleName(sample)) return {};
  const { t } = await getI18n();
  return { title: t(`samples.names.${sample}`) };
}

export default async function SamplePage({ params }: PageProps<'/[lang]/samples/[sample]'>) {
  const { sample } = await params;
  if (!isSampleName(sample)) notFound();
  const { locale, t } = await getI18n();
  const { model, photos } = getSample(sample);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link
        href={localePath(locale, '/samples')}
        className="text-sm text-stone-600 hover:underline"
      >
        ← {t('samples.title')}
      </Link>
      <h1 className="mt-2 mb-5 text-2xl font-semibold tracking-tight">
        {t(`samples.names.${sample}`)}
      </h1>
      <ListingScene locale={locale} model={model} photos={photos} />
    </div>
  );
}
