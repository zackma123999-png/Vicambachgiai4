-- Real, low-egress public counters for the compact homepage panel.
create table if not exists public.site_daily_visitors (
  visit_date date not null,
  visitor_key uuid not null,
  is_member boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (visit_date, visitor_key)
);

alter table public.site_daily_visitors enable row level security;
revoke all on table public.site_daily_visitors from anon, authenticated;

create or replace function public.record_site_visit(p_visitor_key uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visitor_key uuid := coalesce(auth.uid(), p_visitor_key);
begin
  if v_visitor_key is null then
    raise exception 'visitor key is required';
  end if;

  insert into public.site_daily_visitors (visit_date, visitor_key, is_member)
  values ((timezone('Asia/Tokyo', now()))::date, v_visitor_key, auth.uid() is not null)
  on conflict (visit_date, visitor_key) do update
    set is_member = public.site_daily_visitors.is_member or excluded.is_member;
end;
$$;

create or replace function public.get_public_site_stats()
returns table (
  visits_today bigint,
  members bigint,
  comments bigint,
  total_views bigint,
  hearts bigint,
  published_stories bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.site_daily_visitors
      where visit_date = (timezone('Asia/Tokyo', now()))::date)::bigint,
    (select count(*) from public.profiles where status = 'active')::bigint,
    (
      (select count(*) from public.comments where status = 'visible') +
      (select count(*) from public.comment_replies where status = 'visible')
    )::bigint,
    (select count(*) from public.views)::bigint,
    (select count(*) from public.chapter_likes)::bigint,
    (select count(*) from public.stories
      where coalesce(published, true) = true and coalesce(upcoming, false) = false)::bigint;
$$;

revoke all on function public.record_site_visit(uuid) from public;
revoke all on function public.get_public_site_stats() from public;
grant execute on function public.record_site_visit(uuid) to anon, authenticated;
grant execute on function public.get_public_site_stats() to anon, authenticated;
