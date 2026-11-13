import type { Locale, Translator } from '@bairmair/i18n';
import Link from 'next/link';
import { Suspense } from 'react';
import { Logo } from '@/components/header/Logo';
import { LanguageLinks, LanguageLinksView, type LanguageProps } from '@/components/LanguageSwitch';
import { ThemeSelect } from '@/components/ThemeSwitch';
import { localePath } from '@/lib/i18n';

/**
 * Footer: brand, link columns (browse, company, legal), then copyright, language and theme.
 * The about, help, terms, privacy and account-deletion pages are what store reviews ask for.
 */
export function SiteFooter({
  locale,
  t,
  language,
  year,
}: {
  locale: Locale;
  t: Translator;
  language: LanguageProps;
  year: number;
}) {
  const href = (path: string) => localePath(locale, path);
  const columns = [
    {
      title: t('footer.browse'),
      links: [
        { label: t('nav.sale'), href: href('/search?type=sale') },
        { label: t('nav.rent'), href: href('/search?type=rent') },
        { label: t('nav.map'), href: href('/search?view=map') },
        { label: t('nav.samples'), href: href('/samples') },
      ],
    },
    {
      title: t('footer.company'),
      links: [
        { label: t('footer.about'), href: href('/about') },
        { label: t('footer.support'), href: href('/support') },
        { label: t('nav.postListing'), href: href('/my-listings/new') },
      ],
    },
    {
      title: t('footer.legal'),
      links: [
        { label: t('footer.terms'), href: href('/terms') },
        { label: t('footer.privacy'), href: href('/privacy') },
        { label: t('footer.deleteAccount'), href: href('/delete-account') },
      ],
    },
  ];

  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="col-span-2 max-w-xs space-y-3 md:col-span-1">
            <Link href={href('/')} className="inline-block">
              <Logo alt={t('app.name')} className="h-7 w-auto" />
            </Link>
            <p className="text-sm leading-6 text-fg-muted">{t('app.tagline')}</p>
          </div>
          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-semibold">{column.title}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-fg-muted transition-colors hover:text-fg"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col-reverse gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-fg-subtle">{t('footer.rights', { year })}</p>
          <div className="flex items-center gap-5">
            <Suspense fallback={<LanguageLinksView {...language} path="/" />}>
              <LanguageLinks {...language} />
            </Suspense>
            <ThemeSelect locale={locale} />
          </div>
        </div>
      </div>
    </footer>
  );
}
