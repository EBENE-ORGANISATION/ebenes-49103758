
drop policy if exists "Admin general inserts logos" on storage.objects;
drop policy if exists "Admin general updates logos" on storage.objects;
drop policy if exists "Admin general deletes logos" on storage.objects;

create policy "Logos: insert by admin"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos-societes'
    and (public.is_admin_general(auth.uid()) or public.is_admin(auth.uid()))
  );

create policy "Logos: update by admin"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'logos-societes'
    and (public.is_admin_general(auth.uid()) or public.is_admin(auth.uid()))
  );

create policy "Logos: delete by admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos-societes'
    and (public.is_admin_general(auth.uid()) or public.is_admin(auth.uid()))
  );
