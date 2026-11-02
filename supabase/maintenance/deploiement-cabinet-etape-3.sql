-- Déploiement de l'espace cabinet, étape 3, tâches 1 à 3 :
--   20261102120000 tâches programmées (alertes quotidiennes vers ce projet) ;
--   20261102121000 invitations par le client ;
--   20261102122000 demandes de départ.
-- Chaque migration est inscrite dans l'historique ; une seule transaction.
-- À lancer une fois. Généré depuis supabase/migrations ; ne pas modifier à la main.
BEGIN;
DO $g$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261102110000') THEN
    RAISE EXCEPTION 'La migration 20261102110000 n est pas inscrite : arrêt.';
  END IF;
END $g$;

-- ─── 20261102120000_taches_programmees ───
-- Rétablit les alertes sur ce projet avec le secret du coffre,
-- sans conserver de clé publique dans la commande programmée.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.appeler_fonction_interne(
  _fonction text,
  _corps jsonb DEFAULT '{}'::jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  secret text;
BEGIN
  IF _fonction IS NULL OR _fonction !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'FONCTION_INVALIDE: nom de fonction interne invalide.';
  END IF;

  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_webhook_secret'
  LIMIT 1;

  IF secret IS NULL OR secret = '' THEN
    RAISE EXCEPTION 'SECRET_ABSENT: le secret interne du coffre est absent ou vide.';
  END IF;

  RETURN net.http_post(
    url := 'https://yblucgmxofyelziwlvxu.supabase.co/functions/v1/' || _fonction,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Secret', secret
    ),
    body := coalesce(_corps, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.appeler_fonction_interne(text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.appeler_fonction_interne(text, jsonb) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-alertes-daily') THEN
    PERFORM cron.unschedule('notification-alertes-daily');
  END IF;
END;
$$;

SELECT cron.schedule(
  'notification-alertes-daily',
  '0 8 * * *',
  $$SELECT private.appeler_fonction_interne('notification-alertes')$$
);
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261102120000', 'taches_programmees', ARRAY[$migration_sql$-- Rétablit les alertes sur ce projet avec le secret du coffre,
-- sans conserver de clé publique dans la commande programmée.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.appeler_fonction_interne(
  _fonction text,
  _corps jsonb DEFAULT '{}'::jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  secret text;
BEGIN
  IF _fonction IS NULL OR _fonction !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'FONCTION_INVALIDE: nom de fonction interne invalide.';
  END IF;

  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_webhook_secret'
  LIMIT 1;

  IF secret IS NULL OR secret = '' THEN
    RAISE EXCEPTION 'SECRET_ABSENT: le secret interne du coffre est absent ou vide.';
  END IF;

  RETURN net.http_post(
    url := 'https://yblucgmxofyelziwlvxu.supabase.co/functions/v1/' || _fonction,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Secret', secret
    ),
    body := coalesce(_corps, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.appeler_fonction_interne(text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.appeler_fonction_interne(text, jsonb) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-alertes-daily') THEN
    PERFORM cron.unschedule('notification-alertes-daily');
  END IF;
END;
$$;

SELECT cron.schedule(
  'notification-alertes-daily',
  '0 8 * * *',
  $$SELECT private.appeler_fonction_interne('notification-alertes')$$
);
$migration_sql$])
ON CONFLICT (version) DO NOTHING;

-- ─── 20261102121000_cabinet_invitations ───
-- Espace cabinet, étape 3 : invitations du client (plan du 2026-11-02).

-- ─── cabinets_annuaire ─────────────────────────────────────────────────────
-- Administrateurs : identifiant et nom seulement, cabinets actifs par nom.
CREATE OR REPLACE FUNCTION public.cabinets_annuaire()
RETURNS TABLE (id uuid, nom text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.is_admin_general(auth.uid())) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Annuaire réservé aux administrateurs.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT c.id, c.nom FROM public.cabinets c WHERE c.actif ORDER BY c.nom, c.id;
END
$function$;

-- ─── cabinet_inviter ───────────────────────────────────────────────────────
-- Administrateur du client uniquement. Aucun accès avant acceptation.
-- L'index unique arbitre les invitations concurrentes, même vers deux cabinets.
CREATE OR REPLACE FUNCTION public.cabinet_inviter(_societe uuid, _cabinet uuid, _mission public.mission_cabinet)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  c public.cabinets%ROWTYPE;
  lien uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.cabinet_admin_client(auth.uid(), _societe) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul l''administrateur du client peut inviter un cabinet.' USING ERRCODE = '42501';
  END IF;
  IF _mission IS NULL THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: La mission est obligatoire.';
  END IF;
  SELECT * INTO c FROM public.cabinets x WHERE x.id = _cabinet FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Cabinet introuvable.';
  END IF;
  IF NOT c.actif THEN
    RAISE EXCEPTION 'CABINET_INACTIF: Ce cabinet est désactivé.';
  END IF;
  IF _societe = c.societe_propre_id THEN
    RAISE EXCEPTION 'CABINET_SOCIETE_PROPRE: La propre société du cabinet ne peut pas être un dossier client.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cabinet_dossiers d WHERE d.societe_id = _societe AND d.etat <> 'termine') THEN
    RAISE EXCEPTION 'CABINET_DEJA_LIE: Cette société est déjà suivie par un cabinet.';
  END IF;
  BEGIN
    INSERT INTO public.cabinet_dossiers (societe_id, cabinet_id, mission, etat, origine)
    VALUES (_societe, _cabinet, _mission, 'invitation', 'client') RETURNING id INTO lien;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'CABINET_DEJA_LIE: Cette société est déjà suivie par un cabinet.';
  END;
  RETURN lien;
END
$function$;

-- ─── cabinet_repondre_invitation ────────────────────────────────────────────
-- Responsable actif du cabinet actif. Contrôle avant verrou puis relecture.
-- L'acceptation vérifie le double accès, sans limite de dossiers.
CREATE OR REPLACE FUNCTION public.cabinet_repondre_invitation(_dossier uuid, _accepter boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  d public.cabinet_dossiers%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF NOT private.cabinet_responsable_actif(auth.uid(), d.cabinet_id) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul un responsable du cabinet peut répondre à l''invitation.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier FOR UPDATE;
  IF d.etat <> 'invitation' THEN
    RAISE EXCEPTION 'CABINET_ETAT: Ce dossier n''est pas dans l''état attendu.';
  END IF;
  IF _accepter IS NULL THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: La réponse est obligatoire.';
  END IF;
  IF _accepter AND EXISTS (
    SELECT 1 FROM public.cabinet_membres m
    JOIN public.user_societes us ON us.user_id = m.user_id AND us.societe_id = d.societe_id
    WHERE m.cabinet_id = d.cabinet_id AND m.actif
  ) THEN
    RAISE EXCEPTION 'CABINET_ACCES_DIRECT: Un membre actif du cabinet a déjà un accès direct à cette société.';
  END IF;
  UPDATE public.cabinet_dossiers x
  SET etat = CASE WHEN _accepter THEN 'actif'::public.etat_dossier_cabinet ELSE 'termine'::public.etat_dossier_cabinet END,
      termine_le = CASE WHEN _accepter THEN NULL ELSE now() END
  WHERE x.id = _dossier;
END
$function$;

-- ─── cabinet_annuler_invitation ─────────────────────────────────────────────
-- Administrateur du client uniquement, avant réponse ; historique conservé.
CREATE OR REPLACE FUNCTION public.cabinet_annuler_invitation(_dossier uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  d public.cabinet_dossiers%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF auth.uid() IS NULL OR NOT public.cabinet_admin_client(auth.uid(), d.societe_id) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul l''administrateur du client peut retirer l''invitation.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier FOR UPDATE;
  IF d.etat <> 'invitation' THEN
    RAISE EXCEPTION 'CABINET_ETAT: Ce dossier n''est pas dans l''état attendu.';
  END IF;
  UPDATE public.cabinet_dossiers x SET etat = 'termine', termine_le = now() WHERE x.id = _dossier;
END
$function$;

-- ─── cabinet_invitations_recues ─────────────────────────────────────────────
-- Nom du client avant ouverture des données métier. Autres appelants : vide.
CREATE OR REPLACE FUNCTION public.cabinet_invitations_recues()
RETURNS TABLE (dossier_id uuid, societe_id uuid, societe_nom text, mission public.mission_cabinet, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT d.id, d.societe_id, s.nom, d.mission, d.created_at
  FROM public.cabinet_dossiers d JOIN public.societes s ON s.id = d.societe_id
  WHERE d.etat = 'invitation' AND private.cabinet_responsable_actif(auth.uid(), d.cabinet_id)
  ORDER BY d.created_at, d.id
$function$;

-- ─── Droits d'exécution ────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.cabinets_annuaire() FROM public, anon;
REVOKE ALL ON FUNCTION public.cabinet_inviter(uuid, uuid, public.mission_cabinet) FROM public, anon;
REVOKE ALL ON FUNCTION public.cabinet_repondre_invitation(uuid, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.cabinet_annuler_invitation(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.cabinet_invitations_recues() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cabinets_annuaire() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cabinet_inviter(uuid, uuid, public.mission_cabinet) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cabinet_repondre_invitation(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cabinet_annuler_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cabinet_invitations_recues() TO authenticated;
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261102121000', 'cabinet_invitations', ARRAY[$migration_sql$-- Espace cabinet, étape 3 : invitations du client (plan du 2026-11-02).

-- ─── cabinets_annuaire ─────────────────────────────────────────────────────
-- Administrateurs : identifiant et nom seulement, cabinets actifs par nom.
CREATE OR REPLACE FUNCTION public.cabinets_annuaire()
RETURNS TABLE (id uuid, nom text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.is_admin_general(auth.uid())) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Annuaire réservé aux administrateurs.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT c.id, c.nom FROM public.cabinets c WHERE c.actif ORDER BY c.nom, c.id;
END
$function$;

-- ─── cabinet_inviter ───────────────────────────────────────────────────────
-- Administrateur du client uniquement. Aucun accès avant acceptation.
-- L'index unique arbitre les invitations concurrentes, même vers deux cabinets.
CREATE OR REPLACE FUNCTION public.cabinet_inviter(_societe uuid, _cabinet uuid, _mission public.mission_cabinet)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  c public.cabinets%ROWTYPE;
  lien uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.cabinet_admin_client(auth.uid(), _societe) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul l''administrateur du client peut inviter un cabinet.' USING ERRCODE = '42501';
  END IF;
  IF _mission IS NULL THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: La mission est obligatoire.';
  END IF;
  SELECT * INTO c FROM public.cabinets x WHERE x.id = _cabinet FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Cabinet introuvable.';
  END IF;
  IF NOT c.actif THEN
    RAISE EXCEPTION 'CABINET_INACTIF: Ce cabinet est désactivé.';
  END IF;
  IF _societe = c.societe_propre_id THEN
    RAISE EXCEPTION 'CABINET_SOCIETE_PROPRE: La propre société du cabinet ne peut pas être un dossier client.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cabinet_dossiers d WHERE d.societe_id = _societe AND d.etat <> 'termine') THEN
    RAISE EXCEPTION 'CABINET_DEJA_LIE: Cette société est déjà suivie par un cabinet.';
  END IF;
  BEGIN
    INSERT INTO public.cabinet_dossiers (societe_id, cabinet_id, mission, etat, origine)
    VALUES (_societe, _cabinet, _mission, 'invitation', 'client') RETURNING id INTO lien;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'CABINET_DEJA_LIE: Cette société est déjà suivie par un cabinet.';
  END;
  RETURN lien;
END
$function$;

-- ─── cabinet_repondre_invitation ────────────────────────────────────────────
-- Responsable actif du cabinet actif. Contrôle avant verrou puis relecture.
-- L'acceptation vérifie le double accès, sans limite de dossiers.
CREATE OR REPLACE FUNCTION public.cabinet_repondre_invitation(_dossier uuid, _accepter boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  d public.cabinet_dossiers%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF NOT private.cabinet_responsable_actif(auth.uid(), d.cabinet_id) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul un responsable du cabinet peut répondre à l''invitation.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier FOR UPDATE;
  IF d.etat <> 'invitation' THEN
    RAISE EXCEPTION 'CABINET_ETAT: Ce dossier n''est pas dans l''état attendu.';
  END IF;
  IF _accepter IS NULL THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: La réponse est obligatoire.';
  END IF;
  IF _accepter AND EXISTS (
    SELECT 1 FROM public.cabinet_membres m
    JOIN public.user_societes us ON us.user_id = m.user_id AND us.societe_id = d.societe_id
    WHERE m.cabinet_id = d.cabinet_id AND m.actif
  ) THEN
    RAISE EXCEPTION 'CABINET_ACCES_DIRECT: Un membre actif du cabinet a déjà un accès direct à cette société.';
  END IF;
  UPDATE public.cabinet_dossiers x
  SET etat = CASE WHEN _accepter THEN 'actif'::public.etat_dossier_cabinet ELSE 'termine'::public.etat_dossier_cabinet END,
      termine_le = CASE WHEN _accepter THEN NULL ELSE now() END
  WHERE x.id = _dossier;
END
$function$;

-- ─── cabinet_annuler_invitation ─────────────────────────────────────────────
-- Administrateur du client uniquement, avant réponse ; historique conservé.
CREATE OR REPLACE FUNCTION public.cabinet_annuler_invitation(_dossier uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  d public.cabinet_dossiers%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF auth.uid() IS NULL OR NOT public.cabinet_admin_client(auth.uid(), d.societe_id) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul l''administrateur du client peut retirer l''invitation.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier FOR UPDATE;
  IF d.etat <> 'invitation' THEN
    RAISE EXCEPTION 'CABINET_ETAT: Ce dossier n''est pas dans l''état attendu.';
  END IF;
  UPDATE public.cabinet_dossiers x SET etat = 'termine', termine_le = now() WHERE x.id = _dossier;
END
$function$;

-- ─── cabinet_invitations_recues ─────────────────────────────────────────────
-- Nom du client avant ouverture des données métier. Autres appelants : vide.
CREATE OR REPLACE FUNCTION public.cabinet_invitations_recues()
RETURNS TABLE (dossier_id uuid, societe_id uuid, societe_nom text, mission public.mission_cabinet, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT d.id, d.societe_id, s.nom, d.mission, d.created_at
  FROM public.cabinet_dossiers d JOIN public.societes s ON s.id = d.societe_id
  WHERE d.etat = 'invitation' AND private.cabinet_responsable_actif(auth.uid(), d.cabinet_id)
  ORDER BY d.created_at, d.id
$function$;

-- ─── Droits d'exécution ────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.cabinets_annuaire() FROM public, anon;
REVOKE ALL ON FUNCTION public.cabinet_inviter(uuid, uuid, public.mission_cabinet) FROM public, anon;
REVOKE ALL ON FUNCTION public.cabinet_repondre_invitation(uuid, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.cabinet_annuler_invitation(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.cabinet_invitations_recues() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cabinets_annuaire() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cabinet_inviter(uuid, uuid, public.mission_cabinet) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cabinet_repondre_invitation(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cabinet_annuler_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cabinet_invitations_recues() TO authenticated;
$migration_sql$])
ON CONFLICT (version) DO NOTHING;

-- ─── 20261102122000_cabinet_departs ───
-- Espace cabinet, étape 3 : demandes de départ (plan du 2026-11-02).

-- ─── cabinet_demander_depart ───────────────────────────────────────────────
-- Administrateur du client ou responsable actif : passage en lecture seule.
CREATE OR REPLACE FUNCTION public.cabinet_demander_depart(_dossier uuid, _motif text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  d public.cabinet_dossiers%ROWTYPE;
  motif text;
BEGIN
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF auth.uid() IS NULL OR NOT (public.cabinet_admin_client(auth.uid(), d.societe_id) OR private.cabinet_responsable_actif(auth.uid(), d.cabinet_id)) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul l''administrateur du client ou un responsable actif du cabinet peut demander le départ.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier FOR UPDATE;
  IF d.etat <> 'actif' THEN
    RAISE EXCEPTION 'CABINET_ETAT: Ce dossier n''est pas dans l''état attendu.';
  END IF;
  motif := nullif(btrim(_motif), '');
  IF char_length(motif) > 500 THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Le motif ne peut pas dépasser 500 caractères.';
  END IF;
  UPDATE public.cabinet_dossiers x
  SET etat = 'depart_demande', depart_demande_par = auth.uid(),
      depart_demande_le = now(), depart_motif = motif
  WHERE x.id = _dossier;
END
$function$;

-- ─── cabinet_valider_depart ───────────────────────────────────────────────
-- Super-admin en aal2 : clôture du lien, attributions conservées pour historique.
CREATE OR REPLACE FUNCTION public.cabinet_valider_depart(_dossier uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  d public.cabinet_dossiers%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_admin_general(auth.uid()) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul le super-admin peut décider du départ.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier FOR UPDATE;
  IF d.etat <> 'depart_demande' THEN
    RAISE EXCEPTION 'CABINET_ETAT: Ce dossier n''est pas dans l''état attendu.';
  END IF;
  UPDATE public.cabinet_dossiers x
  SET etat = 'termine', valide_par = auth.uid(), termine_le = now()
  WHERE x.id = _dossier;
END
$function$;

-- ─── cabinet_annuler_depart ───────────────────────────────────────────────
-- Super-admin en aal2 : rétablissement du lien actif et effacement de la demande.
CREATE OR REPLACE FUNCTION public.cabinet_annuler_depart(_dossier uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  d public.cabinet_dossiers%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_admin_general(auth.uid()) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul le super-admin peut décider du départ.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier FOR UPDATE;
  IF d.etat <> 'depart_demande' THEN
    RAISE EXCEPTION 'CABINET_ETAT: Ce dossier n''est pas dans l''état attendu.';
  END IF;
  UPDATE public.cabinet_dossiers x
  SET etat = 'actif', depart_demande_par = NULL,
      depart_demande_le = NULL, depart_motif = NULL
  WHERE x.id = _dossier;
END
$function$;

-- ─── Droits d'exécution ───────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.cabinet_demander_depart(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.cabinet_valider_depart(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.cabinet_annuler_depart(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cabinet_demander_depart(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cabinet_valider_depart(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cabinet_annuler_depart(uuid) TO authenticated;
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261102122000', 'cabinet_departs', ARRAY[$migration_sql$-- Espace cabinet, étape 3 : demandes de départ (plan du 2026-11-02).

-- ─── cabinet_demander_depart ───────────────────────────────────────────────
-- Administrateur du client ou responsable actif : passage en lecture seule.
CREATE OR REPLACE FUNCTION public.cabinet_demander_depart(_dossier uuid, _motif text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  d public.cabinet_dossiers%ROWTYPE;
  motif text;
BEGIN
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF auth.uid() IS NULL OR NOT (public.cabinet_admin_client(auth.uid(), d.societe_id) OR private.cabinet_responsable_actif(auth.uid(), d.cabinet_id)) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul l''administrateur du client ou un responsable actif du cabinet peut demander le départ.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier FOR UPDATE;
  IF d.etat <> 'actif' THEN
    RAISE EXCEPTION 'CABINET_ETAT: Ce dossier n''est pas dans l''état attendu.';
  END IF;
  motif := nullif(btrim(_motif), '');
  IF char_length(motif) > 500 THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Le motif ne peut pas dépasser 500 caractères.';
  END IF;
  UPDATE public.cabinet_dossiers x
  SET etat = 'depart_demande', depart_demande_par = auth.uid(),
      depart_demande_le = now(), depart_motif = motif
  WHERE x.id = _dossier;
END
$function$;

-- ─── cabinet_valider_depart ───────────────────────────────────────────────
-- Super-admin en aal2 : clôture du lien, attributions conservées pour historique.
CREATE OR REPLACE FUNCTION public.cabinet_valider_depart(_dossier uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  d public.cabinet_dossiers%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_admin_general(auth.uid()) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul le super-admin peut décider du départ.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier FOR UPDATE;
  IF d.etat <> 'depart_demande' THEN
    RAISE EXCEPTION 'CABINET_ETAT: Ce dossier n''est pas dans l''état attendu.';
  END IF;
  UPDATE public.cabinet_dossiers x
  SET etat = 'termine', valide_par = auth.uid(), termine_le = now()
  WHERE x.id = _dossier;
END
$function$;

-- ─── cabinet_annuler_depart ───────────────────────────────────────────────
-- Super-admin en aal2 : rétablissement du lien actif et effacement de la demande.
CREATE OR REPLACE FUNCTION public.cabinet_annuler_depart(_dossier uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  d public.cabinet_dossiers%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_admin_general(auth.uid()) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul le super-admin peut décider du départ.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier FOR UPDATE;
  IF d.etat <> 'depart_demande' THEN
    RAISE EXCEPTION 'CABINET_ETAT: Ce dossier n''est pas dans l''état attendu.';
  END IF;
  UPDATE public.cabinet_dossiers x
  SET etat = 'actif', depart_demande_par = NULL,
      depart_demande_le = NULL, depart_motif = NULL
  WHERE x.id = _dossier;
END
$function$;

-- ─── Droits d'exécution ───────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.cabinet_demander_depart(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.cabinet_valider_depart(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.cabinet_annuler_depart(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cabinet_demander_depart(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cabinet_valider_depart(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cabinet_annuler_depart(uuid) TO authenticated;
$migration_sql$])
ON CONFLICT (version) DO NOTHING;
COMMIT;
SELECT version, name FROM supabase_migrations.schema_migrations WHERE version >= '20261102' ORDER BY version;
SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;
