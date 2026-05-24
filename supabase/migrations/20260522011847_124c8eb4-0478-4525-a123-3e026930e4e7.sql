-- 1) Mise à jour du trigger d'audit : capture societe_id depuis NEW/OLD
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_old JSONB;
  v_new JSONB;
  v_changes JSONB := '{}'::jsonb;
  v_record_id TEXT;
  v_societe_id UUID;
  k TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_user_email FROM public.profiles WHERE user_id = v_user_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_record_id := COALESCE(v_old->>'id', '');
    BEGIN v_societe_id := (v_old->>'societe_id')::uuid; EXCEPTION WHEN OTHERS THEN v_societe_id := NULL; END;
    INSERT INTO public.audit_log (user_id, user_email, action, table_name, record_id, old_data, societe_id)
    VALUES (v_user_id, v_user_email, 'DELETE', TG_TABLE_NAME, v_record_id, v_old, v_societe_id);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE(v_new->>'id', '');
    BEGIN v_societe_id := (v_new->>'societe_id')::uuid; EXCEPTION WHEN OTHERS THEN v_societe_id := NULL; END;
    INSERT INTO public.audit_log (user_id, user_email, action, table_name, record_id, new_data, societe_id)
    VALUES (v_user_id, v_user_email, 'INSERT', TG_TABLE_NAME, v_record_id, v_new, v_societe_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE(v_new->>'id', '');
    BEGIN v_societe_id := COALESCE((v_new->>'societe_id')::uuid, (v_old->>'societe_id')::uuid); EXCEPTION WHEN OTHERS THEN v_societe_id := NULL; END;
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      IF (v_old->k) IS DISTINCT FROM (v_new->k) THEN
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('old', v_old->k, 'new', v_new->k));
      END IF;
    END LOOP;
    IF v_changes <> '{}'::jsonb THEN
      INSERT INTO public.audit_log (user_id, user_email, action, table_name, record_id, old_data, new_data, changes, societe_id)
      VALUES (v_user_id, v_user_email, 'UPDATE', TG_TABLE_NAME, v_record_id, v_old, v_new, v_changes, v_societe_id);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;

-- 2) Backfill des entrées existantes : remplir societe_id depuis old_data/new_data quand possible
UPDATE public.audit_log
SET societe_id = COALESCE(
  NULLIF(new_data->>'societe_id','')::uuid,
  NULLIF(old_data->>'societe_id','')::uuid
)
WHERE societe_id IS NULL
  AND (
    (new_data ? 'societe_id' AND NULLIF(new_data->>'societe_id','') IS NOT NULL)
    OR (old_data ? 'societe_id' AND NULLIF(old_data->>'societe_id','') IS NOT NULL)
  );

-- 3) Remplacement des policies SELECT pour cloisonner strictement par société
DROP POLICY IF EXISTS "Admins can view audit log" ON public.audit_log;
DROP POLICY IF EXISTS audit_log_admin_societe ON public.audit_log;
DROP POLICY IF EXISTS audit_log_super_admin ON public.audit_log;

-- Super-admin général : voit tout
CREATE POLICY audit_log_select_super_admin
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (is_admin_general(auth.uid()));

-- Admin de société : voit uniquement les entrées de SES sociétés
CREATE POLICY audit_log_select_societe
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (
    societe_id IS NOT NULL
    AND has_societe_access(auth.uid(), societe_id)
    AND is_admin(auth.uid())
  );

-- 4) Index pour accélérer le filtre par société
CREATE INDEX IF NOT EXISTS idx_audit_log_societe_created
  ON public.audit_log (societe_id, created_at DESC);