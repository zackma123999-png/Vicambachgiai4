begin;

-- New messages and content reports now use authenticated, private
-- conversation threads. Keep the legacy inbox readable by the administrator
-- for history, but close its unauthenticated one-way submission path.
drop policy if exists inbox_insert on public.inbox;
drop policy if exists "anyone insert inbox" on public.inbox;
drop policy if exists site_mode_guard_insert on public.inbox;

revoke insert on table public.inbox from anon, authenticated;

commit;
