-- Service photos from Réglages. The owner uploads into her own salon's folder of the public
-- `salon-photos` bucket, under `<salon>/uploads/<uuid>.jpg|webp` (the script's files sit directly
-- in `<salon>/` and stay service-role only), then points a service at the file through
-- admin_set_service_photo. Reads stay public through public URLs.

-- Storage: the owner (never the shared demo account) may add, list and delete files only in her
-- own salon's uploads folder. No update policy: files are never overwritten or renamed.
create policy "owner uploads salon photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'salon-photos' and private.my_role() = 'owner'
              and name like private.my_salon() || '/uploads/%');

create policy "owner reads own salon uploads" on storage.objects
  for select to authenticated
  using (bucket_id = 'salon-photos' and private.my_role() = 'owner'
         and name like private.my_salon() || '/uploads/%');

create policy "owner deletes own salon uploads" on storage.objects
  for delete to authenticated
  using (bucket_id = 'salon-photos' and private.my_role() = 'owner'
         and name like private.my_salon() || '/uploads/%');

create function public.admin_set_service_photo(p_id text, p_path text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
-- Sets or removes the photo of one of the caller's services.
-- Input: p_id = the service id; p_path = null or '' to remove the photo, otherwise the storage
-- path of an upload in the caller's own folder ('<salon>/uploads/<uuid>.jpg|webp') that exists
-- in the salon-photos bucket. The path is stored as is in services.image.
-- Returns the previous image when it is one of the salon's uploads that is no longer used (the
-- caller deletes that file); null otherwise, and always null on a demo salon (its reset snapshot
-- may point at old uploads).
-- Raises (P0001): not_authorized (not staff), demo_disabled (demo account), not_found (no such
-- service in the caller's salon), invalid_photo.
declare
  v_salon text := private.my_salon();
  v_new   text := coalesce(p_path, '');
  v_old   text;
  v_demo  boolean;
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if private.my_role() = 'demo' then
    raise exception 'demo_disabled' using errcode = 'P0001';
  end if;

  select s.image into v_old from public.services s where s.id = p_id and s.salon_id = v_salon for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  -- Salon ids match ^[a-z0-9][a-z0-9-]{1,39}$, so they need no escaping in the pattern.
  if v_new <> '' and (
       v_new !~ ('^' || v_salon || '/uploads/[0-9a-f-]{36}\.(jpg|webp)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'salon-photos' and o.name = v_new)) then
    raise exception 'invalid_photo' using errcode = 'P0001';
  end if;

  update public.services s set image = v_new where s.id = p_id and s.salon_id = v_salon;

  select sa.demo into v_demo from public.salons sa where sa.id = v_salon;
  if v_old like v_salon || '/uploads/%' and v_old <> v_new and not v_demo then
    return v_old;
  end if;
  return null;
end;
$$;

revoke execute on function public.admin_set_service_photo(text, text) from public, anon, authenticated;
grant execute on function public.admin_set_service_photo(text, text) to authenticated;
