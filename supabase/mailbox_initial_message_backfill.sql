begin;

alter table public.conversation_messages disable trigger conversation_message_created;

insert into public.conversation_messages (thread_id, sender_id, body, created_at)
select thread.id, thread.member_id, thread.subject, thread.created_at
from public.conversation_threads as thread
where btrim(thread.subject) <> ''
  and thread.subject <> 'Tin nhắn gửi quản trị viên'
  and not exists (
    select 1
    from public.conversation_messages as message
    where message.thread_id = thread.id
  );

update public.conversation_threads as thread
set subject = 'Trao đổi với quản trị viên'
where thread.subject <> 'Tin nhắn gửi quản trị viên'
  and exists (
    select 1
    from public.conversation_messages as message
    where message.thread_id = thread.id
      and message.sender_id = thread.member_id
      and message.created_at = thread.created_at
  );

alter table public.conversation_messages enable trigger conversation_message_created;

commit;
