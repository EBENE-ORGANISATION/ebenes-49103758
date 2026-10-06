-- ÉTAPE 2/4 — Droits des fonctions + search_path
begin;

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

commit;

-- Vérification : toutes les lignes doivent afficher anon = false
select s as fonction, has_function_privilege('anon', s::regprocedure, 'execute') as anon
from unnest(array['public.audit_trigger_fn()','public.handle_new_user()','public.has_role(uuid, public.app_role)','public.is_chef(uuid)','public.get_internal_webhook_secret()']) s;
