import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ListingGrid } from '@/components/listing/ListingCard';
import { getI18n, localePath } from '@/lib/i18n';
import { publicEnv } from '@/lib/public-env';
import { getAgentPage } from '@/server/agent-page';

export async function generateMetadata({
  params,
}: PageProps<'/[lang]/agents/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const agent = await getAgentPage(id);
  if (!agent) return {};
  const { locale, t } = await getI18n();
  const url = `${publicEnv.siteUrl}${localePath(locale, `/agents/${id}`)}`;
  return {
    title: agent.agencyName,
    description: agent.bio?.slice(0, 200) ?? t('agentPage.agent'),
    alternates: { canonical: url },
    openGraph: { type: 'profile', title: agent.agencyName, url },
  };
}

/** An agent's public page: agency, bio and their live listings. */
export default function AgentPage(props: PageProps<'/[lang]/agents/[id]'>) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-stone-200" />}>
        <AgentContent params={props.params} />
      </Suspense>
    </div>
  );
}

async function AgentContent({ params }: Pick<PageProps<'/[lang]/agents/[id]'>, 'params'>) {
  const { id } = await params;
  const agent = await getAgentPage(id);
  if (!agent) notFound();
  const { locale, t } = await getI18n();

  return (
    <div className="space-y-8">
      <header className="space-y-3 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-stone-200 px-3 py-1 text-stone-800">
            {t('agentPage.agent')}
          </span>
          {agent.verified && (
            <span
              title={t('agentPage.verifiedHint')}
              className="rounded-full bg-amber-200 px-3 py-1 text-amber-950"
            >
              {t('agentPage.verified')}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{agent.agencyName}</h1>
        {agent.displayName && <p className="text-stone-700">{agent.displayName}</p>}
        <p className="text-sm text-stone-500">
          {t('agentPage.since', { year: new Date(agent.since).getUTCFullYear() })}
        </p>
        {agent.bio && (
          <div className="border-t border-stone-100 pt-3">
            <h2 className="mb-1 text-sm font-medium text-stone-500">{t('agentPage.about')}</h2>
            <p className="max-w-3xl whitespace-pre-line text-stone-800">{agent.bio}</p>
          </div>
        )}
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          {t('agentPage.listings')}
          {agent.listingCount > 0 && (
            <span className="ml-2 text-base font-normal text-stone-500">
              {t('search.results', { count: agent.listingCount })}
            </span>
          )}
        </h2>
        {agent.listings.length === 0 ? (
          <p className="text-stone-600">{t('agentPage.noListings')}</p>
        ) : (
          <ListingGrid cards={agent.listings} locale={locale} supabaseUrl={publicEnv.supabaseUrl} />
        )}
      </section>
    </div>
  );
}
