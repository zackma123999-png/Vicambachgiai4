-- Remove all site-wide operating/lock modes. Normal authorization and RLS
-- policies continue to protect user data.
do $$
declare
  target_table text;
  operation text;
begin
  foreach target_table in array array[
    'profiles','favorites','follows','reading_progress','reading_history',
    'comments','comment_replies','comment_likes','chapter_likes','ratings',
    'notifications','poll_votes','inbox','views'
  ] loop
    foreach operation in array array['insert','update','delete'] loop
      execute format('drop policy if exists %I on public.%I',
        'site_mode_guard_' || operation, target_table);
    end loop;
  end loop;
end $$;

drop function if exists public.site_reader_writes_allowed();
drop index if exists public.site_settings_mode_updated_by_idx;
alter table public.site_settings
  drop constraint if exists site_settings_mode_valid,
  drop column if exists site_mode,
  drop column if exists maintenance_message,
  drop column if exists maintenance_until,
  drop column if exists mode_updated_at,
  drop column if exists mode_updated_by;
