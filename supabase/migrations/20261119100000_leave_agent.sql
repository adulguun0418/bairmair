-- An agent can stop being one: deleting their own agent_profiles row. The existing
-- agent_profiles_sync_role trigger sets profiles.role back to 'owner', so the public agent page
-- (which needs role = 'agent' and an agent profile) disappears and listings show the seller as an
-- owner. Verification is lost with the row; registering again starts unverified.

grant delete on public.agent_profiles to authenticated;

create policy "delete own" on public.agent_profiles for delete to authenticated
  using (profile_id = (select auth.uid()));
