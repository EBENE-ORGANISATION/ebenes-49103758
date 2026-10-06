-- Audit 2026-10-06 — DÉJÀ APPLIQUÉE en production (version 20261006104949).
-- get_internal_webhook_secret() était exécutable par anon/authenticated :
-- n'importe qui pouvait lire le secret des Edge Functions avec la clé publique.
revoke execute on function public.get_internal_webhook_secret() from public, anon, authenticated;
grant execute on function public.get_internal_webhook_secret() to service_role;
