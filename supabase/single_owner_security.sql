-- Enforce one verified owner Gmail as the only administrator.
begin;

create or replace function private.is_admin_internal()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.profiles p on p.user_id = u.id
    where u.id = auth.uid()
      and lower(u.email) = 'jasminenemo3311@gmail.com'
      and u.email_confirmed_at is not null
      and lower(p.email) = 'jasminenemo3311@gmail.com'
      and p.role = 'admin'
      and p.status = 'active'
  )
$$;

revoke all on function private.is_admin_internal() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin_internal() to authenticated;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_email constant text := 'jasminenemo3311@gmail.com';
  verified_owner boolean := false;
begin
  select exists (
    select 1 from auth.users u
    where u.id = new.user_id
      and lower(u.email) = owner_email
      and u.email_confirmed_at is not null
  ) into verified_owner;

  if tg_op = 'INSERT' then
    new.email := lower(new.email);
    new.role := case when verified_owner then 'admin' else 'reader' end;
    new.status := 'active';
    if new.avatar = 'vca:16' and not verified_owner then
      raise exception 'Avatar nay chi danh cho chu so huu';
    end if;
    return new;
  end if;

  new.user_id := old.user_id;
  new.email := old.email;

  if lower(old.email) = owner_email then
    new.role := 'admin';
    new.status := 'active';
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Khong duoc thay doi quyen tai khoan';
  end if;
  new.role := 'reader';

  if not public.is_admin() and new.status is distinct from old.status then
    raise exception 'Khong duoc thay doi trang thai tai khoan';
  end if;

  if not public.is_admin() and new.avatar = 'vca:16' then
    raise exception 'Avatar nay chi danh cho chu so huu';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_privileges() from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, avatar, bio, role, status, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(coalesce(new.email,''),'@',1), 'Doc gia'),
    upper(left(coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(coalesce(new.email,''),'@',1), 'D'), 1)),
    '',
    case when lower(new.email) = 'jasminenemo3311@gmail.com' and new.email_confirmed_at is not null then 'admin' else 'reader' end,
    'active',
    lower(new.email)
  )
  on conflict (user_id) do update
    set role = excluded.role,
        status = 'active',
        email = excluded.email;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

update public.profiles p
set role = case when lower(p.email) = 'jasminenemo3311@gmail.com' then 'admin' else 'reader' end,
    status = case when lower(p.email) = 'jasminenemo3311@gmail.com' then 'active' else p.status end;

commit;
