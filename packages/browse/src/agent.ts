import type { SearchListingRow, TypedSupabaseClient } from '@bairmair/db';
import { isUuid } from './listing-page';

/** Listings shown on an agent page (no paging in the MVP). */
export const AGENT_LISTINGS_LIMIT = 96;

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

/**
 * An agent's public page, or null when the id is not an agent. Owners who are not agents have
 * no public page.
 */
export async function loadAgentPage(
  client: TypedSupabaseClient,
  id: string,
): Promise<AgentPageData | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await client
    .from('profiles')
    .select('id, display_name, role, created_at, agent_profiles(agency_name, bio, verified)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`agent ${id}: ${error.message}`);
  const agent = data?.agent_profiles;
  if (!data || data.role !== 'agent' || !agent) return null;

  const listings = await client.rpc('search_listings', {
    p_owner_id: id,
    p_sort: 'newest',
    p_limit: AGENT_LISTINGS_LIMIT,
  });
  if (listings.error) throw new Error(`listings of agent ${id}: ${listings.error.message}`);
  const rows = listings.data as unknown as SearchListingRow[];
  return {
    id: data.id,
    displayName: data.display_name,
    agencyName: agent.agency_name,
    bio: agent.bio,
    verified: agent.verified,
    since: data.created_at,
    listings: rows,
    listingCount: rows[0]?.total_count ?? 0,
  };
}
