begin;

create unique index if not exists conversation_threads_announcement_member_uidx
  on public.conversation_threads(announcement_id, member_id)
  where announcement_id is not null;

create or replace function private.ensure_latest_announcement_for_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  source_announcement_id uuid;
  source_subject text;
  source_created_by uuid;
  source_sender_id uuid;
  source_body text;
  new_thread_id uuid;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and p.status = 'active'
      and p.role <> 'admin'
  ) then
    return;
  end if;

  select t.announcement_id, t.subject, t.created_by, m.sender_id, m.body
    into source_announcement_id, source_subject, source_created_by,
         source_sender_id, source_body
  from public.conversation_threads t
  join lateral (
    select cm.sender_id, cm.body
    from public.conversation_messages cm
    where cm.thread_id = t.id
      and cm.announcement_id = t.announcement_id
    order by cm.created_at asc
    limit 1
  ) m on true
  where t.announcement_id is not null
  order by t.created_at desc
  limit 1;

  if source_announcement_id is null then
    return;
  end if;

  insert into public.conversation_threads (
    member_id, created_by, subject, announcement_id
  ) values (
    p_user_id, source_created_by, source_subject, source_announcement_id
  )
  on conflict (announcement_id, member_id)
    where announcement_id is not null
  do nothing
  returning id into new_thread_id;

  if new_thread_id is null then
    return;
  end if;

  insert into public.conversation_messages (
    thread_id, sender_id, body, announcement_id
  ) values (
    new_thread_id, source_sender_id, source_body, source_announcement_id
  );
end
$fn$;

revoke all on function private.ensure_latest_announcement_for_member(uuid) from public;
grant execute on function private.ensure_latest_announcement_for_member(uuid) to postgres;

create or replace function private.profile_attach_latest_announcement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
begin
  if new.status = 'active'
     and new.role <> 'admin'
     and (
       tg_op = 'INSERT'
       or old.status is distinct from new.status
       or old.role is distinct from new.role
     ) then
    perform private.ensure_latest_announcement_for_member(new.user_id);
  end if;
  return new;
end
$fn$;

revoke all on function private.profile_attach_latest_announcement() from public;
grant execute on function private.profile_attach_latest_announcement() to postgres;

drop trigger if exists profile_attach_latest_announcement on public.profiles;
create trigger profile_attach_latest_announcement
after insert or update of status, role on public.profiles
for each row execute function private.profile_attach_latest_announcement();

do $backfill$
declare
  member record;
begin
  for member in
    select p.user_id
    from public.profiles p
    where p.status = 'active' and p.role <> 'admin'
  loop
    perform private.ensure_latest_announcement_for_member(member.user_id);
  end loop;
end
$backfill$;

commit;
