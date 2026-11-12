import Link from 'next/link';
import { getI18n, localePath } from '@/lib/i18n';

// Placeholder home page until search and listings exist (build step 6).
export default async function HomePage() {
  const { locale, t } = await getI18n();
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
        {t('home.title')}
      </h1>
      <p className="mt-4 max-w-2xl text-stone-600">{t('home.body')}</p>
      <Link
        href={localePath(locale, '/samples')}
        className="mt-8 inline-block rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700"
      >
        {t('home.cta')}
      </Link>
    </section>
  );
}
