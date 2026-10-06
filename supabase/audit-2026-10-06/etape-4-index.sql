-- ÉTAPE 4/4 — Index
begin;

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
commit;

-- Enregistre la migration dans l'historique (évite qu'un futur « supabase db push » la rejoue)
insert into supabase_migrations.schema_migrations (version, name)
values ('20261006110000', 'audit_durcissement_securite_perf')
on conflict (version) do nothing;

-- Vérification : doit afficher 18
select count(*) as nouveaux_index from pg_indexes
where schemaname = 'public' and indexname in (
  'articles_activite_id_idx','custom_postes_service_id_idx','custom_services_societe_id_idx','devis_activite_id_idx',
  'ecritures_valide_par_idx','ecritures_activite_id_idx','ecritures_bulletin_id_idx','ecritures_cree_par_idx',
  'ecritures_facture_id_idx','factures_activite_id_idx','fiscal_delegations_granted_by_idx','immobilisations_activite_id_idx',
  'mouvements_stock_activite_id_idx','portail_messages_societe_id_idx','transactions_activite_id_idx',
  'user_custom_postes_societe_id_idx','user_custom_postes_poste_id_idx','user_societes_societe_id_idx');
