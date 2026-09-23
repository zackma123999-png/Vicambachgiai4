begin;

create or replace function private.notify_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  story_title text;
  story_slug text;
  chapter_number numeric;
  actor_name text;
  target_href text;
  mentioned_member record;
begin
  select s.title, s.slug, c.number
    into story_title, story_slug, chapter_number
  from public.stories s
  left join public.chapters c on c.id = new.chapter_id
  where s.id = new.story_id;

  select coalesce(nullif(trim(p.display_name), ''), 'Một thành viên')
    into actor_name
  from public.profiles p
  where p.user_id = new.user_id;

  actor_name := coalesce(actor_name, 'Một thành viên');
  target_href := '#/truyen/' || coalesce(story_slug, '') ||
    '/chuong-' || coalesce(chapter_number, 0)::text ||
    '?comment=' || new.id::text;

  insert into public.notifications (
    user_id, notification_type, title, body, href,
    story_id, chapter_id, comment_id, actor_id, read
  )
  select
    p.user_id, 'new_comment', 'Bình luận mới',
    actor_name || ' vừa bình luận tại “' || coalesce(story_title, 'truyện') || '”.',
    target_href, new.story_id, new.chapter_id, new.id, new.user_id, false
  from public.profiles p
  where p.status = 'active'
    and p.role = 'admin'
    and p.user_id is distinct from new.user_id;

  for mentioned_member in
    select p.user_id
    from public.profiles p
    where p.status = 'active'
      and p.role <> 'admin'
      and p.user_id is distinct from new.user_id
      and position(lower('@' || p.display_name) in lower(new.body)) > 0
  loop
    insert into public.notifications (
      user_id, notification_type, title, body, href,
      story_id, chapter_id, comment_id, actor_id, read
    ) values (
      mentioned_member.user_id, 'mention', actor_name || ' đã nhắc đến bạn',
      left(new.body, 220), target_href,
      new.story_id, new.chapter_id, new.id, new.user_id, false
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
  story_title text;
  story_slug text;
  chapter_number numeric;
  actor_name text;
  target_href text;
  mentioned_member record;
begin
  select * into parent
  from public.comments
  where id = new.comment_id;

  if parent.id is null then
    return new;
  end if;

  select s.title, s.slug, c.number
    into story_title, story_slug, chapter_number
  from public.stories s
  left join public.chapters c on c.id = parent.chapter_id
  where s.id = parent.story_id;

  select coalesce(nullif(trim(p.display_name), ''), 'Quản trị viên')
    into actor_name
  from public.profiles p
  where p.user_id = new.user_id;

  actor_name := coalesce(actor_name, 'Quản trị viên');
  target_href := '#/truyen/' || coalesce(story_slug, '') ||
    '/chuong-' || coalesce(chapter_number, 0)::text ||
    '?comment=' || parent.id::text;

  if parent.user_id is not null and parent.user_id is distinct from new.user_id then
    insert into public.notifications (
      user_id, notification_type, title, body, href,
      story_id, chapter_id, comment_id, actor_id, read
    ) values (
      parent.user_id, 'comment_reply', 'Có phản hồi mới',
      actor_name || ' đã trả lời bình luận của bạn.', target_href,
      parent.story_id, parent.chapter_id, parent.id, new.user_id, false
    );
  end if;

  insert into public.notifications (
    user_id, notification_type, title, body, href,
    story_id, chapter_id, comment_id, actor_id, read
  )
  select
    p.user_id, 'new_comment', 'Phản hồi mới',
    actor_name || ' vừa trả lời một bình luận tại “' || coalesce(story_title, 'truyện') || '”.',
    target_href, parent.story_id, parent.chapter_id, parent.id, new.user_id, false
  from public.profiles p
  where p.status = 'active'
    and p.role = 'admin'
    and p.user_id is distinct from new.user_id
    and p.user_id is distinct from parent.user_id;

  for mentioned_member in
    select p.user_id
    from public.profiles p
    where p.status = 'active'
      and p.role <> 'admin'
      and p.user_id is distinct from new.user_id
      and p.user_id is distinct from parent.user_id
      and position(lower('@' || p.display_name) in lower(new.body)) > 0
  loop
    insert into public.notifications (
      user_id, notification_type, title, body, href,
      story_id, chapter_id, comment_id, actor_id, read
    ) values (
      mentioned_member.user_id, 'mention', actor_name || ' đã nhắc đến bạn',
      left(new.body, 220), target_href,
      parent.story_id, parent.chapter_id, parent.id, new.user_id, false
    );
  end loop;

  return new;
end
$fn$;

revoke all on function private.notify_comment_insert() from public;
revoke all on function private.notify_reply_insert() from public;

update public.notifications as notification
set href = '#/truyen/' || story.slug ||
  '/chuong-' || chapter.number::text ||
  '?comment=' || notification.comment_id::text
from public.stories as story,
     public.chapters as chapter
where notification.href = '#/admin/binh-luan'
  and notification.comment_id is not null
  and story.id = notification.story_id
  and chapter.id = notification.chapter_id;

commit;
