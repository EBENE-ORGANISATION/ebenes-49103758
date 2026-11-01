-- Déploiement de la migration 20261101120000_cabinet_equipe.sql (noms de l'équipe d'un cabinet)
-- et inscription dans l'historique, en une seule transaction. À lancer une fois.
-- Généré depuis supabase/migrations ; ne pas modifier à la main.
BEGIN;
DO $g$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261027124000') THEN
    RAISE EXCEPTION 'La migration cabinet_operations n est pas inscrite : arrêt.';
  END IF;
END $g$;
-- Lecture des noms sans élargir la RLS de profiles ni exposer auth.users.
CREATE OR REPLACE FUNCTION public.cabinet_equipe(_cabinet uuid)
RETURNS TABLE(user_id uuid, nom text, email text, role public.role_cabinet, actif boolean, deja_connecte boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fonction$
DECLARE
  appelant uuid := auth.uid();
  gestion boolean;
BEGIN
  gestion := appelant IS NOT NULL AND (
    public.is_admin_general(appelant) OR private.cabinet_responsable_actif(appelant, _cabinet));
  IF appelant IS NULL OR NOT (gestion OR EXISTS (
    SELECT 1 FROM public.cabinet_membres m
    JOIN public.cabinets c ON c.id = m.cabinet_id AND c.actif
    WHERE m.user_id = appelant AND m.cabinet_id = _cabinet AND m.actif
      AND m.role IN ('collaborateur', 'stagiaire')
  )) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Accès à l''équipe du cabinet refusé.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.user_id,
      -- Pas de repli sur l’e-mail pour les lecteurs sans droit de gestion.
      coalesce(nullif(btrim(p.nom), ''), 'Membre du cabinet')::text,
      CASE WHEN gestion THEN coalesce(p.email, u.email)::text ELSE NULL::text END,
      m.role, m.actif,
      CASE WHEN gestion THEN u.last_sign_in_at IS NOT NULL ELSE NULL::boolean END
    FROM public.cabinet_membres m
    LEFT JOIN public.profiles p ON p.user_id = m.user_id
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.cabinet_id = _cabinet
    ORDER BY m.role, 2, m.user_id;
END
$fonction$;
REVOKE ALL ON FUNCTION public.cabinet_equipe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cabinet_equipe(uuid) TO authenticated, service_role;
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ('20261101120000', 'cabinet_equipe', ARRAY[$migration_sql$
-- Lecture des noms sans élargir la RLS de profiles ni exposer auth.users.
CREATE OR REPLACE FUNCTION public.cabinet_equipe(_cabinet uuid)
RETURNS TABLE(user_id uuid, nom text, email text, role public.role_cabinet, actif boolean, deja_connecte boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fonction$
DECLARE
  appelant uuid := auth.uid();
  gestion boolean;
BEGIN
  gestion := appelant IS NOT NULL AND (
    public.is_admin_general(appelant) OR private.cabinet_responsable_actif(appelant, _cabinet));
  IF appelant IS NULL OR NOT (gestion OR EXISTS (
    SELECT 1 FROM public.cabinet_membres m
    JOIN public.cabinets c ON c.id = m.cabinet_id AND c.actif
    WHERE m.user_id = appelant AND m.cabinet_id = _cabinet AND m.actif
      AND m.role IN ('collaborateur', 'stagiaire')
  )) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Accès à l''équipe du cabinet refusé.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.user_id,
      -- Pas de repli sur l’e-mail pour les lecteurs sans droit de gestion.
      coalesce(nullif(btrim(p.nom), ''), 'Membre du cabinet')::text,
      CASE WHEN gestion THEN coalesce(p.email, u.email)::text ELSE NULL::text END,
      m.role, m.actif,
      CASE WHEN gestion THEN u.last_sign_in_at IS NOT NULL ELSE NULL::boolean END
    FROM public.cabinet_membres m
    LEFT JOIN public.profiles p ON p.user_id = m.user_id
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.cabinet_id = _cabinet
    ORDER BY m.role, 2, m.user_id;
END
$fonction$;
REVOKE ALL ON FUNCTION public.cabinet_equipe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cabinet_equipe(uuid) TO authenticated, service_role;
$migration_sql$])
ON CONFLICT (version) DO NOTHING;
COMMIT;
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
