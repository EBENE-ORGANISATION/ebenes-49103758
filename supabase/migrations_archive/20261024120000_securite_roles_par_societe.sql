-- Audit sécurité du 24/10/2026 — C1 et H1.
--
-- C1 : le rôle « admin » est global (user_roles n'a pas de societe_id). Les
-- politiques ne testaient que is_admin(uid) : un admin de la société A pouvait
-- s'ajouter à la société B, se donner admin_general, et gérer les comptes de
-- toutes les sociétés. Désormais :
--   * user_roles et user_societes ne s'écrivent plus depuis le client : seules
--     les fonctions Edge (service_role) les modifient ;
--   * un trigger refuse admin_general / super_admin hors service_role ;
--   * un admin ne gère que les utilisateurs qui partagent une de ses sociétés
--     (jamais le super-admin).
--
-- H1 : les empreintes des codes de secours 2FA ne sont plus lisibles par le
-- client ; l'écran lit seulement le nombre de codes restants.

-- ─── Fonction d'aide : l'appelant administre-t-il cet utilisateur ? ─────────
create or replace function public.admin_gere_utilisateur(_admin uuid, _cible uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_admin_general(_admin)
    or (
      public.is_admin(_admin)
      and not public.has_role(_cible, 'admin_general'::public.app_role)
      and not public.has_role(_cible, 'super_admin'::public.app_role)
      and exists (
        select 1
        from public.user_societes moi
        join public.user_societes lui on lui.societe_id = moi.societe_id
        where moi.user_id = _admin and lui.user_id = _cible
      )
    )
$$;

revoke all on function public.admin_gere_utilisateur(uuid, uuid) from public, anon;
grant execute on function public.admin_gere_utilisateur(uuid, uuid) to authenticated, service_role;

-- ─── user_roles : lecture seule pour le client ──────────────────────────────
drop policy if exists "Admins can manage roles - insert" on public.user_roles;
drop policy if exists "Admins can manage roles - update" on public.user_roles;
drop policy if exists "Admins can manage roles - delete" on public.user_roles;
drop policy if exists "Admins can view all roles" on public.user_roles;
create policy "Admins can view roles of their users" on public.user_roles
  for select to authenticated
  using (public.admin_gere_utilisateur((select auth.uid()), user_id));

revoke insert, update, delete, truncate on public.user_roles from anon, authenticated;
revoke all on public.user_roles from anon;

-- Défense en profondeur : le rôle super-admin ne s'attribue que côté serveur.
create or replace function public.bloquer_role_super_admin()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.role::text in ('admin_general', 'super_admin')
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'Attribution du rôle super-admin interdite'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquer_role_super_admin on public.user_roles;
create trigger trg_bloquer_role_super_admin
  before insert or update on public.user_roles
  for each row execute function public.bloquer_role_super_admin();

-- ─── user_societes : lecture seule pour le client ───────────────────────────
drop policy if exists user_societes_insert on public.user_societes;
drop policy if exists user_societes_update on public.user_societes;
drop policy if exists user_societes_delete on public.user_societes;

revoke insert, update, delete, truncate on public.user_societes from anon, authenticated;
revoke all on public.user_societes from anon;

-- Trace des rattachements (il n'y en avait pas sur user_societes).
create or replace function public.audit_user_societes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.audit_log (user_id, action, table_name, record_id, old_data, new_data, societe_id)
  values (
    auth.uid(),
    tg_op,
    'user_societes',
    coalesce(new.user_id, old.user_id)::text,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    coalesce(new.societe_id, old.societe_id)
  );
  return coalesce(new, old);
end;
$$;

-- Fonctions de trigger : pas d'appel via l'API
revoke all on function public.audit_user_societes() from public, anon, authenticated;
revoke all on function public.bloquer_role_super_admin() from public, anon, authenticated;

drop trigger if exists audit_user_societes on public.user_societes;
create trigger audit_user_societes
  after insert or update or delete on public.user_societes
  for each row execute function public.audit_user_societes();

-- ─── profiles : un admin ne voit et ne modifie que ses utilisateurs ─────────
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
drop policy if exists "Admins can delete profiles" on public.profiles;
drop policy if exists "Admins can insert profiles" on public.profiles;

create policy "Admins can view their users profiles" on public.profiles
  for select to authenticated
  using (public.admin_gere_utilisateur((select auth.uid()), user_id));
create policy "Admins can update their users profiles" on public.profiles
  for update to authenticated
  using (public.admin_gere_utilisateur((select auth.uid()), user_id))
  with check (public.admin_gere_utilisateur((select auth.uid()), user_id));
create policy "Admins can delete their users profiles" on public.profiles
  for delete to authenticated
  using (public.admin_gere_utilisateur((select auth.uid()), user_id));
create policy "Users can insert own profile" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Délégation fiscale : retrouver un compte par son e-mail sans lire tous les profils.
create or replace function public.profil_id_par_email(_email text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id
  from public.profiles p
  where p.email = lower(trim(_email))
    and (public.is_admin((select auth.uid())) or public.is_admin_general((select auth.uid())))
  limit 1
$$;

revoke all on function public.profil_id_par_email(text) from public, anon;
grant execute on function public.profil_id_par_email(text) to authenticated, service_role;

-- ─── Droits fins : seulement pour les utilisateurs de ses sociétés ──────────
drop policy if exists "Admins insert overrides" on public.permission_overrides;
drop policy if exists "Admins update overrides" on public.permission_overrides;
drop policy if exists "Admins delete overrides" on public.permission_overrides;
drop policy if exists "Users view own overrides" on public.permission_overrides;
create policy "Users view own overrides" on public.permission_overrides
  for select to authenticated
  using ((select auth.uid()) = user_id or public.admin_gere_utilisateur((select auth.uid()), user_id));
create policy "Admins insert overrides" on public.permission_overrides
  for insert to authenticated
  with check (public.admin_gere_utilisateur((select auth.uid()), user_id));
create policy "Admins update overrides" on public.permission_overrides
  for update to authenticated
  using (public.admin_gere_utilisateur((select auth.uid()), user_id))
  with check (public.admin_gere_utilisateur((select auth.uid()), user_id));
create policy "Admins delete overrides" on public.permission_overrides
  for delete to authenticated
  using (public.admin_gere_utilisateur((select auth.uid()), user_id));

drop policy if exists "Admins insert features" on public.user_feature_access;
drop policy if exists "Admins update features" on public.user_feature_access;
drop policy if exists "Admins delete features" on public.user_feature_access;
drop policy if exists "Users view own features" on public.user_feature_access;
create policy "Users view own features" on public.user_feature_access
  for select to authenticated
  using ((select auth.uid()) = user_id or public.admin_gere_utilisateur((select auth.uid()), user_id));
create policy "Admins insert features" on public.user_feature_access
  for insert to authenticated
  with check (public.admin_gere_utilisateur((select auth.uid()), user_id));
create policy "Admins update features" on public.user_feature_access
  for update to authenticated
  using (public.admin_gere_utilisateur((select auth.uid()), user_id))
  with check (public.admin_gere_utilisateur((select auth.uid()), user_id));
create policy "Admins delete features" on public.user_feature_access
  for delete to authenticated
  using (public.admin_gere_utilisateur((select auth.uid()), user_id));

drop policy if exists "Admins manage grants - all" on public.cross_service_grants;
create policy "Admins manage grants - all" on public.cross_service_grants
  for all to authenticated
  using (public.admin_gere_utilisateur((select auth.uid()), user_id))
  with check (public.admin_gere_utilisateur((select auth.uid()), user_id));

-- ─── Services : l'admin n'écrit que dans ses sociétés ───────────────────────
drop policy if exists services_write_admin on public.services;
create policy services_write_admin on public.services
  for all to authenticated
  using (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid())) and public.has_societe_access((select auth.uid()), societe_id))
  )
  with check (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid())) and public.has_societe_access((select auth.uid()), societe_id))
  );

drop policy if exists service_membres_write_admin on public.service_membres;
create policy service_membres_write_admin on public.service_membres
  for all to authenticated
  using (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid())) and exists (
      select 1 from public.services s
      where s.id = service_membres.service_id
        and public.has_societe_access((select auth.uid()), s.societe_id)
    ))
  )
  with check (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid())) and exists (
      select 1 from public.services s
      where s.id = service_membres.service_id
        and public.has_societe_access((select auth.uid()), s.societe_id)
    ))
  );

-- ─── Logos : dossier = id de la société ─────────────────────────────────────
drop policy if exists "Logos: insert by admin" on storage.objects;
drop policy if exists "Logos: update by admin" on storage.objects;
drop policy if exists "Logos: delete by admin" on storage.objects;
create policy "Logos: insert by admin" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos-societes'
    and (
      public.is_admin_general(auth.uid())
      or (public.is_admin(auth.uid()) and exists (
        select 1 from public.user_societes us
        where us.user_id = auth.uid() and us.societe_id::text = (storage.foldername(name))[1]
      ))
    )
  );
create policy "Logos: update by admin" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos-societes'
    and (
      public.is_admin_general(auth.uid())
      or (public.is_admin(auth.uid()) and exists (
        select 1 from public.user_societes us
        where us.user_id = auth.uid() and us.societe_id::text = (storage.foldername(name))[1]
      ))
    )
  );
create policy "Logos: delete by admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos-societes'
    and (
      public.is_admin_general(auth.uid())
      or (public.is_admin(auth.uid()) and exists (
        select 1 from public.user_societes us
        where us.user_id = auth.uid() and us.societe_id::text = (storage.foldername(name))[1]
      ))
    )
  );

-- ─── H1 : codes de secours 2FA invisibles pour le client ────────────────────
drop policy if exists "Users see own recovery codes" on public.mfa_recovery_codes;
revoke all on public.mfa_recovery_codes from anon, authenticated;
grant all on public.mfa_recovery_codes to service_role;

create or replace function public.nb_codes_secours()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*)::integer
  from public.mfa_recovery_codes
  where user_id = (select auth.uid()) and used_at is null
$$;

revoke all on function public.nb_codes_secours() from public, anon;
grant execute on function public.nb_codes_secours() to authenticated, service_role;

-- Anciennes empreintes SHA-256 sans clé : invalides avec la nouvelle méthode (HMAC).
delete from public.mfa_recovery_codes where code_hash not like 'h1:%';
