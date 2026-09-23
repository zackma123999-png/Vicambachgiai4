begin;

alter table public.public_profile_cards
  add column if not exists is_admin boolean not null default false;

update public.public_profile_cards as card
set is_admin = (profile.role = 'admin')
from public.profiles as profile
where profile.user_id = card.user_id;

create or replace function private.sync_public_profile_card()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
begin
  if new.status = 'active' then
    insert into public.public_profile_cards (user_id, display_name, avatar, bio, is_admin)
    values (new.user_id, new.display_name, new.avatar, coalesce(new.bio, ''), new.role = 'admin')
    on conflict (user_id) do update set
      display_name = excluded.display_name,
      avatar = excluded.avatar,
      bio = excluded.bio,
      is_admin = excluded.is_admin;
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
after insert or update of display_name, avatar, bio, status, role on public.profiles
for each row execute function private.sync_public_profile_card();

create or replace view public.public_profiles
with (security_invoker = true, security_barrier = true)
as
select user_id, display_name, avatar, bio, is_admin
from public.public_profile_cards;

revoke all on table public.public_profiles from public, anon, authenticated;
grant select on table public.public_profiles to anon, authenticated;

notify pgrst, 'reload schema';

commit;
