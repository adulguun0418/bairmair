import type { Metadata } from 'next';
import { PaymentTestView } from '@/components/payments/PaymentTestView';
import { getI18n } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('payments.testTitle'), robots: { index: false } };
}

/** A real-money QPay check for testers (rendered in the browser; signed out → sign-in). */
export default async function PaymentTestPage() {
  const { locale } = await getI18n();
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <PaymentTestView locale={locale} />
    </div>
  );
}
