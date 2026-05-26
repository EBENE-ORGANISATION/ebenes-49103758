
-- Add internal webhook secret to vault
DO $$
DECLARE
  v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'internal_webhook_secret') THEN
    v_secret := encode(gen_random_bytes(32), 'hex');
    PERFORM vault.create_secret(v_secret, 'internal_webhook_secret', 'Shared secret for internal edge function calls (DB triggers, cron)');
  END IF;
END$$;

-- Update notify_validation_change to include X-Internal-Secret header
CREATE OR REPLACE FUNCTION public.notify_validation_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url text := 'https://nmeyylvltlvvcvbhvxpz.supabase.co/functions/v1/notification-validation';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tZXl5bHZsdGx2dmN2Ymh2eHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMDE5MjcsImV4cCI6MjA5Mjc3NzkyN30.WHA2ss_eKgLiumvinjfd7NaL-FggH5TbVgpqUvDKh5Q';
  v_secret text;
  v_status_col text := TG_ARGV[0];
  v_type text := TG_ARGV[1];
  v_old_status text;
  v_new_status text;
  v_payload jsonb;
BEGIN
  EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', v_status_col, v_status_col)
    INTO v_old_status, v_new_status
    USING OLD, NEW;

  IF v_new_status = 'en_validation' AND (TG_OP = 'INSERT' OR v_old_status IS DISTINCT FROM v_new_status) THEN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'internal_webhook_secret' LIMIT 1;
    v_payload := jsonb_build_object('type', v_type, 'record', to_jsonb(NEW), 'societe_id', NEW.societe_id);
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon,
        'X-Internal-Secret', COALESCE(v_secret, '')
      ),
      body := v_payload
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_validation_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url text := 'https://nmeyylvltlvvcvbhvxpz.supabase.co/functions/v1/notification-validation';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tZXl5bHZsdGx2dmN2Ymh2eHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMDE5MjcsImV4cCI6MjA5Mjc3NzkyN30.WHA2ss_eKgLiumvinjfd7NaL-FggH5TbVgpqUvDKh5Q';
  v_secret text;
  v_status_col text := TG_ARGV[0];
  v_type text := TG_ARGV[1];
  v_new_status text;
BEGIN
  EXECUTE format('SELECT ($1).%I::text', v_status_col) INTO v_new_status USING NEW;
  IF v_new_status = 'en_validation' THEN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'internal_webhook_secret' LIMIT 1;
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon,
        'X-Internal-Secret', COALESCE(v_secret, '')
      ),
      body := jsonb_build_object('type', v_type, 'record', to_jsonb(NEW), 'societe_id', NEW.societe_id)
    );
  END IF;
  RETURN NEW;
END;
$function$;
