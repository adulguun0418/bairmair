import type { Metadata } from 'next';
import { AccountView } from '@/components/account/AccountView';
import { getI18n } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('account.title'), robots: { index: false } };
}

/** The signed-in visitor's account (rendered in the browser; signed out → sign-in). */
export default async function AccountPage() {
  const { locale } = await getI18n();
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <AccountView locale={locale} />
    </div>
  );
}
