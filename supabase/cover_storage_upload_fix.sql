-- Keep cover uploads compressed client-side, while leaving enough Storage headroom.
-- Upload authorization remains restricted by the existing covers_admin_* policies.
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png']::text[]
where id = 'covers';
