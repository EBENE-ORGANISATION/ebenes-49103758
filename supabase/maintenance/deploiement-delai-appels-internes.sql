-- Déploiement de l'espace cabinet, étape 3, délai des appels internes :
--   20261102125000 délai de 60 s pour les appels internes ;
-- Chaque migration est inscrite dans l'historique ; une seule transaction.
-- À lancer une fois. Généré depuis supabase/migrations ; ne pas modifier à la main.
BEGIN;
DO $g$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261102124000') THEN
    RAISE EXCEPTION 'La migration 20261102124000 n est pas inscrite : arrêt.';
  END IF;
END $g$;

-- ─── 20261102125000_delai_appels_internes ───
-- Les fonctions internes envoient plusieurs e-mails d'affilée : 5 s (valeur par défaut
-- de pg_net) ne suffisent pas et la réponse est notée en erreur alors que l'envoi aboutit.
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
    body := coalesce(_corps, '{}'::jsonb),
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE ALL ON FUNCTION private.appeler_fonction_interne(text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.appeler_fonction_interne(text, jsonb) TO service_role;
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261102125000', 'delai_appels_internes', ARRAY[$migration_sql$-- Les fonctions internes envoient plusieurs e-mails d'affilée : 5 s (valeur par défaut
-- de pg_net) ne suffisent pas et la réponse est notée en erreur alors que l'envoi aboutit.
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
    body := coalesce(_corps, '{}'::jsonb),
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE ALL ON FUNCTION private.appeler_fonction_interne(text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.appeler_fonction_interne(text, jsonb) TO service_role;
$migration_sql$])
ON CONFLICT (version) DO NOTHING;
COMMIT;
SELECT version, name FROM supabase_migrations.schema_migrations WHERE version >= '20261102' ORDER BY version;
SELECT pg_get_functiondef('private.appeler_fonction_interne(text,jsonb)'::regprocedure) LIKE '%timeout_milliseconds := 60000%' AS delai_60s;
