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
