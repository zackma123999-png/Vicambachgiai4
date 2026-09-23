begin;

create table if not exists public.conversation_threads (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(user_id) on delete cascade,
  subject text not null default 'Tin nhắn với quản trị viên',
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.conversation_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.notifications
  add column if not exists conversation_id uuid references public.conversation_threads(id) on delete cascade;

create index if not exists conversation_threads_member_updated_idx
  on public.conversation_threads(member_id, updated_at desc);
create index if not exists conversation_threads_created_by_idx
  on public.conversation_threads(created_by);
create index if not exists conversation_messages_thread_created_idx
  on public.conversation_messages(thread_id, created_at);
create index if not exists conversation_messages_sender_idx
  on public.conversation_messages(sender_id);
create index if not exists notifications_conversation_idx
  on public.notifications(conversation_id);

alter table public.conversation_threads enable row level security;
alter table public.conversation_messages enable row level security;

drop policy if exists conversation_threads_select on public.conversation_threads;
drop policy if exists conversation_threads_insert on public.conversation_threads;
drop policy if exists conversation_threads_update on public.conversation_threads;
create policy conversation_threads_select on public.conversation_threads
  for select to authenticated
  using ((select auth.uid()) = member_id or public.is_admin());
create policy conversation_threads_insert on public.conversation_threads
  for insert to authenticated
  with check (
    public.is_admin()
    or ((select auth.uid()) = member_id and (select auth.uid()) = created_by)
  );
create policy conversation_threads_update on public.conversation_threads
  for update to authenticated
  using ((select auth.uid()) = member_id or public.is_admin())
  with check ((select auth.uid()) = member_id or public.is_admin());

drop policy if exists conversation_messages_select on public.conversation_messages;
drop policy if exists conversation_messages_insert on public.conversation_messages;
create policy conversation_messages_select on public.conversation_messages
  for select to authenticated
  using (exists (
    select 1 from public.conversation_threads t
    where t.id = thread_id
      and (t.member_id = (select auth.uid()) or public.is_admin())
  ));
create policy conversation_messages_insert on public.conversation_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversation_threads t
      where t.id = thread_id
        and t.status = 'open'
        and (t.member_id = (select auth.uid()) or public.is_admin())
    )
  );

revoke all on table public.conversation_threads from anon, authenticated;
revoke all on table public.conversation_messages from anon, authenticated;
grant select, insert, update on table public.conversation_threads to authenticated;
grant select, insert on table public.conversation_messages to authenticated;

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
      user_id, notification_type, title, body, href, actor_id, conversation_id, read
    ) values (
      recipient.user_id, 'manual',
      case when recipient.user_id = thread_row.member_id
        then 'Quản trị viên đã trả lời'
        else 'Tin nhắn từ ' || coalesce(sender_name, 'thành viên') end,
      left(new.body, 500),
      case when recipient.user_id = thread_row.member_id
        then '#/hop-thu?thread=' || thread_row.id::text
        else '#/admin/hop-thu?thread=' || thread_row.id::text end,
      new.sender_id, thread_row.id, false
    );
  end loop;
  return new;
end
$fn$;

revoke all on function private.conversation_message_created() from public;
grant execute on function private.conversation_message_created() to postgres;

drop trigger if exists conversation_message_created on public.conversation_messages;
create trigger conversation_message_created
after insert on public.conversation_messages
for each row execute function private.conversation_message_created();

do $realtime$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='conversation_messages'
  ) then
    alter publication supabase_realtime add table public.conversation_messages;
  end if;
end
$realtime$;

commit;
