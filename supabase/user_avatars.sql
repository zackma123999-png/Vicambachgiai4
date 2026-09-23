-- Public avatar images; only the authenticated owner may write their folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-avatars', 'user-avatars', true, 153600, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists user_avatars_public_read on storage.objects;
create policy user_avatars_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'user-avatars');

drop policy if exists user_avatars_insert_own on storage.objects;
create policy user_avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'user-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists user_avatars_update_own on storage.objects;
create policy user_avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'user-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'user-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists user_avatars_delete_own on storage.objects;
create policy user_avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'user-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
