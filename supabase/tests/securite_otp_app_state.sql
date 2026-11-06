BEGIN;
-- debut test
-- Test de 20261106120000_securite_otp_appareil_app_state.sql, déjà appliquée.
-- Fixtures 00000000-07a0- ; chaque sonde d'écriture est annulée aussitôt.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT ('00000000-07a0-0000-0000-00000000000' || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'otp-' || n || '@exemple.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()
FROM generate_series(1, 4) n;
INSERT INTO public.societes (id, nom) VALUES
  ('00000000-07a0-0000-0001-000000000001', 'OTP TEST A'),
  ('00000000-07a0-0000-0001-000000000002', 'OTP TEST B');
INSERT INTO public.user_societes (user_id, societe_id)
SELECT ('00000000-07a0-0000-0000-00000000000' || n)::uuid,
       '00000000-07a0-0000-0001-000000000001'::uuid
FROM generate_series(1, 3) n;
SET LOCAL ROLE service_role;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-07a0-0000-0000-000000000001', 'membre_compta'),
  ('00000000-07a0-0000-0000-000000000002', 'admin'),
  ('00000000-07a0-0000-0000-000000000003', 'employe'),
  ('00000000-07a0-0000-0000-000000000004', 'admin_general');
RESET ROLE;
INSERT INTO public.app_state (key, value) VALUES
  ('global:update_signal', '{}'), ('global:update_history', '{}'),
  ('s:00000000-07a0-0000-0001-000000000001:x', '{}'),
  ('s:00000000-07a0-0000-0001-000000000002:x', '{}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
-- Cinq émissions récentes pour le cas « trop ».
INSERT INTO public.device_otps (user_id, code_hash, expires_at, created_at, used)
SELECT '00000000-07a0-0000-0000-000000000004', 'h-bon',
       now() + interval '10 minutes', now() - interval '1 minute', true
FROM generate_series(1, 5);

CREATE FUNCTION pg_temp.otp_mesure()
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE
  a constant text := 's:00000000-07a0-0000-0001-000000000001:x';
  b constant text := 's:00000000-07a0-0000-0001-000000000002:x';
  u record;
  p record;
  n bigint;
  v text;
  res text := '';
  uid uuid;
  i integer;
BEGIN
  FOR u IN SELECT * FROM (VALUES (1, 'CPT'), (2, 'ADA'), (3, 'EMP'), (4, 'SUP')) t(id, lib) LOOP
    uid := ('00000000-07a0-0000-0000-00000000000' || u.id)::uuid;
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims', json_build_object(
      'sub', uid, 'role', 'authenticated', 'aal', 'aal2',
      'email', 'otp-' || u.id || '@exemple.invalid')::text, true);
    FOR p IN SELECT * FROM (VALUES
      ('signal', 'SELECT count(*) FROM public.app_state WHERE key = ''global:update_signal'''),
      ('history', 'SELECT count(*) FROM public.app_state WHERE key = ''global:update_history'''),
      ('a_lire', format('SELECT count(*) FROM public.app_state WHERE key = %L', a)),
      ('b_lire', format('SELECT count(*) FROM public.app_state WHERE key = %L', b)),
      ('b_insert', format('INSERT INTO public.app_state (key) VALUES (%L)', b || ':sonde')),
      ('b_update', format('UPDATE public.app_state SET value = value WHERE key = %L', b)),
      ('b_delete', format('DELETE FROM public.app_state WHERE key = %L', b)),
      ('a_insert', format('INSERT INTO public.app_state (key) VALUES (%L)', a || ':sonde')),
      ('a_update', format('UPDATE public.app_state SET value = value WHERE key = %L', a)),
      ('a_delete', format('DELETE FROM public.app_state WHERE key = %L', a)),
      -- UPSERT exerce le contrôle INSERT même si le signal existe déjà.
      ('signal_insert', 'INSERT INTO public.app_state (key) VALUES (''global:update_signal'') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value'),
      ('signal_update', 'UPDATE public.app_state SET value = value WHERE key = ''global:update_signal'''),
      ('signal_delete', 'DELETE FROM public.app_state WHERE key = ''global:update_signal'''),
      ('history_upsert', 'INSERT INTO public.app_state (key) VALUES (''global:update_history'') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value'),
      ('otp_select', format('SELECT count(*) FROM public.device_otps WHERE user_id = %L', uid)),
      ('otp_insert', format('INSERT INTO public.device_otps (user_id, code_hash, expires_at) VALUES (%L, ''h-bon'', now())', uid)),
      ('otp_update', format('UPDATE public.device_otps SET used = true WHERE user_id = %L', uid)),
      ('otp_emettre', format('SELECT public.emettre_code_appareil(%L, ''h-bon'', null)', uid)),
      ('otp_verifier', format('SELECT public.verifier_code_appareil(%L, ''h-bon'')', uid))
    ) t(cas, sql) LOOP
      BEGIN
        BEGIN
          IF p.sql LIKE 'SELECT%' THEN EXECUTE p.sql INTO v;
          ELSIF p.sql LIKE 'INSERT%' THEN EXECUTE p.sql; v := 'ok';
          ELSE EXECUTE p.sql; GET DIAGNOSTICS n = ROW_COUNT; v := n::text;
          END IF;
        EXCEPTION WHEN OTHERS THEN v := SQLSTATE;
        END;
        RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'sonde annulée';
      EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
      END;
      res := res || format('%s|%s|%s', u.lib, p.cas, v) || E'\n';
    END LOOP;
    EXECUTE 'SET LOCAL ROLE NONE';
    PERFORM set_config('request.jwt.claims', '', true);
  END LOOP;

  -- Une sous-transaction par séquence : les appels successifs partagent leur état.
  FOR i IN 7..10 LOOP
    BEGIN
      EXECUTE 'SET LOCAL ROLE service_role';
      uid := '00000000-07a0-0000-0000-000000000001';
      IF i = 7 THEN
        v := public.emettre_code_appareil(uid, 'h-bon', null);
        FOR n IN 1..5 LOOP v := v || ',' || public.verifier_code_appareil(uid, 'h-faux'); END LOOP;
        v := v || ',' || public.verifier_code_appareil(uid, 'h-bon');
      ELSIF i = 8 THEN
        v := public.emettre_code_appareil(uid, 'h-bon', null);
        v := v || ',' || public.verifier_code_appareil(uid, 'h-bon');
        v := v || ',' || public.verifier_code_appareil(uid, 'h-bon');
      ELSIF i = 9 THEN
        v := public.emettre_code_appareil(uid, 'h-faux', null);
        v := v || ',' || public.emettre_code_appareil(uid, 'h-bon', null);
        SELECT count(*) INTO n FROM public.device_otps
          WHERE user_id = uid AND code_hash = 'h-faux' AND used;
        v := v || ',' || n;
        -- L'ancienne empreinte est fausse face au nouveau code, pas « absent ».
        v := v || ',' || public.verifier_code_appareil(uid, 'h-faux');
        v := v || ',' || public.verifier_code_appareil(uid, 'h-bon');
        v := v || ',' || public.verifier_code_appareil(uid, 'h-faux');
      ELSE
        v := public.emettre_code_appareil('00000000-07a0-0000-0000-000000000004', 'h-bon', null);
      END IF;
      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'sonde annulée';
    EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
      WHEN OTHERS THEN v := SQLSTATE;
    END;
    res := res || format('SR|%s|%s', i, v) || E'\n';
  END LOOP;
  RETURN res;
END $f$;

SELECT set_config('otp.m', pg_temp.otp_mesure(), true);
DO $$
DECLARE
  m constant text[] := array_remove(string_to_array(current_setting('otp.m'), E'\n'), '');
  attendu text[] := ARRAY[
    'CPT|signal|1', 'CPT|history|0', 'CPT|a_lire|1', 'CPT|b_lire|0',
    'CPT|b_insert|42501', 'CPT|b_update|0', 'CPT|b_delete|0',
    'CPT|a_insert|ok', 'CPT|a_update|0', 'CPT|a_delete|0',
    'CPT|signal_insert|42501', 'CPT|signal_update|0', 'CPT|signal_delete|0', 'CPT|history_upsert|42501',
    'ADA|signal|1', 'ADA|history|0', 'ADA|a_lire|1', 'ADA|b_lire|0',
    'ADA|b_insert|42501', 'ADA|b_update|0', 'ADA|b_delete|0',
    'ADA|a_insert|ok', 'ADA|a_update|1', 'ADA|a_delete|1',
    'ADA|signal_insert|42501', 'ADA|signal_update|0', 'ADA|signal_delete|0', 'ADA|history_upsert|42501',
    'EMP|signal|0', 'EMP|history|0', 'EMP|a_lire|0', 'EMP|b_lire|0',
    'EMP|b_insert|42501', 'EMP|b_update|0', 'EMP|b_delete|0',
    'EMP|a_insert|42501', 'EMP|a_update|0', 'EMP|a_delete|0',
    'EMP|signal_insert|42501', 'EMP|signal_update|0', 'EMP|signal_delete|0', 'EMP|history_upsert|42501',
    'SUP|signal|1', 'SUP|history|1', 'SUP|a_lire|1', 'SUP|b_lire|1',
    'SUP|b_insert|ok', 'SUP|b_update|0', 'SUP|b_delete|0',
    'SUP|a_insert|ok', 'SUP|a_update|0', 'SUP|a_delete|0',
    'SUP|signal_insert|ok', 'SUP|signal_update|1', 'SUP|signal_delete|1', 'SUP|history_upsert|ok',
    'SR|7|ok,faux,faux,faux,faux,bloque,absent',
    'SR|8|ok,ok,absent', 'SR|9|ok,ok,1,faux,ok,absent', 'SR|10|trop'
  ];
  lib text;
  cas text;
  ecart text;
BEGIN
  FOREACH lib IN ARRAY ARRAY['CPT', 'ADA', 'EMP', 'SUP'] LOOP
    FOREACH cas IN ARRAY ARRAY['otp_select', 'otp_insert', 'otp_update', 'otp_emettre', 'otp_verifier'] LOOP
      attendu := array_append(attendu, lib || '|' || cas || '|42501');
    END LOOP;
  END LOOP;
  SELECT string_agg(l, E'\n' ORDER BY l) INTO ecart FROM (
    (SELECT 'mesuré  ' || x AS l FROM (SELECT unnest(m) AS x EXCEPT SELECT unnest(attendu)) y)
    UNION ALL
    (SELECT 'attendu ' || x FROM (SELECT unnest(attendu) AS x EXCEPT SELECT unnest(m)) y)
  ) z;
  ASSERT ecart IS NULL, E'securite_otp_app_state : écart :\n' || ecart;
  ASSERT cardinality(m) = cardinality(attendu), 'securite_otp_app_state : nombre de mesures';
END $$;
DO $$ BEGIN RAISE NOTICE 'OK securite_otp_app_state'; END $$;
-- fin test
ROLLBACK;
