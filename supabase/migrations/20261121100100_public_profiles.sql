-- Profiles are public only where the product shows them.
--
-- The "read" policy was `using (true)`: anyone with the public key could list every account's id,
-- display name and sign-up date (GET /rest/v1/profiles), including buyers who never posted.
-- Now a profile is readable by its own user, and by everyone only when the site shows it:
-- - an agent (their public page), or
-- - the seller of a live listing (published or sold/rented: the listing page's seller card).
-- Other users' profiles are not readable at all; Postgres and trusted server code still see them.

drop policy "read" on public.profiles;

create policy "read public or own" on public.profiles for select to anon, authenticated
  using (
    id = (select auth.uid())
    or exists (select 1 from public.agent_profiles a where a.profile_id = profiles.id)
    or exists (
      select 1 from public.listings l
      where l.owner_id = profiles.id and l.status in ('published', 'sold_or_rented')
    )
  );
