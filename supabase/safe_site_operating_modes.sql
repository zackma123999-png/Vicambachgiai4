-- Explicit, fail-open site operating modes.
-- Only an active admin may change the single settings row.
alter table public.site_settings
  add column if not exists site_mode text not null default 'normal',
  add column if not exists maintenance_message text not null default '',
  add column if not exists maintenance_until timestamptz,
  add column if not exists mode_reason text not null default '',
  add column if not exists mode_updated_at timestamptz,
  add column if not exists mode_updated_by uuid;

alter table public.site_settings
  drop constraint if exists site_settings_mode_valid;
alter table public.site_settings
  add constraint site_settings_mode_valid
  check (site_mode in ('normal', 'readonly', 'maintenance'));

-- Unknown, missing or expired configuration always resolves to normal/open.
create or replace function public.site_effective_mode()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when s.site_mode = 'maintenance'
      and s.maintenance_until is not null
      and s.maintenance_until <= now() then 'normal'
    when s.site_mode in ('normal', 'readonly', 'maintenance') then s.site_mode
    else 'normal'
  end
  from public.site_settings s
  where s.id = 1
  union all select 'normal'
  limit 1;
$$;

create or replace function public.site_reader_writes_allowed()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(public.site_effective_mode() = 'normal', true)
         or public.is_admin();
$$;

grant execute on function public.site_effective_mode() to anon, authenticated;
grant execute on function public.site_reader_writes_allowed() to anon, authenticated;

-- Restrictive policies are AND-ed with existing ownership/write policies.
do $$
declare
  target_table text;
  operation text;
begin
  foreach target_table in array array[
    'favorites','follows','reading_progress','reading_history',
    'comments','comment_replies','comment_likes','comment_reactions',
    'paragraph_reactions','chapter_likes','ratings','poll_votes','inbox',
    'notifications','profiles','views','site_daily_visitors'
  ] loop
    foreach operation in array array['insert','update','delete'] loop
      execute format('drop policy if exists %I on public.%I',
        'site_mode_guard_' || operation, target_table);
      if operation = 'insert' then
        execute format('create policy %I on public.%I as restrictive for insert to anon, authenticated with check (public.site_reader_writes_allowed())',
          'site_mode_guard_' || operation, target_table);
      elsif operation = 'update' then
        execute format('create policy %I on public.%I as restrictive for update to anon, authenticated using (public.site_reader_writes_allowed()) with check (public.site_reader_writes_allowed())',
          'site_mode_guard_' || operation, target_table);
      else
        execute format('create policy %I on public.%I as restrictive for delete to anon, authenticated using (public.site_reader_writes_allowed())',
          'site_mode_guard_' || operation, target_table);
      end if;
    end loop;
  end loop;
end $$;
