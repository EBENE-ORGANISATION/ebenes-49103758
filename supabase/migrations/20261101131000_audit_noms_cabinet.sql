-- Noms actuels associés à la signature historique ; aucun recalcul à partir
-- des membres ou des dossiers actuels. Pas d’e-mail ni d’annuaire exposé.
CREATE OR REPLACE FUNCTION public.audit_noms_cabinet(_societe uuid)
RETURNS TABLE (cabinet_id uuid, cabinet_nom text, user_id uuid, auteur_nom text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $fonction$
  SELECT DISTINCT a.cabinet_id, c.nom::text, a.user_id,
         nullif(btrim(p.nom), '')::text
  FROM public.audit_log a
  JOIN public.cabinets c ON c.id = a.cabinet_id
  LEFT JOIN public.profiles p ON p.user_id = a.user_id
  WHERE auth.uid() IS NOT NULL
    AND a.societe_id = _societe
    -- Même périmètre que les politiques SELECT de l’audit : un simple
    -- rattachement sans rôle administrateur ne donne pas accès aux noms.
    AND (public.is_admin_general(auth.uid())
         OR (public.is_admin(auth.uid()) AND public.has_societe_access(auth.uid(), a.societe_id)))
$fonction$;
REVOKE ALL ON FUNCTION public.audit_noms_cabinet(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.audit_noms_cabinet(uuid) TO authenticated, service_role;
