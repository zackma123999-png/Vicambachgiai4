-- Allow the verified owner to inspect who rated or favorited each story.
-- Readers remain limited to their own favorite rows.
drop policy if exists "favorites_admin_select" on public.favorites;
create policy "favorites_admin_select"
  on public.favorites
  for select
  to authenticated
  using ((select public.is_admin()));

-- Individual rating rows include member IDs. Keep them private to the owner
-- and the member who created them; public totals continue through the stats RPC.
drop policy if exists "ratings_select" on public.ratings;
drop policy if exists "ratings_admin_select" on public.ratings;
create policy "ratings_admin_select"
  on public.ratings
  for select
  to authenticated
  using ((select public.is_admin()));
