begin;

create table if not exists public.public_profile_cards (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  display_name text not null default 'Độc giả',
  avatar text,
  bio text not null default ''
);

alter table public.public_profile_cards enable row level security;

drop policy if exists public_profile_cards_read on public.public_profile_cards;
create policy public_profile_cards_read on public.public_profile_cards
  for select to anon, authenticated
  using (true);

revoke all on table public.public_profile_cards from public, anon, authenticated;
grant select on table public.public_profile_cards to anon, authenticated;

insert into public.public_profile_cards (user_id, display_name, avatar, bio)
select user_id, display_name, avatar, coalesce(bio, '')
from public.profiles
where status = 'active'
on conflict (user_id) do update set
  display_name = excluded.display_name,
  avatar = excluded.avatar,
  bio = excluded.bio;

create or replace function private.sync_public_profile_card()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
begin
  if new.status = 'active' then
    insert into public.public_profile_cards (user_id, display_name, avatar, bio)
    values (new.user_id, new.display_name, new.avatar, coalesce(new.bio, ''))
    on conflict (user_id) do update set
      display_name = excluded.display_name,
      avatar = excluded.avatar,
      bio = excluded.bio;
  else
    delete from public.public_profile_cards where user_id = new.user_id;
  end if;
  return new;
end
$fn$;

revoke all on function private.sync_public_profile_card() from public;
grant execute on function private.sync_public_profile_card() to postgres;

drop trigger if exists sync_public_profile_card on public.profiles;
create trigger sync_public_profile_card
after insert or update of display_name, avatar, bio, status on public.profiles
for each row execute function private.sync_public_profile_card();

create or replace view public.public_profiles
with (security_invoker = true, security_barrier = true)
as
select user_id, display_name, avatar, bio
from public.public_profile_cards;

revoke all on table public.public_profiles from public, anon, authenticated;
grant select on table public.public_profiles to anon, authenticated;

notify pgrst, 'reload schema';

commit;
