-- ─── Extensions ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── Table alertes_lues ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alertes_lues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  societe_id uuid NOT NULL,
  alerte_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, alerte_id)
);

ALTER TABLE public.alertes_lues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alertes_lues_select_own"
ON public.alertes_lues FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "alertes_lues_insert_own"
ON public.alertes_lues FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND has_societe_access(auth.uid(), societe_id));

CREATE POLICY "alertes_lues_delete_own"
ON public.alertes_lues FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_alertes_lues_user ON public.alertes_lues(user_id);
CREATE INDEX IF NOT EXISTS idx_alertes_lues_societe ON public.alertes_lues(societe_id);

-- ─── Trigger function : appelle l'Edge Function notification-validation ─
CREATE OR REPLACE FUNCTION public.notify_validation_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://nmeyylvltlvvcvbhvxpz.supabase.co/functions/v1/notification-validation';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tZXl5bHZsdGx2dmN2Ymh2eHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMDE5MjcsImV4cCI6MjA5Mjc3NzkyN30.WHA2ss_eKgLiumvinjfd7NaL-FggH5TbVgpqUvDKh5Q';
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
    v_payload := jsonb_build_object(
      'type', v_type,
      'record', to_jsonb(NEW),
      'societe_id', NEW.societe_id
    );
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon
      ),
      body := v_payload
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Variant for INSERT (no OLD)
CREATE OR REPLACE FUNCTION public.notify_validation_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://nmeyylvltlvvcvbhvxpz.supabase.co/functions/v1/notification-validation';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tZXl5bHZsdGx2dmN2Ymh2eHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMDE5MjcsImV4cCI6MjA5Mjc3NzkyN30.WHA2ss_eKgLiumvinjfd7NaL-FggH5TbVgpqUvDKh5Q';
  v_status_col text := TG_ARGV[0];
  v_type text := TG_ARGV[1];
  v_new_status text;
BEGIN
  EXECUTE format('SELECT ($1).%I::text', v_status_col) INTO v_new_status USING NEW;
  IF v_new_status = 'en_validation' THEN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon
      ),
      body := jsonb_build_object('type', v_type, 'record', to_jsonb(NEW), 'societe_id', NEW.societe_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ─── Triggers par table ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_notify_transactions_ins ON public.transactions;
CREATE TRIGGER trg_notify_transactions_ins AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.notify_validation_insert('statut', 'transaction');
DROP TRIGGER IF EXISTS trg_notify_transactions_upd ON public.transactions;
CREATE TRIGGER trg_notify_transactions_upd AFTER UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.notify_validation_change('statut', 'transaction');

DROP TRIGGER IF EXISTS trg_notify_factures_ins ON public.factures;
CREATE TRIGGER trg_notify_factures_ins AFTER INSERT ON public.factures
FOR EACH ROW EXECUTE FUNCTION public.notify_validation_insert('statut_validation', 'facture');
DROP TRIGGER IF EXISTS trg_notify_factures_upd ON public.factures;
CREATE TRIGGER trg_notify_factures_upd AFTER UPDATE ON public.factures
FOR EACH ROW EXECUTE FUNCTION public.notify_validation_change('statut_validation', 'facture');

DROP TRIGGER IF EXISTS trg_notify_employes_ins ON public.employes;
CREATE TRIGGER trg_notify_employes_ins AFTER INSERT ON public.employes
FOR EACH ROW EXECUTE FUNCTION public.notify_validation_insert('statut_validation', 'employe');
DROP TRIGGER IF EXISTS trg_notify_employes_upd ON public.employes;
CREATE TRIGGER trg_notify_employes_upd AFTER UPDATE ON public.employes
FOR EACH ROW EXECUTE FUNCTION public.notify_validation_change('statut_validation', 'employe');

DROP TRIGGER IF EXISTS trg_notify_primes_ins ON public.primes;
CREATE TRIGGER trg_notify_primes_ins AFTER INSERT ON public.primes
FOR EACH ROW EXECUTE FUNCTION public.notify_validation_insert('statut_validation', 'prime');
DROP TRIGGER IF EXISTS trg_notify_primes_upd ON public.primes;
CREATE TRIGGER trg_notify_primes_upd AFTER UPDATE ON public.primes
FOR EACH ROW EXECUTE FUNCTION public.notify_validation_change('statut_validation', 'prime');

DROP TRIGGER IF EXISTS trg_notify_absences_ins ON public.absences;
CREATE TRIGGER trg_notify_absences_ins AFTER INSERT ON public.absences
FOR EACH ROW EXECUTE FUNCTION public.notify_validation_insert('statut_validation', 'absence');
DROP TRIGGER IF EXISTS trg_notify_absences_upd ON public.absences;
CREATE TRIGGER trg_notify_absences_upd AFTER UPDATE ON public.absences
FOR EACH ROW EXECUTE FUNCTION public.notify_validation_change('statut_validation', 'absence');

DROP TRIGGER IF EXISTS trg_notify_heures_sup_ins ON public.heures_sup;
CREATE TRIGGER trg_notify_heures_sup_ins AFTER INSERT ON public.heures_sup
FOR EACH ROW EXECUTE FUNCTION public.notify_validation_insert('statut_validation', 'heures_sup');
DROP TRIGGER IF EXISTS trg_notify_heures_sup_upd ON public.heures_sup;
CREATE TRIGGER trg_notify_heures_sup_upd AFTER UPDATE ON public.heures_sup
FOR EACH ROW EXECUTE FUNCTION public.notify_validation_change('statut_validation', 'heures_sup');

DROP TRIGGER IF EXISTS trg_notify_sanctions_ins ON public.sanctions;
CREATE TRIGGER trg_notify_sanctions_ins AFTER INSERT ON public.sanctions
FOR EACH ROW EXECUTE FUNCTION public.notify_validation_insert('statut_validation', 'sanction');
DROP TRIGGER IF EXISTS trg_notify_sanctions_upd ON public.sanctions;
CREATE TRIGGER trg_notify_sanctions_upd AFTER UPDATE ON public.sanctions
FOR EACH ROW EXECUTE FUNCTION public.notify_validation_change('statut_validation', 'sanction');

-- ─── Cron quotidien : digest alertes à 08h00 ────────────────────────────
SELECT cron.unschedule('notification-alertes-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-alertes-daily');

SELECT cron.schedule(
  'notification-alertes-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://nmeyylvltlvvcvbhvxpz.supabase.co/functions/v1/notification-alertes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tZXl5bHZsdGx2dmN2Ymh2eHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMDE5MjcsImV4cCI6MjA5Mjc3NzkyN30.WHA2ss_eKgLiumvinjfd7NaL-FggH5TbVgpqUvDKh5Q'
    ),
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);