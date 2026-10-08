-- est_personnel n'a pas à être appelable sans être connecté ; les règles
-- d'accès s'exécutent pour les utilisateurs connectés (authenticated).
REVOKE EXECUTE ON FUNCTION public.est_personnel(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.est_personnel(uuid, uuid) TO authenticated;
