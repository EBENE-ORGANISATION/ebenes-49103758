-- Audit 2026-10-06 — durcissement sécurité + performance RLS.
-- À appliquer en production : supabase db push (ou SQL Editor).

-- 1. Rotation du secret interne (il a pu être lu tant que la fonction était publique).
--    Edge Functions et triggers le relisent dans le Vault à chaque appel : pas d'autre changement requis.
select vault.update_secret(
  (select id from vault.secrets where name = 'internal_webhook_secret'),
  encode(extensions.gen_random_bytes(32), 'hex')
);

-- 2. Les triggers de notification appelaient encore l'ancien projet Lovable
--    (nmeyylvltlvvcvbhvxpz) : les notifications de validation partaient vers la mauvaise base.
do $$
declare f text; def text;
begin
  foreach f in array array['public.notify_validation_change()', 'public.notify_validation_insert()'] loop
    def := pg_get_functiondef(f::regprocedure);
    def := replace(def, 'nmeyylvltlvvcvbhvxpz', 'yblucgmxofyelziwlvxu');
    def := replace(def, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tZXl5bHZsdGx2dmN2Ymh2eHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMDE5MjcsImV4cCI6MjA5Mjc3NzkyN30.WHA2ss_eKgLiumvinjfd7NaL-FggH5TbVgpqUvDKh5Q', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlibHVjZ214b2Z5ZWx6aXdsdnh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODgxNzUsImV4cCI6MjA5Mjg2NDE3NX0.BI4CPBi1_lWYx-n9eCg_OErZhb94DGbq8VEhEn9hNZg');
    execute def;
  end loop;
end $$;

-- 3. Fonctions trigger : jamais appelées directement, retirer l'accès API.
revoke execute on function public.audit_trigger_fn(), public.handle_new_societe(), public.handle_new_user(),
  public.notify_validation_change(), public.notify_validation_insert(), public.trg_recalc_set_impots()
  from public, anon, authenticated;

-- 4. Helpers SECURITY DEFINER non utilisés par des policies anon : fermés aux visiteurs non connectés.
--    (Ceux utilisés par des policies TO public — is_admin, has_societe_access… — restent exécutables,
--     sinon les requêtes anon échoueraient.)
revoke execute on function public.has_role(uuid, public.app_role), public.is_chef(uuid), public.is_chef_compta(uuid),
  public.is_chef_grh(uuid), public.is_employe(uuid), public.has_active_grant(uuid, text),
  public.has_active_chef_grant(uuid, text), public.is_modele_societe(uuid)
  from public, anon;

-- 5. search_path figé (lint function_search_path_mutable).
alter function public.app_state_societe_id(text) set search_path = public;
alter function public.has_societe_access(uuid) set search_path = public;
alter function public.has_societe_access(uuid, uuid) set search_path = public;
alter function public.is_admin() set search_path = public;
alter function public.is_admin_general() set search_path = public;
alter function public.is_admin_general(uuid) set search_path = public;
alter function public.set_ecritures_updated_at() set search_path = public;
alter function public.set_updated_at() set search_path = public;

-- 6. RLS : auth.uid() évalué une fois par requête au lieu d'une fois par ligne (149 policies).
do $$
declare r record; q text; c text;
begin
  for r in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := regexp_replace(r.qual,       '(?<!SELECT )auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g');
    c := regexp_replace(r.with_check, '(?<!SELECT )auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g');
    if q is distinct from r.qual then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, q);
    end if;
    if c is distinct from r.with_check then
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, c);
    end if;
  end loop;
end $$;

-- 7. Index en double.
drop index if exists public.idx_app_state_key;
drop index if exists public.idx_employes_societe;
drop index if exists public.transactions_societe_annee_mois_idx;
drop index if exists public.idx_taux_societe_date;
alter table public.bulletins_paie drop constraint if exists bulletins_unique_employe_periode;

-- 8. Index sur les clés étrangères.
create index if not exists articles_activite_id_idx on public.articles (activite_id);
create index if not exists custom_postes_service_id_idx on public.custom_postes (service_id);
create index if not exists custom_services_societe_id_idx on public.custom_services (societe_id);
create index if not exists devis_activite_id_idx on public.devis (activite_id);
create index if not exists ecritures_valide_par_idx on public.ecritures_comptables (valide_par);
create index if not exists ecritures_activite_id_idx on public.ecritures_comptables (activite_id);
create index if not exists ecritures_bulletin_id_idx on public.ecritures_comptables (bulletin_id);
create index if not exists ecritures_cree_par_idx on public.ecritures_comptables (cree_par);
create index if not exists ecritures_facture_id_idx on public.ecritures_comptables (facture_id);
create index if not exists factures_activite_id_idx on public.factures (activite_id);
create index if not exists fiscal_delegations_granted_by_idx on public.fiscal_delegations (granted_by);
create index if not exists immobilisations_activite_id_idx on public.immobilisations (activite_id);
create index if not exists mouvements_stock_activite_id_idx on public.mouvements_stock (activite_id);
create index if not exists portail_messages_societe_id_idx on public.portail_messages (societe_id);
create index if not exists transactions_activite_id_idx on public.transactions (activite_id);
create index if not exists user_custom_postes_societe_id_idx on public.user_custom_postes (societe_id);
create index if not exists user_custom_postes_poste_id_idx on public.user_custom_postes (poste_id);
create index if not exists user_societes_societe_id_idx on public.user_societes (societe_id);
