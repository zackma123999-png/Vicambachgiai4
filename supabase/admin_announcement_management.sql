begin;

alter table public.conversation_threads
  add column if not exists announcement_id uuid;
alter table public.conversation_messages
  add column if not exists announcement_id uuid;
alter table public.notifications
  add column if not exists announcement_id uuid;

create index if not exists conversation_threads_announcement_idx
  on public.conversation_threads(announcement_id) where announcement_id is not null;
create index if not exists conversation_messages_announcement_idx
  on public.conversation_messages(announcement_id) where announcement_id is not null;
create index if not exists notifications_announcement_idx
  on public.notifications(announcement_id) where announcement_id is not null;

drop policy if exists conversation_threads_delete_admin on public.conversation_threads;
create policy conversation_threads_delete_admin on public.conversation_threads
  for delete to authenticated using (public.is_admin());

drop policy if exists conversation_messages_update_admin on public.conversation_messages;
create policy conversation_messages_update_admin on public.conversation_messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists conversation_messages_delete_admin on public.conversation_messages;
create policy conversation_messages_delete_admin on public.conversation_messages
  for delete to authenticated using (public.is_admin());

grant delete on table public.conversation_threads to authenticated;
grant update, delete on table public.conversation_messages to authenticated;

create or replace function private.conversation_message_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  thread_row public.conversation_threads%rowtype;
  sender_name text;
  recipient record;
begin
  select * into thread_row from public.conversation_threads where id = new.thread_id;
  if thread_row.id is null then return new; end if;

  update public.conversation_threads set updated_at = new.created_at where id = new.thread_id;
  select coalesce(nullif(display_name,''), email, 'Thành viên') into sender_name
  from public.profiles where user_id = new.sender_id;

  for recipient in
    select thread_row.member_id as user_id
    where new.sender_id <> thread_row.member_id
    union
    select p.user_id from public.profiles p
    where p.role = 'admin' and p.status = 'active'
      and new.sender_id = thread_row.member_id
  loop
    insert into public.notifications (
      user_id, notification_type, title, body, href, actor_id,
      conversation_id, announcement_id, read
    ) values (
      recipient.user_id, 'manual',
      case when recipient.user_id = thread_row.member_id and new.announcement_id is not null
        then thread_row.subject
        when recipient.user_id = thread_row.member_id then 'Quản trị viên đã trả lời'
        else 'Tin nhắn từ ' || coalesce(sender_name, 'thành viên') end,
      new.body,
      case when recipient.user_id = thread_row.member_id
        then '#/hop-thu?thread=' || thread_row.id::text
        else '#/admin/hop-thu?thread=' || thread_row.id::text end,
      new.sender_id, thread_row.id, new.announcement_id, false
    );
  end loop;
  return new;
end
$fn$;

create or replace function public.update_manual_announcement(
  p_announcement_id uuid, p_title text, p_body text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  changed_count integer;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  p_title := btrim(coalesce(p_title, ''));
  p_body := btrim(coalesce(p_body, ''));
  if char_length(p_title) not between 1 and 100 then raise exception 'Tiêu đề phải có từ 1 đến 100 ký tự'; end if;
  if char_length(p_body) not between 1 and 2000 then raise exception 'Nội dung phải có từ 1 đến 2.000 ký tự'; end if;

  update public.conversation_threads set subject = p_title, updated_at = now()
  where announcement_id = p_announcement_id;
  get diagnostics changed_count = row_count;
  if changed_count = 0 then raise exception 'Không tìm thấy thông báo'; end if;

  update public.conversation_messages set body = p_body
  where announcement_id = p_announcement_id;
  update public.notifications set title = p_title, body = p_body
  where announcement_id = p_announcement_id;
  return changed_count;
end
$fn$;

create or replace function public.delete_manual_announcement(p_announcement_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  changed_count integer;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  delete from public.conversation_threads where announcement_id = p_announcement_id;
  get diagnostics changed_count = row_count;
  if changed_count = 0 then raise exception 'Không tìm thấy thông báo'; end if;
  return changed_count;
end
$fn$;

revoke all on function public.update_manual_announcement(uuid, text, text) from public;
revoke all on function public.delete_manual_announcement(uuid) from public;
grant execute on function public.update_manual_announcement(uuid, text, text) to authenticated;
grant execute on function public.delete_manual_announcement(uuid) to authenticated;

commit;
