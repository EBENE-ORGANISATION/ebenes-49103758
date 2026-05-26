
CREATE OR REPLACE FUNCTION public.get_internal_webhook_secret()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
  v text;
BEGIN
  SELECT decrypted_secret INTO v FROM vault.decrypted_secrets WHERE name = 'internal_webhook_secret' LIMIT 1;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.get_internal_webhook_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_internal_webhook_secret() TO service_role;
