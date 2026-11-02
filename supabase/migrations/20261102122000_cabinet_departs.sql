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
