import type { Metadata } from 'next';
import { ScanProView } from '@/components/scan-pro/ScanProView';
import { getI18n } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  // Not indexed while Pro is sold to testers only (until the release step).
  return { title: t('scanPro.title'), robots: { index: false } };
}

/** bairmair scan Pro with QPay (rendered in the browser; signed out → sign-in). */
export default async function ScanProPage() {
  const { locale } = await getI18n();
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <ScanProView locale={locale} />
    </div>
  );
}
