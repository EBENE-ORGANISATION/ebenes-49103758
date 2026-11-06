-- Déploiement de la migration 20261106120000_securite_otp_appareil_app_state.sql.
-- Applique la migration et l'inscrit dans l'historique, en une transaction.
-- Test : supabase/tests/securite_otp_app_state.sql.
-- Rollback : redéployer D'ABORD l'ancienne admin-users du commit 73e5bce,
-- qui n'appelle pas les fonctions, puis exécuter le SQL ci-dessous.
-- Remettre les réglages Auth à leurs valeurs notées avant le changement.
/*
BEGIN;
drop function if exists public.emettre_code_appareil(uuid, text, text);
drop function if exists public.verifier_code_appareil(uuid, text);
drop index if exists public.device_otps_user_created_idx;
alter table public.device_otps drop column if exists essais;
grant select, insert, update, delete on public.device_otps to authenticated;
CREATE POLICY "device_otp_select" ON "public"."device_otps" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));
CREATE POLICY "device_otp_insert" ON "public"."device_otps" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));
CREATE POLICY "device_otp_update" ON "public"."device_otps" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));
CREATE POLICY "Authenticated users can view app_state" ON "public"."app_state" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Service members can insert app_state" ON "public"."app_state" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role") OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'comptable'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'rh'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'saisie'::"public"."app_role")));
CREATE POLICY "Service members can update app_state" ON "public"."app_state" FOR UPDATE TO "authenticated" USING (("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role") OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'comptable'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'rh'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'saisie'::"public"."app_role")));
CREATE POLICY "Chefs and admin can delete app_state" ON "public"."app_state" FOR DELETE TO "authenticated" USING (("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_chef_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_chef_grh"(( SELECT "auth"."uid"() AS "uid"))));
drop policy if exists app_state_signal_maj_lecture on public.app_state;
COMMIT;
*/

BEGIN;
DO $g$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261102125000') THEN
    RAISE EXCEPTION 'Migration 20261102125000 absente de l''historique : arrêt.';
  END IF;
END $g$;

-- Relecture sécurité du 06/11/2026 : codes d'appareil et app_state.
-- Les codes étaient lisibles par le client et sans limite d'essais. Désormais,
-- émission et consommation sont sérialisées par utilisateur, via service_role.
-- app_state conserve les règles par société et la lecture du signal de mise à jour.
-- Test : supabase/tests/securite_otp_app_state.sql.
-- Migration rejouable : IF EXISTS / IF NOT EXISTS et CREATE OR REPLACE.

-- B. device_otps : plus aucun accès direct client
drop policy if exists device_otp_select on public.device_otps;
drop policy if exists device_otp_insert on public.device_otps;
drop policy if exists device_otp_update on public.device_otps;
revoke all on public.device_otps from anon, authenticated;
alter table public.device_otps add column if not exists essais integer not null default 0;
create index if not exists device_otps_user_created_idx on public.device_otps (user_id, created_at desc);

create or replace function public.emettre_code_appareil(_user_id uuid, _code_hash text, _device_fp text)
returns text language plpgsql security invoker set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('device_otp:' || _user_id::text));
  if (select count(*) from public.device_otps
       where user_id = _user_id and created_at > now() - interval '1 hour') >= 5 then
    return 'trop';
  end if;
  delete from public.device_otps where user_id = _user_id and created_at < now() - interval '24 hours';
  update public.device_otps set used = true where user_id = _user_id and used = false;
  insert into public.device_otps (user_id, code_hash, device_fp, expires_at)
  values (_user_id, _code_hash, _device_fp, now() + interval '10 minutes');
  return 'ok';
end $$;

create or replace function public.verifier_code_appareil(_user_id uuid, _code_hash text)
returns text language plpgsql security invoker set search_path = public as $$
declare o record;
begin
  perform pg_advisory_xact_lock(hashtext('device_otp:' || _user_id::text));
  select id, code_hash, essais into o from public.device_otps
   where user_id = _user_id and used = false and expires_at > now()
   order by created_at desc limit 1;
  if not found then return 'absent'; end if;
  if o.code_hash = _code_hash then
    update public.device_otps set used = true where id = o.id;
    return 'ok';
  end if;
  update public.device_otps set essais = essais + 1, used = (essais + 1 >= 5) where id = o.id;
  return case when o.essais + 1 >= 5 then 'bloque' else 'faux' end;
end $$;

revoke all on function public.emettre_code_appareil(uuid, text, text) from public, anon, authenticated;
revoke all on function public.verifier_code_appareil(uuid, text) from public, anon, authenticated;
grant execute on function public.emettre_code_appareil(uuid, text, text) to service_role;
grant execute on function public.verifier_code_appareil(uuid, text) to service_role;

-- C. app_state
drop policy if exists "Authenticated users can view app_state" on public.app_state;
drop policy if exists "Service members can insert app_state" on public.app_state;
drop policy if exists "Service members can update app_state" on public.app_state;
drop policy if exists "Chefs and admin can delete app_state" on public.app_state;
drop policy if exists app_state_signal_maj_lecture on public.app_state;
create policy app_state_signal_maj_lecture on public.app_state
  for select to authenticated using (key = 'global:update_signal');

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261106120000', 'securite_otp_appareil_app_state', ARRAY[$m$-- Relecture sécurité du 06/11/2026 : codes d'appareil et app_state.
-- Les codes étaient lisibles par le client et sans limite d'essais. Désormais,
-- émission et consommation sont sérialisées par utilisateur, via service_role.
-- app_state conserve les règles par société et la lecture du signal de mise à jour.
-- Test : supabase/tests/securite_otp_app_state.sql.
-- Migration rejouable : IF EXISTS / IF NOT EXISTS et CREATE OR REPLACE.

-- B. device_otps : plus aucun accès direct client
drop policy if exists device_otp_select on public.device_otps;
drop policy if exists device_otp_insert on public.device_otps;
drop policy if exists device_otp_update on public.device_otps;
revoke all on public.device_otps from anon, authenticated;
alter table public.device_otps add column if not exists essais integer not null default 0;
create index if not exists device_otps_user_created_idx on public.device_otps (user_id, created_at desc);

create or replace function public.emettre_code_appareil(_user_id uuid, _code_hash text, _device_fp text)
returns text language plpgsql security invoker set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('device_otp:' || _user_id::text));
  if (select count(*) from public.device_otps
       where user_id = _user_id and created_at > now() - interval '1 hour') >= 5 then
    return 'trop';
  end if;
  delete from public.device_otps where user_id = _user_id and created_at < now() - interval '24 hours';
  update public.device_otps set used = true where user_id = _user_id and used = false;
  insert into public.device_otps (user_id, code_hash, device_fp, expires_at)
  values (_user_id, _code_hash, _device_fp, now() + interval '10 minutes');
  return 'ok';
end $$;

create or replace function public.verifier_code_appareil(_user_id uuid, _code_hash text)
returns text language plpgsql security invoker set search_path = public as $$
declare o record;
begin
  perform pg_advisory_xact_lock(hashtext('device_otp:' || _user_id::text));
  select id, code_hash, essais into o from public.device_otps
   where user_id = _user_id and used = false and expires_at > now()
   order by created_at desc limit 1;
  if not found then return 'absent'; end if;
  if o.code_hash = _code_hash then
    update public.device_otps set used = true where id = o.id;
    return 'ok';
  end if;
  update public.device_otps set essais = essais + 1, used = (essais + 1 >= 5) where id = o.id;
  return case when o.essais + 1 >= 5 then 'bloque' else 'faux' end;
end $$;

revoke all on function public.emettre_code_appareil(uuid, text, text) from public, anon, authenticated;
revoke all on function public.verifier_code_appareil(uuid, text) from public, anon, authenticated;
grant execute on function public.emettre_code_appareil(uuid, text, text) to service_role;
grant execute on function public.verifier_code_appareil(uuid, text) to service_role;

-- C. app_state
drop policy if exists "Authenticated users can view app_state" on public.app_state;
drop policy if exists "Service members can insert app_state" on public.app_state;
drop policy if exists "Service members can update app_state" on public.app_state;
drop policy if exists "Chefs and admin can delete app_state" on public.app_state;
drop policy if exists app_state_signal_maj_lecture on public.app_state;
create policy app_state_signal_maj_lecture on public.app_state
  for select to authenticated using (key = 'global:update_signal');
$m$])
ON CONFLICT (version) DO NOTHING;
COMMIT;
