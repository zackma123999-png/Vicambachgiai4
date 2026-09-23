-- Restore public catalog reads without granting anonymous users any admin access.
-- Run once in Supabase SQL Editor.
--
-- The previous shared policy evaluated public.is_admin() for anonymous requests.
-- That function now delegates to private.is_admin_internal(), which anon must not
-- execute. PostgREST consequently rejected the entire stories query with 42501.

begin;

drop policy if exists "stories_read" on public.stories;
drop policy if exists "stories_select" on public.stories;
drop policy if exists "stories_select_anon" on public.stories;
drop policy if exists "stories_select_member" on public.stories;
drop policy if exists "stories_admin" on public.stories;

create policy "stories_select_anon"
on public.stories
for select
to anon
using (published = true);

create policy "stories_select_member"
on public.stories
for select
to authenticated
using (published = true or public.is_admin());

create policy "stories_admin"
on public.stories
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- FOR ALL policies also participate in SELECT. Keep the chapter admin policy
-- away from anon for the same reason, while preserving the existing public
-- chapter-index policy used by the homepage counters.
drop policy if exists "chapters_admin" on public.chapters;
create policy "chapters_admin"
on public.chapters
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Keep the private authorization helper private. The split policies above mean
-- anonymous catalog reads never need to call it.
revoke all on function private.is_admin_internal() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin_internal() to authenticated;

commit;
