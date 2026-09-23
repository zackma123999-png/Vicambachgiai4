-- Preserve the Google OAuth picture separately from the avatar selected on the site.
alter table public.profiles
  add column if not exists google_avatar text;

comment on column public.profiles.google_avatar is
  'Google OAuth profile image URL kept separately from the member-selected avatar.';

with google_pictures as (
  select distinct on (i.user_id)
    i.user_id,
    coalesce(
      nullif(i.identity_data->>'picture', ''),
      nullif(i.identity_data->>'avatar_url', '')
    ) as picture_url
  from auth.identities i
  where i.provider = 'google'
  order by i.user_id, i.updated_at desc nulls last, i.created_at desc nulls last
)
update public.profiles p
set google_avatar = gp.picture_url
from google_pictures gp
where gp.user_id = p.user_id
  and gp.picture_url ~* '^https://([a-z0-9-]+\.)*googleusercontent\.com/';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  google_picture text;
begin
  google_picture := coalesce(
    nullif(new.raw_user_meta_data->>'picture', ''),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  );

  if coalesce(new.raw_app_meta_data->>'provider', '') <> 'google'
     or google_picture !~* '^https://([a-z0-9-]+\.)*googleusercontent\.com/' then
    google_picture := null;
  end if;

  insert into public.profiles
    (user_id, display_name, avatar, google_avatar, bio, role, status, email)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name',''),
      nullif(new.raw_user_meta_data->>'full_name',''),
      split_part(coalesce(new.email,''),'@',1),
      'Doc gia'
    ),
    upper(left(coalesce(
      nullif(new.raw_user_meta_data->>'display_name',''),
      nullif(new.raw_user_meta_data->>'full_name',''),
      split_part(coalesce(new.email,''),'@',1),
      'D'
    ), 1)),
    google_picture,
    '',
    case
      when lower(new.email) = 'jasminenemo3311@gmail.com'
       and new.email_confirmed_at is not null then 'admin'
      else 'reader'
    end,
    'active',
    lower(new.email)
  )
  on conflict (user_id) do update
    set role = excluded.role,
        status = 'active',
        email = excluded.email,
        google_avatar = coalesce(excluded.google_avatar, public.profiles.google_avatar);
  return new;
end;
$function$;

create or replace function private.sync_auth_user_google_avatar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  google_picture text;
begin
  google_picture := coalesce(
    nullif(new.raw_user_meta_data->>'picture', ''),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  );

  if coalesce(new.raw_app_meta_data->>'provider', '') <> 'google'
     or google_picture !~* '^https://([a-z0-9-]+\.)*googleusercontent\.com/' then
    google_picture := null;
  end if;

  update public.profiles
  set google_avatar = google_picture
  where user_id = new.id
    and google_avatar is distinct from google_picture;

  return new;
end;
$function$;

drop trigger if exists on_auth_user_google_avatar_updated on auth.users;
create trigger on_auth_user_google_avatar_updated
after update of raw_user_meta_data, raw_app_meta_data on auth.users
for each row execute function private.sync_auth_user_google_avatar();

revoke all on function private.sync_auth_user_google_avatar() from public, anon, authenticated;
grant execute on function private.sync_auth_user_google_avatar() to supabase_auth_admin;

drop function if exists public.admin_list_members();

create function public.admin_list_members()
returns table(
  user_id uuid,
  display_name text,
  avatar text,
  google_avatar text,
  bio text,
  role text,
  status text,
  created_at timestamptz,
  email text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  if not private.is_admin_internal() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select
      p.user_id,
      p.display_name,
      p.avatar,
      p.google_avatar,
      p.bio,
      p.role,
      p.status,
      p.created_at,
      p.email
    from public.profiles p
    order by p.created_at desc nulls last;
end;
$function$;

revoke all on function public.admin_list_members() from public, anon;
grant execute on function public.admin_list_members() to authenticated, service_role;
