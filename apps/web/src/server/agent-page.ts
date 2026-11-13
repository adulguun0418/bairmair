import type { SearchListingRow } from '@bairmair/db';
import { cacheLife, cacheTag } from 'next/cache';
import { isUuid } from '@/lib/ids';
import { publicClient } from '@/lib/supabase-public';
import { searchListings } from './search';

/** Listings shown on an agent page (no paging in the MVP). */
const AGENT_LISTINGS_LIMIT = 96;

export interface AgentPageData {
  id: string;
  displayName: string | null;
  agencyName: string;
  bio: string | null;
  verified: boolean;
  /** When the person joined (their profile was created). */
  since: string;
  /** Live listings in search, newest first. */
  listings: SearchListingRow[];
  listingCount: number;
}

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
  cacheTag(agentTag(id));

  if (!isUuid(id)) return null;
  const { data, error } = await publicClient()
    .from('profiles')
    .select('id, display_name, role, created_at, agent_profiles(agency_name, bio, verified)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`agent ${id}: ${error.message}`);
  const agent = data?.agent_profiles;
  if (!data || data.role !== 'agent' || !agent) return null;

  const { rows, total } = await searchListings({
    p_owner_id: id,
    p_sort: 'newest',
    p_limit: AGENT_LISTINGS_LIMIT,
  });
  return {
    id: data.id,
    displayName: data.display_name,
    agencyName: agent.agency_name,
    bio: agent.bio,
    verified: agent.verified,
    since: data.created_at,
    listings: rows,
    listingCount: total,
  };
}
