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
