import Link from 'next/link';
import { getI18n, localePath } from '@/lib/i18n';

export default async function NotFound() {
  const { locale, t } = await getI18n();
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
      <Link href={localePath(locale, '/')} className="mt-4 inline-block text-sm underline">
        {t('notFound.back')}
      </Link>
    </section>
  );
}
