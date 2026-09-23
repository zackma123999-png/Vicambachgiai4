-- ViCamBachGiai3 — shared library schema
create extension if not exists pgcrypto;

create or replace function public.now_ms()
returns bigint language sql stable as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  display_name text not null default '',
  avatar text not null default '',
  bio text not null default '',
  role text not null default 'reader' check (role in ('admin', 'reader')),
  status text not null default 'active' check (status in ('active', 'banned')),
  created_at bigint not null default public.now_ms()
);

create table if not exists public.genres (
  id text primary key,
  name text not null,
  slug text unique not null
);

create table if not exists public.tags (
  id text primary key,
  name text not null,
  slug text unique not null
);

create table if not exists public.stories (
  id text primary key,
  slug text unique not null,
  title text not null,
  author text not null default '',
  editor text not null default '',
  synopsis text not null default '',
  status text not null default 'ongoing',
  published boolean not null default true,
  featured boolean not null default false,
  upcoming boolean not null default false,
  accent text not null default '#8a6a4a',
  cover text not null default '',
  home_priority smallint check (home_priority is null or home_priority between 1 and 99),
  tiktok_intro_url text,
  created_at bigint not null default public.now_ms(),
  updated_at bigint not null default public.now_ms()
);

create table if not exists public.story_genres (
  story_id text not null references public.stories(id) on delete cascade,
  genre_id text not null references public.genres(id) on delete cascade,
  primary key (story_id, genre_id)
);

create table if not exists public.story_tags (
  story_id text not null references public.stories(id) on delete cascade,
  tag_id text not null references public.tags(id) on delete cascade,
  primary key (story_id, tag_id)
);

create table if not exists public.chapters (
  id text primary key,
  story_id text not null references public.stories(id) on delete cascade,
  number integer not null,
  title text not null default '',
  body text not null default '',
  youtube_audio_url text,
  status text not null default 'draft',
  publish_at bigint,
  published_at bigint,
  created_at bigint not null default public.now_ms(),
  updated_at bigint not null default public.now_ms(),
  unique (story_id, number)
);

create table if not exists public.favorites (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  story_id text not null references public.stories(id) on delete cascade,
  at bigint not null default public.now_ms(),
  unique (user_id, story_id)
);

create table if not exists public.follows (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  story_id text not null references public.stories(id) on delete cascade,
  at bigint not null default public.now_ms(),
  unique (user_id, story_id)
);

create table if not exists public.reading_progress (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  story_id text not null references public.stories(id) on delete cascade,
  chapter_id text,
  chapter_number integer,
  scroll integer not null default 0,
  at bigint not null default public.now_ms(),
  unique (user_id, story_id)
);

create table if not exists public.reading_history (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  story_id text not null references public.stories(id) on delete cascade,
  chapter_id text,
  chapter_number integer,
  at bigint not null default public.now_ms()
);

create table if not exists public.comments (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  story_id text not null references public.stories(id) on delete cascade,
  chapter_id text not null references public.chapters(id) on delete cascade,
  body text not null,
  quote text not null default '',
  status text not null default 'visible',
  created_at bigint not null default public.now_ms()
);

create table if not exists public.comment_replies (
  id text primary key,
  comment_id text not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  status text not null default 'visible',
  created_at bigint not null default public.now_ms()
);

create table if not exists public.comment_likes (
  comment_id text not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (comment_id, user_id)
);

create table if not exists public.chapter_likes (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  chapter_id text not null references public.chapters(id) on delete cascade,
  at bigint not null default public.now_ms(),
  unique (user_id, chapter_id)
);

create table if not exists public.ratings (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  story_id text not null references public.stories(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  at bigint not null default public.now_ms(),
  unique (user_id, story_id)
);

create table if not exists public.views (
  id text primary key,
  key text not null,
  story_id text not null references public.stories(id) on delete cascade,
  chapter_id text,
  user_id uuid,
  at bigint not null default public.now_ms()
);

create table if not exists public.notifications (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  href text not null default '#/',
  read boolean not null default false,
  at bigint not null default public.now_ms()
);

create table if not exists public.poll_votes (
  id text primary key,
  poll_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  story_id text not null references public.stories(id) on delete cascade,
  at bigint not null default public.now_ms(),
  unique (poll_id, user_id)
);

create table if not exists public.inbox (
  id text primary key,
  type text not null default 'message',
  body text not null,
  name text not null default '',
  email text not null default '',
  story text not null default '',
  user_id uuid,
  read boolean not null default false,
  at bigint not null default public.now_ms()
);

create table if not exists public.site_settings (
  id integer primary key default 1 check (id = 1),
  name text not null default 'ViCamBachGiai',
  tagline text not null default 'Thư viện Bách Hợp — đọc chậm, ở lại lâu.',
  allow_comments boolean not null default true,
  allow_registration boolean not null default true,
  social jsonb not null default '{"youtube":"","tiktok":"","facebook":"","wattpad":""}'::jsonb,
  featured_quote jsonb,
  poll jsonb not null default '{"id":"poll_home","title":"Bạn muốn ViCam ưu tiên truyện nào?","story_ids":[]}'::jsonb,
  seeded boolean not null default false
);

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

create index if not exists chapters_story_idx on public.chapters (story_id, number);
create index if not exists comments_chapter_idx on public.comments (chapter_id, created_at desc);
create index if not exists views_story_at_idx on public.views (story_id, at desc);
create index if not exists notifications_user_idx on public.notifications (user_id, at desc);
create index if not exists history_user_idx on public.reading_history (user_id, at desc);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.publish_due_chapters()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.chapters
     set status = 'published',
         published_at = coalesce(published_at, public.now_ms()),
         updated_at = public.now_ms()
   where status = 'scheduled'
     and publish_at is not null
     and publish_at <= public.now_ms();
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar, role, status)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, 'độc giả'), '@', 1)),
    upper(left(coalesce(new.raw_user_meta_data->>'display_name', coalesce(new.email, 'Đ')), 1)),
    'reader',
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.genres enable row level security;
alter table public.tags enable row level security;
alter table public.stories enable row level security;
alter table public.story_genres enable row level security;
alter table public.story_tags enable row level security;
alter table public.chapters enable row level security;
alter table public.favorites enable row level security;
alter table public.follows enable row level security;
alter table public.reading_progress enable row level security;
alter table public.reading_history enable row level security;
alter table public.comments enable row level security;
alter table public.comment_replies enable row level security;
alter table public.comment_likes enable row level security;
alter table public.chapter_likes enable row level security;
alter table public.ratings enable row level security;
alter table public.views enable row level security;
alter table public.notifications enable row level security;
alter table public.poll_votes enable row level security;
alter table public.inbox enable row level security;
alter table public.site_settings enable row level security;

-- public reads
create policy "profiles_read" on public.profiles for select using (true);
create policy "genres_read" on public.genres for select using (true);
create policy "tags_read" on public.tags for select using (true);
create policy "stories_read" on public.stories for select
  using (published = true or public.is_admin());
create policy "story_genres_read" on public.story_genres for select using (true);
create policy "story_tags_read" on public.story_tags for select using (true);
create policy "chapters_read" on public.chapters for select using (
  public.is_admin()
  or (
    status = 'published'
    and exists (
      select 1 from public.stories
      where stories.id = chapters.story_id
        and stories.published = true
    )
  )
);
create policy "comments_read" on public.comments for select using (status <> 'hidden' or public.is_admin() or user_id = auth.uid());
create policy "replies_read" on public.comment_replies for select using (status <> 'hidden' or public.is_admin() or user_id = auth.uid());
create policy "comment_likes_read" on public.comment_likes for select using (true);
create policy "chapter_likes_read" on public.chapter_likes for select using (true);
create policy "ratings_read" on public.ratings for select using (true);
create policy "views_read" on public.views for select using (true);
create policy "poll_votes_read" on public.poll_votes for select using (true);
create policy "settings_read" on public.site_settings for select using (true);

-- own / public writes
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid() or public.is_admin());
create policy "fav_own" on public.favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "fol_own" on public.follows for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "fol_admin_read" on public.follows for select using (public.is_admin());
create policy "prog_own" on public.reading_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "hist_own" on public.reading_history for select using (user_id = auth.uid());
create policy "hist_insert_own" on public.reading_history for insert with check (user_id = auth.uid());
create policy "hist_delete_own" on public.reading_history for delete using (user_id = auth.uid() or public.is_admin());
create policy "comments_insert" on public.comments for insert with check (auth.uid() = user_id);
create policy "comments_update_own" on public.comments for update using (user_id = auth.uid() or public.is_admin());
create policy "comments_delete_own" on public.comments for delete using (user_id = auth.uid() or public.is_admin());
create policy "replies_insert" on public.comment_replies for insert with check (auth.uid() = user_id);
create policy "replies_update_own" on public.comment_replies for update using (user_id = auth.uid() or public.is_admin());
create policy "replies_delete_own" on public.comment_replies for delete using (user_id = auth.uid() or public.is_admin());
create policy "comment_likes_own" on public.comment_likes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "chapter_likes_own" on public.chapter_likes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ratings_own" on public.ratings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "views_insert" on public.views for insert with check (true);
create policy "notifs_own" on public.notifications for select using (user_id = auth.uid());
create policy "notifs_update_own" on public.notifications for update using (user_id = auth.uid());
create policy "notifs_admin" on public.notifications for insert with check (public.is_admin() or user_id = auth.uid());
create policy "poll_insert" on public.poll_votes for insert with check (user_id = auth.uid());
create policy "inbox_insert" on public.inbox for insert with check (true);
create policy "inbox_admin" on public.inbox for select using (public.is_admin());

-- Realtime feed on the homepage: comments, replies and reactions update without reload.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['comments', 'comment_replies', 'comment_likes']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
create policy "inbox_admin_upd" on public.inbox for update using (public.is_admin());

-- admin catalog writes
create policy "genres_admin" on public.genres for all using (public.is_admin()) with check (public.is_admin());
create policy "tags_admin" on public.tags for all using (public.is_admin()) with check (public.is_admin());
create policy "stories_admin" on public.stories for all using (public.is_admin()) with check (public.is_admin());
create policy "story_genres_admin" on public.story_genres for all using (public.is_admin()) with check (public.is_admin());
create policy "story_tags_admin" on public.story_tags for all using (public.is_admin()) with check (public.is_admin());
create policy "chapters_admin" on public.chapters for all using (public.is_admin()) with check (public.is_admin());
create policy "settings_admin" on public.site_settings for update using (public.is_admin());
create policy "profiles_admin_all" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant insert on public.views, public.inbox to anon;
grant execute on function public.publish_due_chapters() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
