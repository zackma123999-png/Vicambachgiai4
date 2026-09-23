-- Homepage story priority for admin-controlled rail ordering.
alter table public.stories
  add column if not exists home_priority smallint;

comment on column public.stories.home_priority is
  'Optional homepage rail priority. Lower positive values appear first; NULL means normal ordering.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stories_home_priority_range'
      and conrelid = 'public.stories'::regclass
  ) then
    alter table public.stories
      add constraint stories_home_priority_range
      check (home_priority is null or home_priority between 1 and 99);
  end if;
end $$;

create index if not exists stories_home_priority_idx
  on public.stories (home_priority)
  where home_priority is not null;
