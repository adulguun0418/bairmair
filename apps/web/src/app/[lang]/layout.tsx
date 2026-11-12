import { LOCALES } from '@bairmair/i18n/locales';
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import Link from 'next/link';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { getI18n, localePath } from '@/lib/i18n';
import '../globals.css';

// Mongolian needs Ө and Ү, which are in the extended Cyrillic subset.
const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
});

export async function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t('app.name'), template: `%s · ${t('app.name')}` },
    description: t('app.tagline'),
  };
}

export default async function RootLayout({ children }: LayoutProps<'/[lang]'>) {
  const { locale, t } = await getI18n();
  return (
    <html lang={locale} className={`${geist.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-stone-50 text-stone-900">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href={localePath(locale, '/')} className="text-lg font-semibold tracking-tight">
              {t('app.name')}
            </Link>
            <nav className="flex items-center gap-5 text-sm">
              <Link href={localePath(locale, '/samples')} className="hover:underline">
                {t('nav.samples')}
              </Link>
              <LanguageSwitch
                current={locale}
                label={t('language.label')}
                names={{ mn: t('language.mn'), en: t('language.en') }}
              />
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
