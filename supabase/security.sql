-- Vicambachgiai3 production authz hardening
-- Apply statement-by-statement.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.role := 'reader';
    if new.avatar = 'vca:16' then
      raise exception 'Avatar nay chi danh cho quan tri vien';
    end if;
    if new.status is null or new.status not in ('active', 'banned') then
      new.status := 'active';
    end if;
    return new;
  end if;
  if not public.is_admin() then
    if new.avatar = 'vca:16' then
      raise exception 'Avatar nay chi danh cho quan tri vien';
    end if;
    if new.user_id is distinct from old.user_id
       or new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.email is distinct from old.email then
      raise exception 'Khong duoc thay doi quyen hoac trang thai tai khoan';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
  before insert or update on public.profiles
  for each row execute function public.protect_profile_privileges();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name, avatar, bio, role, status, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(coalesce(new.email,''),'@',1), 'Doc gia'),
    upper(left(coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(coalesce(new.email,''),'@',1), 'D'), 1)),
    '',
    'reader',
    'active',
    new.email
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  resource text not null,
  resource_id text,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

create or replace function public.write_admin_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  act text;
  rid text;
  rec jsonb;
begin
  if not public.is_admin() then
    return coalesce(new, old);
  end if;
  act := lower(tg_op) || '_' || tg_table_name;
  rec := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  rid := coalesce(rec->>'id', rec->>'user_id');
  insert into public.admin_audit_log (actor_id, action, resource, resource_id)
  values (auth.uid(), act, tg_table_name, rid);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_stories on public.stories;
create trigger audit_stories after insert or update or delete on public.stories
  for each row execute function public.write_admin_audit();

drop trigger if exists audit_chapters on public.chapters;
create trigger audit_chapters after insert or update or delete on public.chapters
  for each row execute function public.write_admin_audit();

drop trigger if exists audit_site_settings on public.site_settings;
create trigger audit_site_settings after update on public.site_settings
  for each row execute function public.write_admin_audit();

drop trigger if exists audit_profiles_priv on public.profiles;
create trigger audit_profiles_priv after update on public.profiles
  for each row execute function public.write_admin_audit();

-- Drop overlapping / overly-permissive policies
drop policy if exists "Public read comments" on public.comments;
drop policy if exists "Users create comments" on public.comments;
drop policy if exists "Users delete own comments" on public.comments;
drop policy if exists "Users update own comments" on public.comments;
drop policy if exists "own comment update" on public.comments;
drop policy if exists "Public read chapters" on public.chapters;
drop policy if exists "public read published chapters" on public.chapters;
drop policy if exists "Public read stories" on public.stories;
drop policy if exists "public read stories" on public.stories;
drop policy if exists "Users add own favorites" on public.favorites;
drop policy if exists "Users delete own favorites" on public.favorites;
drop policy if exists "Users read own favorites" on public.favorites;
drop policy if exists "Users insert own progress" on public.reading_progress;
drop policy if exists "Users read own progress" on public.reading_progress;
drop policy if exists "Users update own progress" on public.reading_progress;
drop policy if exists "Users add ratings" on public.ratings;
drop policy if exists "Users remove ratings" on public.ratings;
drop policy if exists "Users update ratings" on public.ratings;
drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
drop policy if exists "own or admin read profiles" on public.profiles;
drop policy if exists "admin manage profiles" on public.profiles;
drop policy if exists "Public read site settings" on public.site_settings;
drop policy if exists "public read site_settings" on public.site_settings;
drop policy if exists "admin write site_settings" on public.site_settings;
drop policy if exists "anyone insert inbox" on public.inbox;
drop policy if exists "public read views" on public.views;
drop policy if exists "anyone logs views" on public.views;
drop policy if exists "own likes" on public.chapter_likes;
drop policy if exists "own comment likes" on public.comment_likes;
drop policy if exists "public read comment likes" on public.comment_likes;
drop policy if exists "own poll votes" on public.poll_votes;
drop policy if exists "public read poll votes" on public.poll_votes;
drop policy if exists "own follows" on public.follows;
drop policy if exists "own favorites" on public.favorites;
drop policy if exists "own ratings" on public.ratings;
drop policy if exists "own progress" on public.reading_progress;
drop policy if exists "own history" on public.reading_history;
drop policy if exists "admin write stories" on public.stories;
drop policy if exists "admin write chapters" on public.chapters;
drop policy if exists "admin write genres" on public.genres;
drop policy if exists "admin write tags" on public.tags;
drop policy if exists "admin write story_genres" on public.story_genres;
drop policy if exists "admin write story_tags" on public.story_tags;
drop policy if exists "public read genres" on public.genres;
drop policy if exists "public read tags" on public.tags;
drop policy if exists "public read story_genres" on public.story_genres;
drop policy if exists "public read story_tags" on public.story_tags;
drop policy if exists "admin read inbox" on public.inbox;
drop policy if exists "admin update inbox" on public.inbox;
drop policy if exists "admin insert notifications" on public.notifications;
drop policy if exists "own notifications" on public.notifications;
drop policy if exists "public read comments" on public.comments;
drop policy if exists "signed in insert comments" on public.comments;
drop policy if exists "admin moderate comments" on public.comments;
drop policy if exists "public read comment_replies" on public.comment_replies;
drop policy if exists "signed in insert replies" on public.comment_replies;
drop policy if exists "own reply update" on public.comment_replies;
drop policy if exists "admin moderate replies" on public.comment_replies;

-- Catalog reads
create policy "stories_select" on public.stories for select
  using (published = true or public.is_admin());
create policy "stories_admin" on public.stories for all
  using (public.is_admin()) with check (public.is_admin());

create policy "chapters_select" on public.chapters for select
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
    )
  );
create policy "chapters_admin" on public.chapters for all
  using (public.is_admin()) with check (public.is_admin());

create policy "genres_select" on public.genres for select using (true);
create policy "genres_admin" on public.genres for all using (public.is_admin()) with check (public.is_admin());
create policy "tags_select" on public.tags for select using (true);
create policy "tags_admin" on public.tags for all using (public.is_admin()) with check (public.is_admin());
create policy "story_genres_select" on public.story_genres for select using (true);
create policy "story_genres_admin" on public.story_genres for all using (public.is_admin()) with check (public.is_admin());
create policy "story_tags_select" on public.story_tags for select using (true);
create policy "story_tags_admin" on public.story_tags for all using (public.is_admin()) with check (public.is_admin());

create policy "settings_select" on public.site_settings for select using (true);
create policy "settings_admin" on public.site_settings for update
  using (public.is_admin()) with check (public.is_admin());

-- Profiles
create policy "profiles_select_self_or_admin" on public.profiles for select
  using (auth.uid() = user_id or public.is_admin());
create policy "profiles_update_self" on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "profiles_admin_update" on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- Comments
create policy "comments_select" on public.comments for select
  using (status = 'visible' or auth.uid() = user_id or public.is_admin());
create policy "comments_insert" on public.comments for insert
  with check (auth.uid() = user_id);
create policy "comments_update_own" on public.comments for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "comments_delete_own" on public.comments for delete
  using (auth.uid() = user_id);
create policy "comments_admin" on public.comments for all
  using (public.is_admin()) with check (public.is_admin());

create policy "replies_select" on public.comment_replies for select
  using (status = 'visible' or auth.uid() = user_id or public.is_admin());
create policy "replies_insert" on public.comment_replies for insert
  with check (auth.uid() = user_id);
create policy "replies_update_own" on public.comment_replies for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "replies_delete_own" on public.comment_replies for delete
  using (auth.uid() = user_id);
create policy "replies_admin" on public.comment_replies for all
  using (public.is_admin()) with check (public.is_admin());

create policy "comment_likes_select" on public.comment_likes for select using (true);
create policy "comment_likes_own" on public.comment_likes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "chapter_likes_select" on public.chapter_likes for select using (true);
create policy "chapter_likes_own" on public.chapter_likes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "ratings_admin_select" on public.ratings for select to authenticated
  using ((select public.is_admin()));
create policy "ratings_own" on public.ratings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "favorites_own" on public.favorites for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "favorites_admin_select" on public.favorites for select to authenticated
  using ((select public.is_admin()));
create policy "follows_own" on public.follows for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "follows_admin_select" on public.follows for select
  using (public.is_admin());

create policy "progress_own" on public.reading_progress for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "history_own" on public.reading_history for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "notifs_select" on public.notifications for select
  using (auth.uid() = user_id);
create policy "notifs_update" on public.notifications for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notifs_admin_insert" on public.notifications for insert
  with check (public.is_admin());

create policy "poll_select" on public.poll_votes for select using (true);
create policy "poll_own" on public.poll_votes for insert
  with check (auth.uid() = user_id);

create policy "inbox_insert" on public.inbox for insert with check (true);
create policy "inbox_admin_select" on public.inbox for select using (public.is_admin());
create policy "inbox_admin_update" on public.inbox for update
  using (public.is_admin()) with check (public.is_admin());

create policy "views_insert" on public.views for insert with check (true);
create policy "views_select_admin" on public.views for select using (public.is_admin());

create policy "audit_admin_select" on public.admin_audit_log for select using (public.is_admin());

revoke insert, update, delete on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.publish_due_chapters() to anon, authenticated;
revoke execute on function public.get_story_stats() from public;
grant execute on function public.get_story_stats() to anon, authenticated;
revoke execute on function public.get_chapter_like_counts() from public;
grant execute on function public.get_chapter_like_counts() to anon, authenticated;
