-- Reliable site-wide online count over the same HTTP RPC path used by the
-- working visit counter. Rows are private; public clients can only heartbeat
-- their own generated visitor key and receive aggregate counts.
create table if not exists public.site_presence (
  visitor_key uuid primary key,
  is_member boolean not null default false,
  last_seen timestamptz not null default now()
);

alter table public.site_presence enable row level security;
revoke all on table public.site_presence from anon, authenticated;

create index if not exists site_presence_last_seen_idx
  on public.site_presence (last_seen);

create or replace function public.heartbeat_site_presence(p_visitor_key uuid)
returns table (
  online bigint,
  online_guests bigint,
  online_members bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_visitor_key uuid := coalesce(v_user_id, p_visitor_key);
  v_now timestamptz := clock_timestamp();
begin
  if v_visitor_key is null then
    raise exception 'visitor key is required';
  end if;

  -- When a guest signs in, remove their previous guest identity immediately so
  -- the same person is never counted once as guest and again as member.
  if v_user_id is not null and p_visitor_key is not null and p_visitor_key <> v_user_id then
    delete from public.site_presence where visitor_key = p_visitor_key;
  end if;

  insert into public.site_presence (visitor_key, is_member, last_seen)
  values (v_visitor_key, v_user_id is not null, v_now)
  on conflict (visitor_key) do update
    set is_member = excluded.is_member,
        last_seen = excluded.last_seen;

  delete from public.site_presence
    where last_seen < v_now - interval '90 seconds';

  return query
  select
    count(*)::bigint,
    count(*) filter (where not is_member)::bigint,
    count(*) filter (where is_member)::bigint
  from public.site_presence
  where last_seen >= v_now - interval '90 seconds';
end;
$$;

create or replace function public.leave_site_presence(p_visitor_key uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  delete from public.site_presence
  where visitor_key = coalesce(v_user_id, p_visitor_key)
     or (v_user_id is not null and visitor_key = p_visitor_key);
end;
$$;

revoke all on function public.heartbeat_site_presence(uuid) from public;
revoke all on function public.leave_site_presence(uuid) from public;
grant execute on function public.heartbeat_site_presence(uuid) to anon, authenticated;
grant execute on function public.leave_site_presence(uuid) to anon, authenticated;
