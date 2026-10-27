-- Fonctions de contrôle d'accès (SECURITY DEFINER) : un visiteur non connecté
-- n'a pas à les appeler (/rest/v1/rpc/...). Les utilisateurs connectés gardent
-- le droit : les règles RLS des tables s'en servent.
-- Conséquence voulue : une requête anonyme sur une table dont la règle les
-- utilise est refusée (erreur) au lieu de renvoyer un résultat vide.

revoke execute on function public.current_employe_id(uuid) from public, anon;
revoke execute on function public.has_societe_access(uuid) from public, anon;
revoke execute on function public.has_societe_access(uuid, uuid) from public, anon;
revoke execute on function public.in_service_compta(uuid) from public, anon;
revoke execute on function public.in_service_grh(uuid) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
revoke execute on function public.is_admin_general() from public, anon;
revoke execute on function public.is_admin_general(uuid) from public, anon;

grant execute on function public.current_employe_id(uuid) to authenticated, service_role;
grant execute on function public.has_societe_access(uuid) to authenticated, service_role;
grant execute on function public.has_societe_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.in_service_compta(uuid) to authenticated, service_role;
grant execute on function public.in_service_grh(uuid) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_admin(uuid) to authenticated, service_role;
grant execute on function public.is_admin_general() to authenticated, service_role;
grant execute on function public.is_admin_general(uuid) to authenticated, service_role;
