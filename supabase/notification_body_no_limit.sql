begin;

-- Remove the 2000-character cap on conversation/announcement message bodies;
-- keep the non-empty requirement.
alter table public.conversation_messages
  drop constraint if exists conversation_messages_body_check;
alter table public.conversation_messages
  add constraint conversation_messages_body_check check (char_length(btrim(body)) >= 1);

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
  if char_length(p_body) < 1 then raise exception 'Nội dung không được để trống'; end if;

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

commit;
