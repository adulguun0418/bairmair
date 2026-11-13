import { loadAgentPage, type AgentPageData } from '@bairmair/browse';
import { cacheLife, cacheTag } from 'next/cache';
import { publicClient } from '@/lib/supabase-public';
import { SEARCH_TAG } from './search';

export type { AgentPageData };

/** Cache tag of one agent page. */
export function agentTag(id: string): string {
  return `agent:${id}`;
}

/**
 * An agent's public page, or null when the id is not an agent. Owners who are not agents have
 * no public page. Read as `anon`; cached for a minute.
 */
export async function getAgentPage(id: string): Promise<AgentPageData | null> {
  'use cache';
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 });
  cacheTag(agentTag(id), SEARCH_TAG);
  return loadAgentPage(publicClient(), id);
}
