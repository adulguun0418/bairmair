import { formatDate, type Locale, type Translator } from '@bairmair/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_INFO } from '@/content/site-info';
import type { ContentBlock, ContentPage } from '@/content/types';
import { getI18n, localePath } from '@/lib/i18n';

/** Metadata for a content page in the current language. */
export async function contentMetadata(page: Record<Locale, ContentPage>): Promise<Metadata> {
  const { locale } = await getI18n();
  const { title, description } = page[locale];
  return { title, description };
}

/** A long-form page: title, lead, optional "last updated" and contents, then the sections. */
export async function ContentView({ page }: { page: Record<Locale, ContentPage> }) {
  const { locale, t } = await getI18n();
  const { title, description, legal, sections } = page[locale];
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="space-y-3 border-b border-line pb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="text-lg text-fg-muted">{description}</p>
        {legal && (
          <p className="text-sm text-fg-subtle">
            {t('legal.updated', { date: formatDate(SITE_INFO.legalUpdated, locale) })}
          </p>
        )}
      </header>

      {legal && (
        <nav aria-label={t('legal.contents')} className="mt-8 rounded-2xl bg-surface-2 p-5">
          <h2 className="text-sm font-medium text-fg-muted">{t('legal.contents')}</h2>
          <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-fg-2 hover:text-fg hover:underline">
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="mt-10 space-y-10">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
            {section.blocks.map((block, index) => (
              <Block key={index} block={block} locale={locale} t={t} />
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}

function Block({ block, locale, t }: { block: ContentBlock; locale: Locale; t: Translator }) {
  if (typeof block === 'string') return <p className="leading-7 text-fg-2">{block}</p>;
  if ('list' in block) {
    return (
      <ul className="list-disc space-y-2 pl-5 leading-7 text-fg-2 marker:text-fg-subtle">
        {block.list.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  if ('link' in block) {
    return (
      <Link
        href={localePath(locale, block.link.href)}
        className="inline-flex rounded-full border border-line-2 px-4 py-2 text-sm font-medium hover:bg-surface-2"
      >
        {block.link.label} →
      </Link>
    );
  }
  return <ContactCard locale={locale} t={t} />;
}

/** Operator, e-mail, phone and address (`SITE_INFO`). */
function ContactCard({ locale, t }: { locale: Locale; t: Translator }) {
  return (
    <dl className="grid gap-3 rounded-2xl border border-line bg-surface p-5 text-sm sm:grid-cols-2">
      <div className="sm:col-span-2">
        <dt className="text-fg-subtle">{t('contact.operator')}</dt>
        <dd className="font-medium">{SITE_INFO.operator[locale]}</dd>
      </div>
      <div>
        <dt className="text-fg-subtle">{t('contact.email')}</dt>
        <dd>
          <a href={`mailto:${SITE_INFO.email}`} className="font-medium hover:underline">
            {SITE_INFO.email}
          </a>
        </dd>
      </div>
      <div>
        <dt className="text-fg-subtle">{t('contact.phone')}</dt>
        <dd>
          <a
            href={`tel:${SITE_INFO.phone.replace(/[^+\d]/g, '')}`}
            className="font-medium hover:underline"
          >
            {SITE_INFO.phone}
          </a>
        </dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-fg-subtle">{t('contact.address')}</dt>
        <dd>{SITE_INFO.address[locale]}</dd>
      </div>
    </dl>
  );
}
