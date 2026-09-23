begin;

alter table public.notifications
  add column if not exists notification_type text not null default 'system',
  add column if not exists story_id uuid references public.stories(id) on delete set null,
  add column if not exists chapter_id uuid references public.chapters(id) on delete set null,
  add column if not exists comment_id uuid references public.comments(id) on delete set null,
  add column if not exists actor_id uuid references auth.users(id) on delete set null;

alter table public.chapters
  add column if not exists notify_edit_at timestamptz;

do $ddl$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notifications_type_check'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_type_check check (
        notification_type in (
          'system','manual','new_story','new_chapter','saved_chapter',
          'chapter_edit','comment_reply','mention','new_comment',
          'comment_report','comment_moderation'
        )
      );
  end if;
end
$ddl$;

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, read, created_at desc);
create index if not exists notifications_story_group_idx
  on public.notifications(user_id, story_id, notification_type, created_at desc);

create index if not exists notifications_story_id_idx on public.notifications(story_id);
create index if not exists notifications_chapter_id_idx on public.notifications(chapter_id);
create index if not exists notifications_comment_id_idx on public.notifications(comment_id);
create index if not exists notifications_actor_id_idx on public.notifications(actor_id);

alter table public.notifications enable row level security;

drop policy if exists notifs_select on public.notifications;
drop policy if exists notifs_update on public.notifications;
drop policy if exists notifs_delete on public.notifications;
drop policy if exists notifs_admin_insert on public.notifications;

create policy notifs_select on public.notifications
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy notifs_update on public.notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy notifs_delete on public.notifications
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy notifs_admin_insert on public.notifications
  for insert to authenticated
  with check (public.is_admin());

revoke all on table public.notifications from anon, authenticated;
grant select, insert, update, delete on table public.notifications to authenticated;

create or replace function private.notify_story_publication()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  should_notify boolean := false;
begin
  if tg_op = 'INSERT' then
    should_notify := new.published and not new.upcoming;
  elsif tg_op = 'UPDATE' then
    should_notify := new.published
      and not new.upcoming
      and ((not old.published and new.published) or (old.upcoming and not new.upcoming));
  end if;

  if should_notify then
    insert into public.notifications (
      user_id, notification_type, title, body, href, story_id, actor_id, read
    )
    select p.user_id, 'new_story', 'Truyện mới: ' || new.title,
           '“' || new.title || '” đã được xuất bản.',
           '#/truyen/' || new.slug, new.id, auth.uid(), false
    from public.profiles p
    where p.status = 'active';
  end if;
  return new;
end
$fn$;

create or replace function private.notify_chapter_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  st public.stories%rowtype;
  recipient record;
  existing_id uuid;
  min_no numeric;
  max_no numeric;
  recent_count integer;
  msg_title text;
  msg_body text;
  msg_type text;
  target_href text;
  is_publish boolean := false;
  is_edit_notice boolean := false;
begin
  select * into st from public.stories where id = new.story_id;
  if st.id is null then return new; end if;

  if tg_op = 'INSERT' then
    is_publish := new.status = 'published';
  elsif tg_op = 'UPDATE' then
    is_publish := new.status = 'published' and old.status is distinct from 'published';
    is_edit_notice := new.status = 'published'
      and old.status = 'published'
      and new.notify_edit_at is not null
      and new.notify_edit_at is distinct from old.notify_edit_at;
  end if;

  if is_publish then
    select min(c.number), max(c.number), count(*)::integer
      into min_no, max_no, recent_count
    from public.chapters c
    where c.story_id = new.story_id
      and c.status = 'published'
      and coalesce(c.published_at, c.created_at) >= now() - interval '5 minutes';

    if recent_count > 1 then
      msg_body := st.title || ' vừa cập nhật chương ' || min_no::text || '–' || max_no::text || '.';
    elsif new.number = 0 then
      msg_body := 'Mở đầu' || case when coalesce(new.title,'') <> '' then ' — ' || new.title else '' end;
    else
      msg_body := 'Chương ' || new.number::text || case when coalesce(new.title,'') <> '' then ' — ' || new.title else '' end;
    end if;
    target_href := '#/truyen/' || st.slug || '/chuong-' || max_no::text;

    for recipient in
      select p.user_id,
             exists(select 1 from public.favorites f where f.user_id=p.user_id and f.story_id=new.story_id)
             or exists(select 1 from public.follows f where f.user_id=p.user_id and f.story_id=new.story_id) as saved
      from public.profiles p where p.status='active'
    loop
      msg_type := case when recipient.saved then 'saved_chapter' else 'new_chapter' end;
      msg_title := case when recipient.saved
        then 'Truyện bạn lưu có chương mới: ' || st.title
        else 'Chương mới: ' || st.title end;
      existing_id := null;
      select n.id into existing_id
      from public.notifications n
      where n.user_id = recipient.user_id
        and n.story_id = new.story_id
        and n.notification_type in ('new_chapter','saved_chapter')
        and n.created_at >= now() - interval '5 minutes'
      order by n.created_at desc limit 1;

      if existing_id is null then
        insert into public.notifications (
          user_id, notification_type, title, body, href, story_id, chapter_id, actor_id, read
        ) values (
          recipient.user_id, msg_type, msg_title, msg_body, target_href,
          new.story_id, new.id, auth.uid(), false
        );
      else
        update public.notifications
        set notification_type=msg_type, title=msg_title, body=msg_body,
            href=target_href, chapter_id=new.id, actor_id=auth.uid(),
            read=false, created_at=now()
        where id=existing_id;
      end if;
    end loop;
  end if;

  if is_edit_notice then
    insert into public.notifications (
      user_id, notification_type, title, body, href,
      story_id, chapter_id, actor_id, read
    )
    select p.user_id, 'chapter_edit', 'Chương đã được chỉnh sửa: ' || st.title,
           case when new.number=0 then 'Phần mở đầu đã được cập nhật.'
                else 'Chương ' || new.number::text || ' đã được cập nhật nội dung.' end,
           '#/truyen/' || st.slug || '/chuong-' || new.number::text,
           new.story_id, new.id, auth.uid(), false
    from public.profiles p where p.status='active';
  end if;
  return new;
end
$fn$;

create or replace function private.notify_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  st_title text;
  st_slug text;
  ch_no numeric;
  actor_name text;
  target_href text;
  person record;
begin
  select s.title, s.slug, c.number into st_title, st_slug, ch_no
  from public.stories s left join public.chapters c on c.id=new.chapter_id
  where s.id=new.story_id;
  select coalesce(p.display_name,'Một thành viên') into actor_name
  from public.profiles p where p.user_id=new.user_id;
  actor_name := coalesce(actor_name,'Một thành viên');
  target_href := '#/truyen/' || coalesce(st_slug,'') || '/chuong-' || coalesce(ch_no,0)::text || '?comment=' || new.id::text;

  insert into public.notifications (
    user_id, notification_type, title, body, href, story_id, chapter_id, comment_id, actor_id, read
  )
  select p.user_id, 'new_comment', 'Bình luận mới',
         actor_name || ' vừa bình luận tại “' || coalesce(st_title,'truyện') || '”.',
         '#/admin/binh-luan', new.story_id, new.chapter_id, new.id, new.user_id, false
  from public.profiles p
  where p.status='active' and p.role='admin' and p.user_id is distinct from new.user_id;

  for person in
    select p.user_id
    from public.profiles p
    where p.status='active' and p.role <> 'admin'
      and p.user_id is distinct from new.user_id
      and position(lower('@' || p.display_name) in lower(new.body)) > 0
  loop
    insert into public.notifications (
      user_id, notification_type, title, body, href, story_id, chapter_id, comment_id, actor_id, read
    ) values (
      person.user_id, 'mention', actor_name || ' đã nhắc đến bạn',
      left(new.body,220), target_href, new.story_id, new.chapter_id, new.id, new.user_id, false
    );
  end loop;
  return new;
end
$fn$;

create or replace function private.notify_reply_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  parent public.comments%rowtype;
  st_title text;
  st_slug text;
  ch_no numeric;
  actor_name text;
  target_href text;
  person record;
begin
  select * into parent from public.comments where id=new.comment_id;
  if parent.id is null then return new; end if;
  select s.title, s.slug, c.number into st_title, st_slug, ch_no
  from public.stories s left join public.chapters c on c.id=parent.chapter_id
  where s.id=parent.story_id;
  select coalesce(p.display_name,'Một thành viên') into actor_name
  from public.profiles p where p.user_id=new.user_id;
  actor_name := coalesce(actor_name,'Một thành viên');
  target_href := '#/truyen/' || coalesce(st_slug,'') || '/chuong-' || coalesce(ch_no,0)::text || '?comment=' || parent.id::text;

  if parent.user_id is not null and parent.user_id is distinct from new.user_id then
    insert into public.notifications (
      user_id, notification_type, title, body, href, story_id, chapter_id, comment_id, actor_id, read
    ) values (
      parent.user_id, 'comment_reply', 'Có phản hồi mới',
      actor_name || ' đã trả lời bình luận của bạn.', target_href,
      parent.story_id, parent.chapter_id, parent.id, new.user_id, false
    );
  end if;

  insert into public.notifications (
    user_id, notification_type, title, body, href, story_id, chapter_id, comment_id, actor_id, read
  )
  select p.user_id, 'new_comment', 'Phản hồi mới',
         actor_name || ' vừa trả lời một bình luận tại “' || coalesce(st_title,'truyện') || '”.',
         '#/admin/binh-luan', parent.story_id, parent.chapter_id, parent.id, new.user_id, false
  from public.profiles p
  where p.status='active' and p.role='admin'
    and p.user_id is distinct from new.user_id
    and p.user_id is distinct from parent.user_id;

  for person in
    select p.user_id
    from public.profiles p
    where p.status='active' and p.role <> 'admin'
      and p.user_id is distinct from new.user_id
      and p.user_id is distinct from parent.user_id
      and position(lower('@' || p.display_name) in lower(new.body)) > 0
  loop
    insert into public.notifications (
      user_id, notification_type, title, body, href, story_id, chapter_id, comment_id, actor_id, read
    ) values (
      person.user_id, 'mention', actor_name || ' đã nhắc đến bạn',
      left(new.body,220), target_href, parent.story_id, parent.chapter_id, parent.id, new.user_id, false
    );
  end loop;
  return new;
end
$fn$;

create or replace function private.notify_comment_moderation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  target_user uuid;
  target_story uuid;
  target_chapter uuid;
  target_comment uuid;
  action_label text;
begin
  if tg_op='UPDATE' then
    if not (old.status='visible' and new.status='hidden') then return new; end if;
    target_user:=new.user_id; target_story:=new.story_id; target_chapter:=new.chapter_id; target_comment:=new.id;
    action_label:='đã bị ẩn';
  else
    if not exists(select 1 from public.chapters c where c.id=old.chapter_id) then return old; end if;
    target_user:=old.user_id; target_story:=old.story_id; target_chapter:=old.chapter_id; target_comment:=null;
    action_label:='đã bị xóa';
  end if;
  if target_user is null or auth.uid()=target_user then return coalesce(new,old); end if;
  insert into public.notifications (
    user_id, notification_type, title, body, href, story_id, chapter_id, comment_id, actor_id, read
  ) values (
    target_user, 'comment_moderation', 'Bình luận của bạn ' || action_label,
    'Bình luận không còn hiển thị công khai. Liên hệ quản trị viên nếu bạn cần biết thêm.',
    '#/tai-khoan', target_story, target_chapter, target_comment, auth.uid(), false
  );
  return coalesce(new,old);
end
$fn$;

create or replace function private.notify_reply_moderation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  target_user uuid;
  parent public.comments%rowtype;
  action_label text;
begin
  if tg_op='UPDATE' then
    if not (old.status='visible' and new.status='hidden') then return new; end if;
    target_user:=new.user_id; action_label:='đã bị ẩn';
    select * into parent from public.comments where id=new.comment_id;
  else
    select * into parent from public.comments where id=old.comment_id;
    if parent.id is null then return old; end if;
    target_user:=old.user_id; action_label:='đã bị xóa';
  end if;
  if target_user is null or auth.uid()=target_user then return coalesce(new,old); end if;
  insert into public.notifications (
    user_id, notification_type, title, body, href, story_id, chapter_id, comment_id, actor_id, read
  ) values (
    target_user, 'comment_moderation', 'Phản hồi của bạn ' || action_label,
    'Phản hồi không còn hiển thị công khai. Liên hệ quản trị viên nếu bạn cần biết thêm.',
    '#/tai-khoan', parent.story_id, parent.chapter_id, parent.id, auth.uid(), false
  );
  return coalesce(new,old);
end
$fn$;

create or replace function private.notify_report_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
begin
  if new.type='report' then
    insert into public.notifications (
      user_id, notification_type, title, body, href, actor_id, read
    )
    select p.user_id, 'comment_report', 'Có báo cáo mới',
           left(coalesce(new.body,'Một nội dung vừa được báo cáo.'),220),
           '#/admin/hop-thu', new.user_id, false
    from public.profiles p
    where p.status='active' and p.role='admin' and p.user_id is distinct from new.user_id;
  end if;
  return new;
end
$fn$;

revoke all on function private.notify_story_publication() from public;
revoke all on function private.notify_chapter_change() from public;
revoke all on function private.notify_comment_insert() from public;
revoke all on function private.notify_reply_insert() from public;
revoke all on function private.notify_comment_moderation() from public;
revoke all on function private.notify_reply_moderation() from public;
revoke all on function private.notify_report_insert() from public;

drop trigger if exists notify_story_publication on public.stories;
create trigger notify_story_publication
after insert or update of published, upcoming on public.stories
for each row execute function private.notify_story_publication();

drop trigger if exists notify_chapter_change on public.chapters;
create trigger notify_chapter_change
after insert or update of status, notify_edit_at on public.chapters
for each row execute function private.notify_chapter_change();

drop trigger if exists notify_comment_insert on public.comments;
create trigger notify_comment_insert
after insert on public.comments
for each row execute function private.notify_comment_insert();

drop trigger if exists notify_reply_insert on public.comment_replies;
create trigger notify_reply_insert
after insert on public.comment_replies
for each row execute function private.notify_reply_insert();

drop trigger if exists notify_comment_moderation on public.comments;
create trigger notify_comment_moderation
after update of status or delete on public.comments
for each row execute function private.notify_comment_moderation();

drop trigger if exists notify_reply_moderation on public.comment_replies;
create trigger notify_reply_moderation
after update of status or delete on public.comment_replies
for each row execute function private.notify_reply_moderation();

drop trigger if exists notify_report_insert on public.inbox;
create trigger notify_report_insert
after insert on public.inbox
for each row execute function private.notify_report_insert();

do $pub$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
     ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end
$pub$;

insert into public.notifications (
  user_id, notification_type, title, body, href, story_id, chapter_id, read
)
select p.user_id, 'new_chapter', 'Vượt Rào đã cập nhật',
       'Đã cập nhật chương 66–107.', '#/truyen/vuot-rao/chuong-107',
       'bb93bb98-a271-4b22-9947-11b5c4631329'::uuid,
       (select id from public.chapters where story_id='bb93bb98-a271-4b22-9947-11b5c4631329' and number=107 limit 1),
       false
from public.profiles p
where p.status='active'
  and not exists (
    select 1 from public.notifications n
    where n.user_id=p.user_id and n.story_id='bb93bb98-a271-4b22-9947-11b5c4631329'
      and n.body='Đã cập nhật chương 66–107.'
  );

commit;
