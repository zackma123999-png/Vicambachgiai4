-- Guests may see the published chapter index, but chapter content requires
-- a signed-in, active member account. Admin access remains unchanged.

revoke select on table public.chapters from anon;

grant select (
  id,
  story_id,
  number,
  chapter_number,
  title,
  status,
  publish_at,
  published_at,
  created_at,
  updated_at,
  notify_edit_at
) on table public.chapters to anon;

drop policy if exists chapters_select on public.chapters;
drop policy if exists chapters_select_public_index on public.chapters;
drop policy if exists chapters_select_active_member on public.chapters;

create policy chapters_select_public_index
on public.chapters
for select
to anon
using (
  status = 'published'
  and (published_at is null or published_at <= now())
  and exists (
    select 1 from public.stories
    where stories.id = chapters.story_id
      and stories.published = true
  )
);

create policy chapters_select_active_member
on public.chapters
for select
to authenticated
using (
  public.is_admin()
  or (
    status = 'published'
    and (published_at is null or published_at <= now())
    and exists (
      select 1 from public.stories
      where stories.id = chapters.story_id
        and stories.published = true
    )
    and exists (
      select 1
      from public.profiles as member_profile
      where member_profile.user_id = (select auth.uid())
        and member_profile.status = 'active'
    )
  )
);
