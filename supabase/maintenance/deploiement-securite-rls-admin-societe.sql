-- Déploiement de la migration 20261027130000_securite_rls_admin_societe.sql
-- (relecture sécurité du 27/10/2026 : postes personnalisés, audit_log, alertes_lues).
-- Applique la migration ET l'inscrit dans l'historique (supabase_migrations.schema_migrations),
-- comme toute migration depuis le schéma de référence du 27/10/2026.
-- Prérequis : l'espace cabinet est appliqué (la règle audit_log_insert appelle cabinet_societes_agit).
-- Tout ou rien : en cas d'erreur, rien n'est appliqué. Quelques secondes de verrous sur
-- custom_services, custom_postes, user_custom_postes, audit_log et alertes_lues.
-- Test : supabase/tests/securite_rls_admin_societe.sql.
-- Généré depuis supabase/migrations le 2026-10-28 ; ne pas modifier à la main.
BEGIN;
DO $g$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261027000001') THEN
    RAISE EXCEPTION 'Schéma de référence absent de l''historique : arrêt.';
  END IF;
  IF to_regprocedure('public.cabinet_societes_agit()') IS NULL THEN
    RAISE EXCEPTION 'L''espace cabinet n''est pas appliqué en production : arrêt.';
  END IF;
END $g$;

-- ===== 20261027130000_securite_rls_admin_societe.sql =====
-- Relecture sécurité du 27/10/2026 (chantier espace cabinet) : trois défauts
-- antérieurs. Test : supabase/tests/securite_rls_admin_societe.sql.
--
-- 1. custom_services, custom_postes, user_custom_postes : la règle FOR ALL
--    « has_societe_access » laissait tout membre de la société, employé
--    compris, créer, modifier et supprimer services, postes et affectations.
--    Désormais : lecture pour les membres, écriture pour les administrateurs
--    de la société seulement. Une affectation doit en plus viser un utilisateur
--    de la société et un poste de cette même société.
-- 2. audit_log : WITH CHECK (user_id = auth.uid()) laissait écrire une ligne
--    pour n'importe quelle société, sans société, ou au nom d'un autre e-mail.
--    Désormais : pour soi, avec l'e-mail de sa session, dans une société à
--    laquelle on a accès, directement ou au titre d'un cabinet. Le trigger
--    audit_trigger_fn (SECURITY DEFINER, propriétaire postgres) et les
--    fonctions Edge (service_role) ne passent pas par cette règle.
-- 3. alertes_lues : « is_admin » étant global, tout administrateur lisait les
--    alertes lues de toutes les sociétés. Désormais limité à ses sociétés.
--
-- Migration rejouable : DROP POLICY IF EXISTS avant chaque CREATE POLICY.

-- ─── 1. custom_services ─────────────────────────────────────────────────────
drop policy if exists custom_services_all on public.custom_services;
drop policy if exists custom_services_select on public.custom_services;
drop policy if exists custom_services_insert on public.custom_services;
drop policy if exists custom_services_update on public.custom_services;
drop policy if exists custom_services_delete on public.custom_services;

create policy custom_services_select on public.custom_services
  for select to authenticated
  using (public.has_societe_access((select auth.uid()), societe_id));

create policy custom_services_insert on public.custom_services
  for insert to authenticated
  with check (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id))
  );

create policy custom_services_update on public.custom_services
  for update to authenticated
  using (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id))
  )
  with check (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id))
  );

create policy custom_services_delete on public.custom_services
  for delete to authenticated
  using (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id))
  );

-- ─── 1. custom_postes (société portée par le service) ───────────────────────
drop policy if exists custom_postes_all on public.custom_postes;
drop policy if exists custom_postes_select on public.custom_postes;
drop policy if exists custom_postes_insert on public.custom_postes;
drop policy if exists custom_postes_update on public.custom_postes;
drop policy if exists custom_postes_delete on public.custom_postes;

create policy custom_postes_select on public.custom_postes
  for select to authenticated
  using (exists (
    select 1 from public.custom_services cs
    where cs.id = custom_postes.service_id
      and public.has_societe_access((select auth.uid()), cs.societe_id)
  ));

create policy custom_postes_insert on public.custom_postes
  for insert to authenticated
  with check (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid())) and exists (
      select 1 from public.custom_services cs
      where cs.id = custom_postes.service_id
        and public.has_societe_access((select auth.uid()), cs.societe_id)
    ))
  );

create policy custom_postes_update on public.custom_postes
  for update to authenticated
  using (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid())) and exists (
      select 1 from public.custom_services cs
      where cs.id = custom_postes.service_id
        and public.has_societe_access((select auth.uid()), cs.societe_id)
    ))
  )
  with check (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid())) and exists (
      select 1 from public.custom_services cs
      where cs.id = custom_postes.service_id
        and public.has_societe_access((select auth.uid()), cs.societe_id)
    ))
  );

create policy custom_postes_delete on public.custom_postes
  for delete to authenticated
  using (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid())) and exists (
      select 1 from public.custom_services cs
      where cs.id = custom_postes.service_id
        and public.has_societe_access((select auth.uid()), cs.societe_id)
    ))
  );

-- ─── 1. user_custom_postes ──────────────────────────────────────────────────
-- Écriture : administrateur de la société, qui gère l'utilisateur visé
-- (admin_gere_utilisateur : jamais le super-admin) ; l'utilisateur appartient à
-- la société et le poste relève d'un service de la même société.
drop policy if exists user_custom_postes_all on public.user_custom_postes;
drop policy if exists user_custom_postes_select on public.user_custom_postes;
drop policy if exists user_custom_postes_insert on public.user_custom_postes;
drop policy if exists user_custom_postes_update on public.user_custom_postes;
drop policy if exists user_custom_postes_delete on public.user_custom_postes;

create policy user_custom_postes_select on public.user_custom_postes
  for select to authenticated
  using (public.has_societe_access((select auth.uid()), societe_id));

create policy user_custom_postes_insert on public.user_custom_postes
  for insert to authenticated
  with check (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id)
        and public.admin_gere_utilisateur((select auth.uid()), user_id)
        and public.has_societe_access(user_id, societe_id)
        and exists (
          select 1 from public.custom_postes cp
          join public.custom_services cs on cs.id = cp.service_id
          where cp.id = user_custom_postes.poste_id
            and cs.societe_id = user_custom_postes.societe_id
        ))
  );

create policy user_custom_postes_update on public.user_custom_postes
  for update to authenticated
  using (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id)
        and public.admin_gere_utilisateur((select auth.uid()), user_id))
  )
  with check (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id)
        and public.admin_gere_utilisateur((select auth.uid()), user_id)
        and public.has_societe_access(user_id, societe_id)
        and exists (
          select 1 from public.custom_postes cp
          join public.custom_services cs on cs.id = cp.service_id
          where cp.id = user_custom_postes.poste_id
            and cs.societe_id = user_custom_postes.societe_id
        ))
  );

create policy user_custom_postes_delete on public.user_custom_postes
  for delete to authenticated
  using (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id)
        and public.admin_gere_utilisateur((select auth.uid()), user_id))
  );

-- ─── 2. audit_log ───────────────────────────────────────────────────────────
-- logAction (src/lib/audit.ts) envoie toujours la société courante ; les lignes
-- sans société viennent du trigger ou des fonctions Edge. Un membre de cabinet
-- n'a pas de ligne user_societes chez ses clients : il y écrit au titre du
-- cabinet (cabinet_societes_agit, cabinet_id recalculé par
-- trg_audit_log_cabinet_client).
drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and user_email is not distinct from ((select auth.jwt()) ->> 'email')
    and societe_id is not null
    and (public.has_societe_access((select auth.uid()), societe_id)
         or societe_id = any ((select public.cabinet_societes_agit())::uuid[]))
  );

-- ─── 3. alertes_lues ────────────────────────────────────────────────────────
-- Pas de branche cabinet : un membre de cabinet lit ses propres lignes (il n'en
-- a pas chez un client, l'insertion exigeant has_societe_access) et jamais
-- celles des utilisateurs du client.
drop policy if exists alertes_lues_select_own on public.alertes_lues;
create policy alertes_lues_select_own on public.alertes_lues
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id))
  );

-- ===== Historique des migrations =====
INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('20261027130000', 'securite_rls_admin_societe', ARRAY[$m$-- Relecture sécurité du 27/10/2026 (chantier espace cabinet) : trois défauts
-- antérieurs. Test : supabase/tests/securite_rls_admin_societe.sql.
--
-- 1. custom_services, custom_postes, user_custom_postes : la règle FOR ALL
--    « has_societe_access » laissait tout membre de la société, employé
--    compris, créer, modifier et supprimer services, postes et affectations.
--    Désormais : lecture pour les membres, écriture pour les administrateurs
--    de la société seulement. Une affectation doit en plus viser un utilisateur
--    de la société et un poste de cette même société.
-- 2. audit_log : WITH CHECK (user_id = auth.uid()) laissait écrire une ligne
--    pour n'importe quelle société, sans société, ou au nom d'un autre e-mail.
--    Désormais : pour soi, avec l'e-mail de sa session, dans une société à
--    laquelle on a accès, directement ou au titre d'un cabinet. Le trigger
--    audit_trigger_fn (SECURITY DEFINER, propriétaire postgres) et les
--    fonctions Edge (service_role) ne passent pas par cette règle.
-- 3. alertes_lues : « is_admin » étant global, tout administrateur lisait les
--    alertes lues de toutes les sociétés. Désormais limité à ses sociétés.
--
-- Migration rejouable : DROP POLICY IF EXISTS avant chaque CREATE POLICY.

-- ─── 1. custom_services ─────────────────────────────────────────────────────
drop policy if exists custom_services_all on public.custom_services;
drop policy if exists custom_services_select on public.custom_services;
drop policy if exists custom_services_insert on public.custom_services;
drop policy if exists custom_services_update on public.custom_services;
drop policy if exists custom_services_delete on public.custom_services;

create policy custom_services_select on public.custom_services
  for select to authenticated
  using (public.has_societe_access((select auth.uid()), societe_id));

create policy custom_services_insert on public.custom_services
  for insert to authenticated
  with check (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id))
  );

create policy custom_services_update on public.custom_services
  for update to authenticated
  using (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id))
  )
  with check (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id))
  );

create policy custom_services_delete on public.custom_services
  for delete to authenticated
  using (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id))
  );

-- ─── 1. custom_postes (société portée par le service) ───────────────────────
drop policy if exists custom_postes_all on public.custom_postes;
drop policy if exists custom_postes_select on public.custom_postes;
drop policy if exists custom_postes_insert on public.custom_postes;
drop policy if exists custom_postes_update on public.custom_postes;
drop policy if exists custom_postes_delete on public.custom_postes;

create policy custom_postes_select on public.custom_postes
  for select to authenticated
  using (exists (
    select 1 from public.custom_services cs
    where cs.id = custom_postes.service_id
      and public.has_societe_access((select auth.uid()), cs.societe_id)
  ));

create policy custom_postes_insert on public.custom_postes
  for insert to authenticated
  with check (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid())) and exists (
      select 1 from public.custom_services cs
      where cs.id = custom_postes.service_id
        and public.has_societe_access((select auth.uid()), cs.societe_id)
    ))
  );

create policy custom_postes_update on public.custom_postes
  for update to authenticated
  using (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid())) and exists (
      select 1 from public.custom_services cs
      where cs.id = custom_postes.service_id
        and public.has_societe_access((select auth.uid()), cs.societe_id)
    ))
  )
  with check (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid())) and exists (
      select 1 from public.custom_services cs
      where cs.id = custom_postes.service_id
        and public.has_societe_access((select auth.uid()), cs.societe_id)
    ))
  );

create policy custom_postes_delete on public.custom_postes
  for delete to authenticated
  using (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid())) and exists (
      select 1 from public.custom_services cs
      where cs.id = custom_postes.service_id
        and public.has_societe_access((select auth.uid()), cs.societe_id)
    ))
  );

-- ─── 1. user_custom_postes ──────────────────────────────────────────────────
-- Écriture : administrateur de la société, qui gère l'utilisateur visé
-- (admin_gere_utilisateur : jamais le super-admin) ; l'utilisateur appartient à
-- la société et le poste relève d'un service de la même société.
drop policy if exists user_custom_postes_all on public.user_custom_postes;
drop policy if exists user_custom_postes_select on public.user_custom_postes;
drop policy if exists user_custom_postes_insert on public.user_custom_postes;
drop policy if exists user_custom_postes_update on public.user_custom_postes;
drop policy if exists user_custom_postes_delete on public.user_custom_postes;

create policy user_custom_postes_select on public.user_custom_postes
  for select to authenticated
  using (public.has_societe_access((select auth.uid()), societe_id));

create policy user_custom_postes_insert on public.user_custom_postes
  for insert to authenticated
  with check (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id)
        and public.admin_gere_utilisateur((select auth.uid()), user_id)
        and public.has_societe_access(user_id, societe_id)
        and exists (
          select 1 from public.custom_postes cp
          join public.custom_services cs on cs.id = cp.service_id
          where cp.id = user_custom_postes.poste_id
            and cs.societe_id = user_custom_postes.societe_id
        ))
  );

create policy user_custom_postes_update on public.user_custom_postes
  for update to authenticated
  using (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id)
        and public.admin_gere_utilisateur((select auth.uid()), user_id))
  )
  with check (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id)
        and public.admin_gere_utilisateur((select auth.uid()), user_id)
        and public.has_societe_access(user_id, societe_id)
        and exists (
          select 1 from public.custom_postes cp
          join public.custom_services cs on cs.id = cp.service_id
          where cp.id = user_custom_postes.poste_id
            and cs.societe_id = user_custom_postes.societe_id
        ))
  );

create policy user_custom_postes_delete on public.user_custom_postes
  for delete to authenticated
  using (
    public.is_admin_general((select auth.uid()))
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id)
        and public.admin_gere_utilisateur((select auth.uid()), user_id))
  );

-- ─── 2. audit_log ───────────────────────────────────────────────────────────
-- logAction (src/lib/audit.ts) envoie toujours la société courante ; les lignes
-- sans société viennent du trigger ou des fonctions Edge. Un membre de cabinet
-- n'a pas de ligne user_societes chez ses clients : il y écrit au titre du
-- cabinet (cabinet_societes_agit, cabinet_id recalculé par
-- trg_audit_log_cabinet_client).
drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and user_email is not distinct from ((select auth.jwt()) ->> 'email')
    and societe_id is not null
    and (public.has_societe_access((select auth.uid()), societe_id)
         or societe_id = any ((select public.cabinet_societes_agit())::uuid[]))
  );

-- ─── 3. alertes_lues ────────────────────────────────────────────────────────
-- Pas de branche cabinet : un membre de cabinet lit ses propres lignes (il n'en
-- a pas chez un client, l'insertion exigeant has_societe_access) et jamais
-- celles des utilisateurs du client.
drop policy if exists alertes_lues_select_own on public.alertes_lues;
create policy alertes_lues_select_own on public.alertes_lues
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or (public.is_admin((select auth.uid()))
        and public.has_societe_access((select auth.uid()), societe_id))
  );
$m$])
ON CONFLICT (version) DO NOTHING;
COMMIT;
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
