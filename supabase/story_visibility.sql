-- Run once in Supabase SQL Editor before using the Hide story control.
alter table public.stories
  add column if not exists published boolean not null default true;

drop policy if exists "stories_read" on public.stories;
drop policy if exists "stories_select" on public.stories;

create policy "stories_select" on public.stories for select
  using (published = true or public.is_admin());

create index if not exists stories_published_updated_idx
  on public.stories (published, updated_at desc);

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
      select 1 from public.profiles as member_profile
      where member_profile.user_id = (select auth.uid())
        and member_profile.status = 'active'
    )
  )
);
