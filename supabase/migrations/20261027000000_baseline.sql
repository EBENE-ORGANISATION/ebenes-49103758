-- Schéma de référence (baseline) tiré de la production le 2026-10-27
-- (pg_dump 17.11 --schema-only --schema=public, projet yblucgmxofyelziwlvxu).
-- Remplace les 94 anciennes migrations, archivées dans supabase/migrations_archive/.
-- Retouches à la main : suppression de \restrict / \unrestrict (méta-commandes psql)
-- et de CREATE SCHEMA "public" (le schéma existe sur tout projet Supabase) ;
-- search_path limité à la transaction, RESET ALL en fin de fichier.
-- Le reste est la sortie brute de pg_dump.
-- Ce qui n'est pas dans public (extensions, auth, storage, temps réel) est dans
-- 20261027000001_baseline_complements.sql.

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', true);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--




--
-- Name: access_level; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."access_level" AS ENUM (
    'none',
    'read',
    'write',
    'validate'
);


ALTER TYPE "public"."access_level" OWNER TO "postgres";

--
-- Name: app_module; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."app_module" AS ENUM (
    'dashboard',
    'compta',
    'factures',
    'stock',
    'immobilisations',
    'fiscalite',
    'parametres_sociaux',
    'grh',
    'portail',
    'saisie_ecritures',
    'validation_ecritures',
    'journaux',
    'rapports_compta',
    'devis',
    'factures_vente',
    'factures_achat',
    'articles',
    'mouvements_stock',
    'inventaire',
    'fiches_immo',
    'cessions_immo',
    'tva',
    'is_impot',
    'imf',
    'patente',
    'parafiscaux',
    'grilles_salaire',
    'baremes_cnss',
    'employes',
    'bulletins',
    'conges_absences',
    'sanctions',
    'paie_virements'
);


ALTER TYPE "public"."app_module" OWNER TO "postgres";

--
-- Name: app_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'rh',
    'comptable',
    'saisie',
    'chef_compta',
    'membre_compta',
    'chef_grh',
    'membre_grh',
    'dashboard_viewer',
    'employe',
    'admin_general',
    'super_admin'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";

--
-- Name: header_feature; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."header_feature" AS ENUM (
    'alertes',
    'recap_annuel',
    'archives',
    'json_io',
    'users_admin',
    'audit_log'
);


ALTER TYPE "public"."header_feature" OWNER TO "postgres";

--
-- Name: regime_fiscal_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."regime_fiscal_enum" AS ENUM (
    'IS',
    'IMF',
    'TPU',
    'BE',
    'ASS',
    'TEL',
    'TI'
);


ALTER TYPE "public"."regime_fiscal_enum" OWNER TO "postgres";

--
-- Name: secteur_activite_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."secteur_activite_enum" AS ENUM (
    'CO',
    'HO',
    'PH',
    'SE',
    'BTP',
    'ASS',
    'BE',
    'TEL',
    'TI',
    'IND',
    'AGRI',
    'AUT'
);


ALTER TYPE "public"."secteur_activite_enum" OWNER TO "postgres";

--
-- Name: activite_autorisee("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."activite_autorisee"("_user_id" "uuid", "_societe_id" "uuid", "_activite_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT _user_id IS NULL
    OR public.is_admin_general(_user_id)
    OR public.is_admin(_user_id)
    OR NOT EXISTS (SELECT 1 FROM public.user_activites WHERE user_id = _user_id AND societe_id = _societe_id)
    OR EXISTS (SELECT 1 FROM public.user_activites WHERE user_id = _user_id AND societe_id = _societe_id AND activite_id = _activite_id)
$$;


ALTER FUNCTION "public"."activite_autorisee"("_user_id" "uuid", "_societe_id" "uuid", "_activite_id" "uuid") OWNER TO "postgres";

--
-- Name: admin_gere_utilisateur("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."admin_gere_utilisateur"("_admin" "uuid", "_cible" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_admin_general(_admin)
    or (
      public.is_admin(_admin)
      and not public.has_role(_cible, 'admin_general'::public.app_role)
      and not public.has_role(_cible, 'super_admin'::public.app_role)
      and exists (
        select 1
        from public.user_societes moi
        join public.user_societes lui on lui.societe_id = moi.societe_id
        where moi.user_id = _admin and lui.user_id = _cible
      )
    )
$$;


ALTER FUNCTION "public"."admin_gere_utilisateur"("_admin" "uuid", "_cible" "uuid") OWNER TO "postgres";

--
-- Name: app_state_societe_id("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."app_state_societe_id"("_key" "text") RETURNS "uuid"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$ SELECT NULLIF(split_part(_key, ':', 2), '')::uuid $$;


ALTER FUNCTION "public"."app_state_societe_id"("_key" "text") OWNER TO "postgres";

--
-- Name: audit_trigger_fn(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."audit_trigger_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."audit_trigger_fn"() OWNER TO "postgres";

--
-- Name: audit_user_societes(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."audit_user_societes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.audit_log (user_id, action, table_name, record_id, old_data, new_data, societe_id)
  values (
    auth.uid(),
    tg_op,
    'user_societes',
    coalesce(new.user_id, old.user_id)::text,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    coalesce(new.societe_id, old.societe_id)
  );
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."audit_user_societes"() OWNER TO "postgres";

--
-- Name: bloquer_role_super_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."bloquer_role_super_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.role::text in ('admin_general', 'super_admin')
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'Attribution du rôle super-admin interdite'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."bloquer_role_super_admin"() OWNER TO "postgres";

--
-- Name: controle_quatre_yeux(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."controle_quatre_yeux"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  colonne text := TG_ARGV[0];
  valeur_valide text := TG_ARGV[1];
  ancien text;
  nouveau text;
  uid uuid := auth.uid();
BEGIN
  NEW.cree_par := OLD.cree_par;
  EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', colonne, colonne)
    INTO ancien, nouveau USING OLD, NEW;
  IF uid IS NOT NULL
     AND nouveau = valeur_valide
     AND ancien IS DISTINCT FROM valeur_valide
     AND OLD.cree_par = uid
     AND NOT (public.is_admin(uid) OR public.is_admin_general(uid)) THEN
    RAISE EXCEPTION 'QUATRE_YEUX: vous ne pouvez pas valider votre propre saisie'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$_$;


ALTER FUNCTION "public"."controle_quatre_yeux"() OWNER TO "postgres";

--
-- Name: controle_reouverture_exercice(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."controle_reouverture_exercice"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.statut = 'cloture' AND NEW.statut = 'ouvert' AND auth.uid() IS NOT NULL
     AND NOT (public.is_admin(auth.uid()) OR public.is_admin_general(auth.uid())) THEN
    RAISE EXCEPTION 'EXERCICE_REOUVERTURE: seul un administrateur peut rouvrir un exercice clôturé' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."controle_reouverture_exercice"() OWNER TO "postgres";

--
-- Name: current_employe_id("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."current_employe_id"("_user_id" "uuid") RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id FROM public.employes WHERE user_id = _user_id LIMIT 1;
$$;


ALTER FUNCTION "public"."current_employe_id"("_user_id" "uuid") OWNER TO "postgres";

--
-- Name: definir_compteur("uuid", "text", integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."definir_compteur"("p_societe" "uuid", "p_type" "text", "p_annee" integer, "p_valeur" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_min integer;
BEGIN
  IF NOT (public.is_admin_general(auth.uid())
          OR (public.has_societe_access(auth.uid(), p_societe) AND public.is_admin(auth.uid()))) THEN
    RAISE EXCEPTION 'Réservé à l''administrateur' USING ERRCODE = '42501';
  END IF;
  -- Un numéro déjà émis dans l'année ne peut pas être redonné
  IF p_annee <> 0 THEN
    v_min := public.numero_max_utilise(p_societe, p_type, p_annee) + 1;
    IF p_valeur < v_min THEN
      RAISE EXCEPTION 'NUMERO_DEJA_UTILISE: le prochain numéro libre de % est %', p_annee, v_min USING ERRCODE = '22023';
    END IF;
  END IF;
  INSERT INTO public.compteurs_numerotation (societe_id, type, annee, valeur)
    VALUES (p_societe, p_type, p_annee, GREATEST(1, p_valeur))
    ON CONFLICT (societe_id, type, annee) DO UPDATE SET valeur = EXCLUDED.valeur;
END $$;


ALTER FUNCTION "public"."definir_compteur"("p_societe" "uuid", "p_type" "text", "p_annee" integer, "p_valeur" integer) OWNER TO "postgres";

--
-- Name: employe_autorise("uuid", "uuid", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."employe_autorise"("_user_id" "uuid", "_societe_id" "uuid", "_activite_id" "uuid", "_repartition" "jsonb") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.activite_autorisee(_user_id, _societe_id, _activite_id)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(_repartition, '[]'::jsonb)) r
      WHERE (r->>'part')::numeric > 0
        AND public.activite_autorisee(_user_id, _societe_id, (r->>'activiteId')::uuid)
        AND EXISTS (SELECT 1 FROM public.user_activites WHERE user_id = _user_id AND societe_id = _societe_id)
    )
$$;


ALTER FUNCTION "public"."employe_autorise"("_user_id" "uuid", "_societe_id" "uuid", "_activite_id" "uuid", "_repartition" "jsonb") OWNER TO "postgres";

--
-- Name: employe_id_autorise("uuid", bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."employe_id_autorise"("_user_id" "uuid", "_employe_id" bigint) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT COALESCE(e.user_id = _user_id, false)
         OR public.employe_autorise(_user_id, e.societe_id, e.activite_id, e.repartition)
       FROM public.employes e WHERE e.id = _employe_id),
    true)
$$;


ALTER FUNCTION "public"."employe_id_autorise"("_user_id" "uuid", "_employe_id" bigint) OWNER TO "postgres";

--
-- Name: est_personnel("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."est_personnel"("_user_id" "uuid", "_societe_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.is_admin_general(_user_id)
    OR (
      public.has_societe_access(_user_id, _societe_id)
      AND (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role <> 'employe'::app_role)
        OR EXISTS (SELECT 1 FROM public.cross_service_grants WHERE user_id = _user_id AND expires_at > now())
      )
    )
$$;


ALTER FUNCTION "public"."est_personnel"("_user_id" "uuid", "_societe_id" "uuid") OWNER TO "postgres";

--
-- Name: generate_set_impots("public"."regime_fiscal_enum", "public"."secteur_activite_enum", numeric, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."generate_set_impots"("p_regime" "public"."regime_fiscal_enum", "p_secteur" "public"."secteur_activite_enum", "p_ca_annuel" numeric DEFAULT 0, "p_assujetti_tva" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result   jsonb    := '[]'::jsonb;
  v_taux_pat numeric;
  v_imf_min  numeric;
BEGIN
  IF p_regime IN ('IS', 'IMF') THEN
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'code','IS','label','Impôt sur les Sociétés','taux',0.27,
      'assiette','benefice_net','article','CGI Art. 128','periodicite','annuel'));
  END IF;

  IF p_regime IN ('IS', 'IMF') THEN
    v_imf_min := 20000;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'code','IMF','label','Impôt Minimum Forfaitaire','taux',0.01,
      'assiette','ca_ht','montant_min',v_imf_min,'article','CGI Art. 141','periodicite','annuel'));
  END IF;

  IF p_regime = 'TPU' THEN
    IF p_secteur IN ('CO','HO','PH','IND','AGRI') THEN
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'code','TPU','label','Taxe Professionnelle Unique — Commerce / Production',
        'taux',0.02,'assiette','ca_ht','article','CGI Art. 163','periodicite','trimestriel'));
    ELSE
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'code','TPU','label','Taxe Professionnelle Unique — Services',
        'taux',0.08,'assiette','ca_ht','article','CGI Art. 163','periodicite','trimestriel'));
    END IF;
  END IF;

  IF p_assujetti_tva
     AND p_regime NOT IN ('BE','ASS','TPU')
     AND p_secteur NOT IN ('BE','ASS')
     AND p_ca_annuel > 60000000 THEN
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'code','TVA','label','Taxe sur la Valeur Ajoutée','taux',0.18,
      'assiette','ca_ht','seuil_ca',60000000,'article','CGI Art. 203','periodicite','mensuel'));
  END IF;

  IF p_regime = 'BE' OR p_secteur = 'BE' THEN
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'code','TAF','label','Taxe sur les Activités Financières','taux',0.10,
      'assiette','produits_bruts','article','CGI Art. 230','periodicite','mensuel'));
  END IF;

  IF p_regime = 'ASS' OR p_secteur = 'ASS' THEN
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('code','TCA_NAV','label','TCA Navigation','taux',0.05,'assiette','primes_nettes','article','CGI Art. 246','periodicite','mensuel'),
      jsonb_build_object('code','TCA_INC_GEN','label','TCA Incendie général','taux',0.25,'assiette','primes_nettes','article','CGI Art. 246','periodicite','mensuel'),
      jsonb_build_object('code','TCA_INC_PRO','label','TCA Incendie professionnel','taux',0.20,'assiette','primes_nettes','article','CGI Art. 246','periodicite','mensuel'),
      jsonb_build_object('code','TCA_VIE','label','TCA Vie','taux',0.03,'assiette','primes_nettes','article','CGI Art. 246','periodicite','mensuel'),
      jsonb_build_object('code','TCA_AUT','label','TCA Autres','taux',0.06,'assiette','primes_nettes','article','CGI Art. 246','periodicite','mensuel'),
      jsonb_build_object('code','TCA_CRED','label','TCA Crédit export','taux',0.002,'assiette','primes_nettes','article','CGI Art. 246','periodicite','mensuel')
    );
  END IF;

  IF p_regime IN ('TEL','TI') OR p_secteur IN ('TEL','TI') THEN
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'code','TETTIC',
      'label', CASE WHEN p_secteur='TEL' THEN 'TETTIC — Télécommunications' ELSE 'TETTIC — Transferts Internationaux' END,
      'taux',0.05,'assiette','ca_ht','article','CGI Art. 253','periodicite','mensuel'));
  END IF;

  IF p_ca_annuel > 0 THEN
    IF p_ca_annuel <= 5000000 THEN
      v_taux_pat := CASE p_secteur
        WHEN 'CO' THEN 0.0055 WHEN 'HO' THEN 0.0055 WHEN 'PH' THEN 0.0055
        WHEN 'SE' THEN 0.0075 WHEN 'ASS' THEN 0.0075
        WHEN 'BE' THEN 0.0075 WHEN 'BTP' THEN 0.0075
        WHEN 'IND' THEN 0.0035 WHEN 'AGRI' THEN 0.0035
        WHEN 'TEL' THEN 0.0080 WHEN 'TI' THEN 0.0050
        ELSE 0.0075 END;
    ELSIF p_ca_annuel <= 30000000 THEN
      v_taux_pat := CASE p_secteur
        WHEN 'CO' THEN 0.0060 WHEN 'HO' THEN 0.0060 WHEN 'PH' THEN 0.0060
        WHEN 'SE' THEN 0.0090 WHEN 'ASS' THEN 0.0090
        WHEN 'BE' THEN 0.0090 WHEN 'BTP' THEN 0.0090
        WHEN 'IND' THEN 0.0040 WHEN 'AGRI' THEN 0.0040
        WHEN 'TEL' THEN 0.0100 WHEN 'TI' THEN 0.0065
        ELSE 0.0090 END;
    ELSIF p_ca_annuel <= 100000000 THEN
      v_taux_pat := CASE p_secteur
        WHEN 'CO' THEN 0.0065 WHEN 'HO' THEN 0.0065 WHEN 'PH' THEN 0.0065
        WHEN 'SE' THEN 0.0105 WHEN 'ASS' THEN 0.0105
        WHEN 'BE' THEN 0.0105 WHEN 'BTP' THEN 0.0105
        WHEN 'IND' THEN 0.0045 WHEN 'AGRI' THEN 0.0045
        WHEN 'TEL' THEN 0.0110 WHEN 'TI' THEN 0.0075
        ELSE 0.0105 END;
    ELSE
      v_taux_pat := CASE p_secteur
        WHEN 'CO' THEN 0.0070 WHEN 'HO' THEN 0.0070 WHEN 'PH' THEN 0.0070
        WHEN 'SE' THEN 0.0120 WHEN 'ASS' THEN 0.0120
        WHEN 'BE' THEN 0.0120 WHEN 'BTP' THEN 0.0120
        WHEN 'IND' THEN 0.0050 WHEN 'AGRI' THEN 0.0050
        WHEN 'TEL' THEN 0.0130 WHEN 'TI' THEN 0.0090
        ELSE 0.0100 END;
    END IF;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'code','PATENTE','label','Taxe Professionnelle (Patente)',
      'taux',v_taux_pat,'assiette','ca_annuel','article','CGI Art. 302',
      'periodicite','annuel','montant_estime',ROUND(p_ca_annuel * v_taux_pat)));
  END IF;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."generate_set_impots"("p_regime" "public"."regime_fiscal_enum", "p_secteur" "public"."secteur_activite_enum", "p_ca_annuel" numeric, "p_assujetti_tva" boolean) OWNER TO "postgres";

--
-- Name: get_internal_webhook_secret(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_internal_webhook_secret"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
DECLARE
  v text;
BEGIN
  SELECT decrypted_secret INTO v FROM vault.decrypted_secrets WHERE name = 'internal_webhook_secret' LIMIT 1;
  RETURN v;
END;
$$;


ALTER FUNCTION "public"."get_internal_webhook_secret"() OWNER TO "postgres";

--
-- Name: handle_new_societe(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."handle_new_societe"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.societe_config (societe_id)
  VALUES (NEW.id)
  ON CONFLICT (societe_id) DO NOTHING;

  INSERT INTO public.services (societe_id, nom, description, couleur, built_in)
  VALUES
    (NEW.id, 'Comptabilité', 'Service intégré — gestion comptable et financière', '#0ea5e9', true),
    (NEW.id, 'GRH', 'Service intégré — gestion des ressources humaines', '#8b5cf6', true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_societe"() OWNER TO "postgres";

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, nom)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nom', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";

--
-- Name: has_active_chef_grant("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."has_active_chef_grant"("_user_id" "uuid", "_service" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cross_service_grants
    WHERE user_id = _user_id
      AND service = _service
      AND level = 'chef'
      AND expires_at > now()
  )
$$;


ALTER FUNCTION "public"."has_active_chef_grant"("_user_id" "uuid", "_service" "text") OWNER TO "postgres";

--
-- Name: has_active_grant("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."has_active_grant"("_user_id" "uuid", "_service" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cross_service_grants
    WHERE user_id = _user_id
      AND service = _service
      AND expires_at > now()
  )
$$;


ALTER FUNCTION "public"."has_active_grant"("_user_id" "uuid", "_service" "text") OWNER TO "postgres";

--
-- Name: has_role("uuid", "public"."app_role"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";

--
-- Name: has_societe_access("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."has_societe_access"("_societe_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$BEGIN RETURN public.has_societe_access(auth.uid(), _societe_id); END;$$;


ALTER FUNCTION "public"."has_societe_access"("_societe_id" "uuid") OWNER TO "postgres";

--
-- Name: has_societe_access("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."has_societe_access"("_user_id" "uuid", "_societe_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.is_admin_general(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_societes
      WHERE user_id = _user_id
        AND societe_id = _societe_id
    );
END;
$$;


ALTER FUNCTION "public"."has_societe_access"("_user_id" "uuid", "_societe_id" "uuid") OWNER TO "postgres";

--
-- Name: in_service_compta("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."in_service_compta"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'chef_compta'::app_role, 'membre_compta'::app_role)
  ) OR public.has_active_grant(_user_id, 'compta')
$$;


ALTER FUNCTION "public"."in_service_compta"("_user_id" "uuid") OWNER TO "postgres";

--
-- Name: in_service_grh("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."in_service_grh"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'chef_grh'::app_role, 'membre_grh'::app_role, 'rh'::app_role)
  ) OR public.has_active_grant(_user_id, 'grh')
$$;


ALTER FUNCTION "public"."in_service_grh"("_user_id" "uuid") OWNER TO "postgres";

--
-- Name: interdire_encaissement_non_validee(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."interdire_encaissement_non_validee"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.statut = 'payee'
     AND OLD.statut IS DISTINCT FROM 'payee'
     AND NEW.statut_validation IS DISTINCT FROM 'valide' THEN
    RAISE EXCEPTION 'FACTURE_NON_VALIDEE: la facture doit être validée avant d''être encaissée'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;


ALTER FUNCTION "public"."interdire_encaissement_non_validee"() OWNER TO "postgres";

--
-- Name: interdire_exercice_cloture(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."interdire_exercice_cloture"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
       SELECT 1 FROM public.exercices e WHERE e.societe_id = OLD.societe_id AND e.annee = OLD.annee AND e.statut = 'cloture') THEN
    RAISE EXCEPTION 'EXERCICE_CLOTURE: l''exercice % est clôturé', OLD.annee USING ERRCODE = '42501';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND EXISTS (
       SELECT 1 FROM public.exercices e WHERE e.societe_id = NEW.societe_id AND e.annee = NEW.annee AND e.statut = 'cloture') THEN
    RAISE EXCEPTION 'EXERCICE_CLOTURE: l''exercice % est clôturé', NEW.annee USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;


ALTER FUNCTION "public"."interdire_exercice_cloture"() OWNER TO "postgres";

--
-- Name: interdire_suppression_facture_engagee(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."interdire_suppression_facture_engagee"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF (OLD.statut_validation = 'valide' OR OLD.statut IN ('payee', 'annulee'))
     AND (TG_OP = 'DELETE' OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'FACTURE_ENGAGEE: une facture validée, payée ou annulée ne peut pas être supprimée ; annulez-la'
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;


ALTER FUNCTION "public"."interdire_suppression_facture_engagee"() OWNER TO "postgres";

--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$BEGIN RETURN public.is_admin(auth.uid()); END;$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

--
-- Name: is_admin("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_admin"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
$$;


ALTER FUNCTION "public"."is_admin"("_user_id" "uuid") OWNER TO "postgres";

--
-- Name: is_admin_general(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_admin_general"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$BEGIN RETURN public.is_admin_general(auth.uid()); END;$$;


ALTER FUNCTION "public"."is_admin_general"() OWNER TO "postgres";

--
-- Name: is_admin_general("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_admin_general"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role::text = 'admin_general'
  )
  and (
    _user_id is distinct from auth.uid()
    or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
  );
end;
$$;


ALTER FUNCTION "public"."is_admin_general"("_user_id" "uuid") OWNER TO "postgres";

--
-- Name: is_chef("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_chef"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('chef_compta'::app_role, 'chef_grh'::app_role)
  )
$$;


ALTER FUNCTION "public"."is_chef"("_user_id" "uuid") OWNER TO "postgres";

--
-- Name: is_chef_compta("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_chef_compta"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.is_admin(_user_id)
      OR public.has_role(_user_id, 'chef_compta'::app_role)
      OR public.has_active_chef_grant(_user_id, 'compta')
$$;


ALTER FUNCTION "public"."is_chef_compta"("_user_id" "uuid") OWNER TO "postgres";

--
-- Name: is_chef_grh("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_chef_grh"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.is_admin(_user_id)
      OR public.has_role(_user_id, 'chef_grh'::app_role)
      OR public.has_active_chef_grant(_user_id, 'grh')
$$;


ALTER FUNCTION "public"."is_chef_grh"("_user_id" "uuid") OWNER TO "postgres";

--
-- Name: is_employe("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_employe"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.has_role(_user_id, 'employe'::public.app_role)
$$;


ALTER FUNCTION "public"."is_employe"("_user_id" "uuid") OWNER TO "postgres";

--
-- Name: is_modele_societe("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_modele_societe"("_societe_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.societes
    WHERE id = _societe_id AND slug = '_modele'
  )
$$;


ALTER FUNCTION "public"."is_modele_societe"("_societe_id" "uuid") OWNER TO "postgres";

--
-- Name: nb_codes_secours(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."nb_codes_secours"() RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(*)::integer
  from public.mfa_recovery_codes
  where user_id = (select auth.uid()) and used_at is null
$$;


ALTER FUNCTION "public"."nb_codes_secours"() OWNER TO "postgres";

--
-- Name: notify_validation_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."notify_validation_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_url text := 'https://yblucgmxofyelziwlvxu.supabase.co/functions/v1/notification-validation';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlibHVjZ214b2Z5ZWx6aXdsdnh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODgxNzUsImV4cCI6MjA5Mjg2NDE3NX0.BI4CPBi1_lWYx-n9eCg_OErZhb94DGbq8VEhEn9hNZg';
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
$_$;


ALTER FUNCTION "public"."notify_validation_change"() OWNER TO "postgres";

--
-- Name: notify_validation_insert(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."notify_validation_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_url text := 'https://yblucgmxofyelziwlvxu.supabase.co/functions/v1/notification-validation';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlibHVjZ214b2Z5ZWx6aXdsdnh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODgxNzUsImV4cCI6MjA5Mjg2NDE3NX0.BI4CPBi1_lWYx-n9eCg_OErZhb94DGbq8VEhEn9hNZg';
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
$_$;


ALTER FUNCTION "public"."notify_validation_insert"() OWNER TO "postgres";

--
-- Name: numero_max_utilise("uuid", "text", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."numero_max_utilise"("p_societe" "uuid", "p_type" "text", "p_annee" integer) RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE rx text; v integer;
BEGIN
  SELECT public.regex_numero(COALESCE(
           CASE WHEN p_type = 'facture' THEN format_facture ELSE format_devis END,
           CASE WHEN p_type = 'facture' THEN 'FAC-{YYYY}-{NNN}' ELSE 'DEV-{YYYY}-{NNN}' END))
    INTO rx FROM public.societe_config WHERE societe_id = p_societe;
  rx := COALESCE(rx, public.regex_numero(CASE WHEN p_type = 'facture' THEN 'FAC-{YYYY}-{NNN}' ELSE 'DEV-{YYYY}-{NNN}' END));
  IF p_type = 'facture' THEN
    SELECT MAX((regexp_match(numero, rx))[1]::integer) INTO v
      FROM public.factures WHERE societe_id = p_societe AND annee = p_annee;
  ELSE
    SELECT MAX((regexp_match(numero, rx))[1]::integer) INTO v
      FROM public.devis WHERE societe_id = p_societe AND annee = p_annee;
  END IF;
  RETURN COALESCE(v, 0);
END $$;


ALTER FUNCTION "public"."numero_max_utilise"("p_societe" "uuid", "p_type" "text", "p_annee" integer) OWNER TO "postgres";

--
-- Name: prevent_builtin_service_delete(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."prevent_builtin_service_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.built_in THEN
    RAISE EXCEPTION 'Le service « % » est intégré et ne peut pas être supprimé.', OLD.nom;
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."prevent_builtin_service_delete"() OWNER TO "postgres";

--
-- Name: prochain_numero("uuid", "text", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."prochain_numero"("p_societe" "uuid", "p_type" "text", "p_annee" integer) RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v integer;
BEGIN
  IF NOT public.has_societe_access(auth.uid(), p_societe) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  SELECT valeur INTO v FROM public.compteurs_numerotation
    WHERE societe_id = p_societe AND type = p_type AND annee = p_annee;
  IF v IS NOT NULL THEN RETURN v; END IF;
  IF p_annee = 0 THEN
    SELECT GREATEST(1, COALESCE(CASE WHEN p_type = 'facture' THEN compteur_facture ELSE compteur_devis END, 1))
      INTO v FROM public.societe_config WHERE societe_id = p_societe;
    RETURN COALESCE(v, 1);
  END IF;
  RETURN public.numero_max_utilise(p_societe, p_type, p_annee) + 1;
END $$;


ALTER FUNCTION "public"."prochain_numero"("p_societe" "uuid", "p_type" "text", "p_annee" integer) OWNER TO "postgres";

--
-- Name: profil_id_par_email("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."profil_id_par_email"("_email" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.id
  from public.profiles p
  where p.email = lower(trim(_email))
    and (public.is_admin((select auth.uid())) or public.is_admin_general((select auth.uid())))
  limit 1
$$;


ALTER FUNCTION "public"."profil_id_par_email"("_email" "text") OWNER TO "postgres";

--
-- Name: regex_numero("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."regex_numero"("p_format" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $_$
DECLARE f text := p_format;
BEGIN
  f := replace(f, '{NNNNN}', chr(1)); f := replace(f, '{NNNN}', chr(1));
  f := replace(f, '{NNN}', chr(1));   f := replace(f, '{NN}', chr(1));
  f := replace(f, '{N}', chr(1));
  f := replace(f, '{YYYY}', chr(2)); f := replace(f, '{YY}', chr(3)); f := replace(f, '{MM}', chr(4));
  -- Tout autre caractère est pris tel quel
  f := regexp_replace(f, '([^A-Za-z0-9\x01-\x04])', '\\\1', 'g');
  f := replace(f, chr(1), '(\d+)'); f := replace(f, chr(2), '\d{4}');
  f := replace(f, chr(3), '\d{2}'); f := replace(f, chr(4), '\d{2}');
  RETURN '^' || f || '$';
END $_$;


ALTER FUNCTION "public"."regex_numero"("p_format" "text") OWNER TO "postgres";

--
-- Name: reserver_numero("uuid", "text", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reserver_numero"("p_societe" "uuid", "p_type" "text", "p_annee" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v integer;
BEGIN
  IF NOT public.has_societe_access(auth.uid(), p_societe) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.compteurs_numerotation (societe_id, type, annee, valeur)
    VALUES (p_societe, p_type, p_annee, public.prochain_numero(p_societe, p_type, p_annee))
    ON CONFLICT (societe_id, type, annee) DO NOTHING;
  UPDATE public.compteurs_numerotation SET valeur = valeur + 1
    WHERE societe_id = p_societe AND type = p_type AND annee = p_annee
    RETURNING valeur - 1 INTO v;
  RETURN v;
END $$;


ALTER FUNCTION "public"."reserver_numero"("p_societe" "uuid", "p_type" "text", "p_annee" integer) OWNER TO "postgres";

--
-- Name: set_ecritures_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_ecritures_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_ecritures_updated_at"() OWNER TO "postgres";

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

--
-- Name: trg_recalc_set_impots(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."trg_recalc_set_impots"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF (
    OLD.regime_fiscal     IS DISTINCT FROM NEW.regime_fiscal     OR
    OLD.secteur_activite  IS DISTINCT FROM NEW.secteur_activite  OR
    OLD.assujetti_tva     IS DISTINCT FROM NEW.assujetti_tva     OR
    OLD.ca_annuel_estime  IS DISTINCT FROM NEW.ca_annuel_estime
  ) THEN
    NEW.set_impots := public.generate_set_impots(
      COALESCE(NEW.regime_fiscal,    'IS'::public.regime_fiscal_enum),
      COALESCE(NEW.secteur_activite, 'SE'::public.secteur_activite_enum),
      COALESCE(NEW.ca_annuel_estime, 0),
      COALESCE(NEW.assujetti_tva,    false)
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_recalc_set_impots"() OWNER TO "postgres";

--
-- Name: update_ecritures_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_ecritures_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ecritures_updated_at"() OWNER TO "postgres";

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

--
-- Name: validate_grant_expiration(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."validate_grant_expiration"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'expires_at doit être dans le futur';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_grant_expiration"() OWNER TO "postgres";

--
-- Name: verrou_apparence_societe(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."verrou_apparence_societe"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or public.is_admin_general(auth.uid()) then
    return new;
  end if;

  if new.couleur_primaire is distinct from old.couleur_primaire
     or new.couleur_secondaire is distinct from old.couleur_secondaire
     or new.couleur_accent is distinct from old.couleur_accent
     or new.police is distinct from old.police
     or new.theme_custom is distinct from old.theme_custom then
    raise exception 'Apparence réservée au super-administrateur'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."verrou_apparence_societe"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: absences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."absences" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "annee" integer NOT NULL,
    "mois" integer NOT NULL,
    "employe_id" bigint NOT NULL,
    "type" "text" NOT NULL,
    "date_debut" "date" NOT NULL,
    "date_fin" "date" NOT NULL,
    "jours" numeric DEFAULT 0 NOT NULL,
    "motif" "text",
    "statut_validation" "text" DEFAULT 'en_validation'::"text",
    "motif_rejet" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "cree_par" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."absences" OWNER TO "postgres";

--
-- Name: COLUMN "absences"."deleted_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."absences"."deleted_at" IS 'NULL = actif ; non-NULL = dans la corbeille (soft delete)';


--
-- Name: absences_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."absences_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."absences_id_seq" OWNER TO "postgres";

--
-- Name: absences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."absences_id_seq" OWNED BY "public"."absences"."id";


--
-- Name: activites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."activites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "couleur" "text" DEFAULT '#6366f1'::"text" NOT NULL,
    "actif" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "adresse" "text",
    "telephone" "text",
    "compte_caisse" "text",
    CONSTRAINT "activites_compte_caisse_check" CHECK ((("compte_caisse" IS NULL) OR ("compte_caisse" ~ '^57[0-9]{2,6}$'::"text")))
);


ALTER TABLE "public"."activites" OWNER TO "postgres";

--
-- Name: alertes_lues; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."alertes_lues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "alerte_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."alertes_lues" OWNER TO "postgres";

--
-- Name: app_state; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."app_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."app_state" REPLICA IDENTITY FULL;


ALTER TABLE "public"."app_state" OWNER TO "postgres";

--
-- Name: articles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."articles" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "reference" "text" NOT NULL,
    "designation" "text" NOT NULL,
    "categorie_id" bigint,
    "unite" "text" DEFAULT 'pièce'::"text" NOT NULL,
    "prix_achat" numeric DEFAULT 0 NOT NULL,
    "prix_vente" numeric DEFAULT 0 NOT NULL,
    "stock" numeric DEFAULT 0 NOT NULL,
    "seuil_alerte" numeric DEFAULT 0 NOT NULL,
    "fournisseur_id" bigint,
    "emplacement" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "activite_id" "uuid",
    "nature" "text" DEFAULT 'marchandise'::"text" NOT NULL,
    CONSTRAINT "articles_nature_check" CHECK (("nature" = ANY (ARRAY['marchandise'::"text", 'matiere'::"text", 'consommable'::"text"])))
);


ALTER TABLE "public"."articles" OWNER TO "postgres";

--
-- Name: COLUMN "articles"."deleted_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."articles"."deleted_at" IS 'NULL = actif ; non-NULL = dans la corbeille (soft delete)';


--
-- Name: articles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."articles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."articles_id_seq" OWNER TO "postgres";

--
-- Name: articles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."articles_id_seq" OWNED BY "public"."articles"."id";


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "user_email" "text",
    "action" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "text",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "changes" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "value_before" "jsonb",
    "value_after" "jsonb",
    "societe_id" "uuid",
    "description" "text"
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";

--
-- Name: bulletins_paie; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."bulletins_paie" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employe_id" bigint NOT NULL,
    "employe_nom" "text" NOT NULL,
    "employe_user_id" "uuid",
    "societe_id" "uuid" NOT NULL,
    "mois" smallint NOT NULL,
    "annee" smallint NOT NULL,
    "salaire_base" numeric DEFAULT 0 NOT NULL,
    "sursalaire" numeric DEFAULT 0 NOT NULL,
    "prime_anciennete" numeric DEFAULT 0 NOT NULL,
    "hs_montant" numeric DEFAULT 0 NOT NULL,
    "primes_diverses" numeric DEFAULT 0 NOT NULL,
    "indemnites" numeric DEFAULT 0 NOT NULL,
    "brut" numeric DEFAULT 0 NOT NULL,
    "cnss_sal" numeric DEFAULT 0 NOT NULL,
    "amu_sal" numeric DEFAULT 0 NOT NULL,
    "irpp" numeric DEFAULT 0 NOT NULL,
    "retenues_diverses" numeric DEFAULT 0 NOT NULL,
    "total_retenues" numeric DEFAULT 0 NOT NULL,
    "net_a_payer" numeric DEFAULT 0 NOT NULL,
    "cnss_pat" numeric DEFAULT 0 NOT NULL,
    "amu_pat" numeric DEFAULT 0 NOT NULL,
    "cout_employeur" numeric DEFAULT 0 NOT NULL,
    "statut" "text" DEFAULT 'brouillon'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    CONSTRAINT "bulletins_paie_mois_check" CHECK ((("mois" >= 1) AND ("mois" <= 12))),
    CONSTRAINT "bulletins_paie_statut_check" CHECK (("statut" = ANY (ARRAY['brouillon'::"text", 'valide'::"text", 'paye'::"text"])))
);


ALTER TABLE "public"."bulletins_paie" OWNER TO "postgres";

--
-- Name: categories_stock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."categories_stock" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."categories_stock" OWNER TO "postgres";

--
-- Name: categories_stock_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."categories_stock_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."categories_stock_id_seq" OWNER TO "postgres";

--
-- Name: categories_stock_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."categories_stock_id_seq" OWNED BY "public"."categories_stock"."id";


--
-- Name: compteurs_numerotation; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."compteurs_numerotation" (
    "societe_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "annee" integer NOT NULL,
    "valeur" integer NOT NULL,
    CONSTRAINT "compteurs_numerotation_type_check" CHECK (("type" = ANY (ARRAY['facture'::"text", 'devis'::"text"]))),
    CONSTRAINT "compteurs_numerotation_valeur_check" CHECK (("valeur" >= 1))
);


ALTER TABLE "public"."compteurs_numerotation" OWNER TO "postgres";

--
-- Name: cross_service_grants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."cross_service_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "service" "text" NOT NULL,
    "level" "text" DEFAULT 'chef'::"text" NOT NULL,
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cross_service_grants_level_check" CHECK (("level" = ANY (ARRAY['membre'::"text", 'chef'::"text"]))),
    CONSTRAINT "cross_service_grants_service_check" CHECK (("service" = ANY (ARRAY['compta'::"text", 'grh'::"text"])))
);


ALTER TABLE "public"."cross_service_grants" OWNER TO "postgres";

--
-- Name: custom_postes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."custom_postes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "niveau" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."custom_postes" OWNER TO "postgres";

--
-- Name: custom_services; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."custom_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "workflow_validation" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."custom_services" OWNER TO "postgres";

--
-- Name: device_otps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."device_otps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "code_hash" "text" NOT NULL,
    "device_fp" "text",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:10:00'::interval) NOT NULL,
    "used" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."device_otps" OWNER TO "postgres";

--
-- Name: device_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."device_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "device_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "confirmation_token" "text",
    "token_expires_at" timestamp with time zone,
    "user_agent" "text",
    "ip" "text",
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "device_sessions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."device_sessions" OWNER TO "postgres";

--
-- Name: devis; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."devis" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "annee" integer NOT NULL,
    "mois" integer NOT NULL,
    "numero" "text" NOT NULL,
    "client" "text" NOT NULL,
    "date" "date" NOT NULL,
    "date_validite" "date",
    "lignes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "reduction" numeric DEFAULT 0,
    "avec_tva" boolean DEFAULT false,
    "statut" "text" DEFAULT 'brouillon'::"text" NOT NULL,
    "total_ht" numeric DEFAULT 0 NOT NULL,
    "total_tva" numeric DEFAULT 0 NOT NULL,
    "total_ttc" numeric DEFAULT 0 NOT NULL,
    "activite" "text",
    "facture_id" bigint,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "activite_id" "uuid"
);


ALTER TABLE "public"."devis" OWNER TO "postgres";

--
-- Name: COLUMN "devis"."deleted_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."devis"."deleted_at" IS 'NULL = actif ; non-NULL = dans la corbeille (soft delete)';


--
-- Name: devis_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."devis_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."devis_id_seq" OWNER TO "postgres";

--
-- Name: devis_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."devis_id_seq" OWNED BY "public"."devis"."id";


--
-- Name: ecritures_comptables; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ecritures_comptables" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "annee" integer NOT NULL,
    "mois" integer NOT NULL,
    "journal" "text" NOT NULL,
    "numero_piece" "text" DEFAULT ''::"text" NOT NULL,
    "libelle" "text" DEFAULT ''::"text" NOT NULL,
    "lignes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "statut" "text" DEFAULT 'brouillon'::"text" NOT NULL,
    "facture_id" bigint,
    "bulletin_id" "uuid",
    "cree_par" "uuid" DEFAULT "auth"."uid"(),
    "valide_par" "uuid",
    "motif_rejet" "text",
    "piece_jointe" "text",
    "piece_jointe_nom" "text",
    "piece_jointe_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "date" "date",
    "activite_id" "uuid",
    CONSTRAINT "ecritures_comptables_journal_check" CHECK (("journal" = ANY (ARRAY['AC'::"text", 'VE'::"text", 'BQ'::"text", 'CA'::"text", 'OD'::"text", 'AN'::"text"]))),
    CONSTRAINT "ecritures_comptables_mois_check" CHECK ((("mois" >= 1) AND ("mois" <= 12))),
    CONSTRAINT "ecritures_comptables_statut_check" CHECK (("statut" = ANY (ARRAY['brouillon'::"text", 'valide'::"text", 'cloture'::"text"])))
);


ALTER TABLE "public"."ecritures_comptables" OWNER TO "postgres";

--
-- Name: ecritures_comptables_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."ecritures_comptables_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ecritures_comptables_id_seq" OWNER TO "postgres";

--
-- Name: ecritures_comptables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."ecritures_comptables_id_seq" OWNED BY "public"."ecritures_comptables"."id";


--
-- Name: email_send_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."email_send_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_email" "text" NOT NULL,
    "template_name" "text" NOT NULL,
    "status" "text" NOT NULL,
    "message_id" "text",
    "error_message" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_send_log" OWNER TO "postgres";

--
-- Name: email_send_state; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."email_send_state" (
    "id" integer NOT NULL,
    "batch_size" integer DEFAULT 10 NOT NULL,
    "send_delay_ms" integer DEFAULT 500 NOT NULL,
    "auth_email_ttl_minutes" integer DEFAULT 60 NOT NULL,
    "transactional_email_ttl_minutes" integer DEFAULT 1440 NOT NULL,
    "retry_after_until" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_send_state" OWNER TO "postgres";

--
-- Name: email_send_state_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."email_send_state" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."email_send_state_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: email_unsubscribe_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."email_unsubscribe_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "token" "text" NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_unsubscribe_tokens" OWNER TO "postgres";

--
-- Name: employes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."employes" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "poste" "text" DEFAULT ''::"text" NOT NULL,
    "salaire" numeric DEFAULT 0 NOT NULL,
    "situation" "text" DEFAULT 'celibataire'::"text" NOT NULL,
    "enfants" integer DEFAULT 0 NOT NULL,
    "matricule" "text",
    "date_naissance" "date",
    "lieu_naissance" "text",
    "sexe" "text",
    "nationalite" "text",
    "adresse" "text",
    "telephone" "text",
    "email" "text",
    "num_cnss" "text",
    "cni" "text",
    "type_contrat" "text",
    "date_embauche" "date",
    "date_fin_contrat" "date",
    "categorie" "text",
    "echelon" integer,
    "qualification" "text",
    "indemnite_transport" numeric DEFAULT 0,
    "indemnite_logement" numeric DEFAULT 0,
    "indemnite_fonction" numeric DEFAULT 0,
    "sursalaire" numeric DEFAULT 0,
    "solde_conges" numeric DEFAULT 0,
    "user_id" "uuid",
    "statut_validation" "text" DEFAULT 'en_validation'::"text",
    "motif_rejet" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "interet_pret_immobilier" numeric(12,2) DEFAULT NULL::numeric,
    "assurance_vie" numeric(12,2) DEFAULT NULL::numeric,
    "retraite_complementaire" numeric(12,2) DEFAULT NULL::numeric,
    "cree_par" "uuid" DEFAULT "auth"."uid"(),
    "activite_id" "uuid",
    "repartition" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."employes" OWNER TO "postgres";

--
-- Name: COLUMN "employes"."deleted_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."employes"."deleted_at" IS 'NULL = actif ; non-NULL = dans la corbeille (soft delete)';


--
-- Name: COLUMN "employes"."interet_pret_immobilier"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."employes"."interet_pret_immobilier" IS 'VI — Intérêt mensuel de prêt immobilier déductible de l''IRPP (FCFA/mois)';


--
-- Name: COLUMN "employes"."assurance_vie"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."employes"."assurance_vie" IS 'VII — Prime mensuelle d''assurance-vie, plafond légal = (200 000 + 30 000 × enfants≤6) ÷ 12 FCFA/mois';


--
-- Name: COLUMN "employes"."retraite_complementaire"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."employes"."retraite_complementaire" IS 'VIII — Cotisation mensuelle de retraite complémentaire, plafond = 6 % du RNT mensuel';


--
-- Name: employes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."employes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."employes_id_seq" OWNER TO "postgres";

--
-- Name: employes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."employes_id_seq" OWNED BY "public"."employes"."id";


--
-- Name: emprunts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."emprunts" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "preteur" "text" NOT NULL,
    "objet" "text",
    "montant" numeric NOT NULL,
    "taux_annuel" numeric DEFAULT 0 NOT NULL,
    "duree_mois" integer NOT NULL,
    "periodicite" "text" DEFAULT 'mensuelle'::"text" NOT NULL,
    "date_deblocage" "date" NOT NULL,
    "compte" "text" DEFAULT '162'::"text" NOT NULL,
    "tresorerie" "text" DEFAULT '521'::"text" NOT NULL,
    "garantie" "text",
    "montant_garanti" numeric,
    "activite_id" "uuid",
    "cree_par" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "emprunts_duree_mois_check" CHECK (("duree_mois" > 0)),
    CONSTRAINT "emprunts_garantie_check" CHECK ((("garantie" IS NULL) OR ("garantie" = ANY (ARRAY['hypotheque'::"text", 'nantissement'::"text", 'gage'::"text", 'caution'::"text", 'autre'::"text"])))),
    CONSTRAINT "emprunts_montant_check" CHECK (("montant" > (0)::numeric)),
    CONSTRAINT "emprunts_periodicite_check" CHECK (("periodicite" = ANY (ARRAY['mensuelle'::"text", 'trimestrielle'::"text", 'semestrielle'::"text", 'annuelle'::"text"]))),
    CONSTRAINT "emprunts_taux_annuel_check" CHECK (("taux_annuel" >= (0)::numeric))
);


ALTER TABLE "public"."emprunts" OWNER TO "postgres";

--
-- Name: emprunts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."emprunts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."emprunts_id_seq" OWNER TO "postgres";

--
-- Name: emprunts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."emprunts_id_seq" OWNED BY "public"."emprunts"."id";


--
-- Name: exercices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."exercices" (
    "societe_id" "uuid" NOT NULL,
    "annee" integer NOT NULL,
    "statut" "text" DEFAULT 'ouvert'::"text" NOT NULL,
    "date_cloture" timestamp with time zone,
    "cloture_par" "uuid" DEFAULT "auth"."uid"(),
    "affectation" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "exercices_statut_check" CHECK (("statut" = ANY (ARRAY['ouvert'::"text", 'cloture'::"text"])))
);


ALTER TABLE "public"."exercices" OWNER TO "postgres";

--
-- Name: factures; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."factures" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "annee" integer NOT NULL,
    "mois" integer NOT NULL,
    "numero" "text" NOT NULL,
    "client" "text" NOT NULL,
    "date" "date" NOT NULL,
    "lignes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "reduction" numeric DEFAULT 0,
    "avec_tva" boolean DEFAULT false,
    "statut" "text" DEFAULT 'en_attente'::"text" NOT NULL,
    "transaction_id" bigint,
    "total_ht" numeric DEFAULT 0 NOT NULL,
    "total_tva" numeric DEFAULT 0 NOT NULL,
    "total_ttc" numeric DEFAULT 0 NOT NULL,
    "activite" "text",
    "statut_validation" "text" DEFAULT 'en_validation'::"text",
    "motif_rejet" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "activite_id" "uuid",
    "cree_par" "uuid" DEFAULT "auth"."uid"(),
    "compte_tresorerie" "text",
    "taxe_sejour" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."factures" OWNER TO "postgres";

--
-- Name: COLUMN "factures"."deleted_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."factures"."deleted_at" IS 'NULL = actif ; non-NULL = dans la corbeille (soft delete)';


--
-- Name: factures_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."factures_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."factures_id_seq" OWNER TO "postgres";

--
-- Name: factures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."factures_id_seq" OWNED BY "public"."factures"."id";


--
-- Name: fiscal_delegations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."fiscal_delegations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "delegue_user_id" "uuid" NOT NULL,
    "granted_by" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "note" "text"
);


ALTER TABLE "public"."fiscal_delegations" OWNER TO "postgres";

--
-- Name: fournisseurs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."fournisseurs" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "contact" "text",
    "telephone" "text",
    "email" "text",
    "adresse" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."fournisseurs" OWNER TO "postgres";

--
-- Name: COLUMN "fournisseurs"."deleted_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."fournisseurs"."deleted_at" IS 'NULL = actif ; non-NULL = dans la corbeille (soft delete)';


--
-- Name: fournisseurs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."fournisseurs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."fournisseurs_id_seq" OWNER TO "postgres";

--
-- Name: fournisseurs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."fournisseurs_id_seq" OWNED BY "public"."fournisseurs"."id";


--
-- Name: heures_sup; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."heures_sup" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "annee" integer NOT NULL,
    "mois" integer NOT NULL,
    "employe_id" bigint NOT NULL,
    "jour_semaine" numeric DEFAULT 0,
    "jour_sup" numeric DEFAULT 0,
    "dimanche_ferie" numeric DEFAULT 0,
    "nuit_semaine" numeric DEFAULT 0,
    "nuit_dimanche_ferie" numeric DEFAULT 0,
    "statut_validation" "text" DEFAULT 'en_validation'::"text",
    "motif_rejet" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cree_par" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."heures_sup" OWNER TO "postgres";

--
-- Name: heures_sup_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."heures_sup_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."heures_sup_id_seq" OWNER TO "postgres";

--
-- Name: heures_sup_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."heures_sup_id_seq" OWNED BY "public"."heures_sup"."id";


--
-- Name: immobilisations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."immobilisations" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "libelle" "text" NOT NULL,
    "categorie" "text",
    "date_acquisition" "date" NOT NULL,
    "valeur_origine" numeric DEFAULT 0 NOT NULL,
    "duree_amortissement" integer DEFAULT 1 NOT NULL,
    "methode" "text" DEFAULT 'lineaire'::"text" NOT NULL,
    "comptes_syscohada" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "valeur_residuelle" numeric,
    "date_cession" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "statut" "text" DEFAULT 'actif'::"text" NOT NULL,
    "valeur_cession" numeric,
    "plus_moins_value" numeric,
    "activite_id" "uuid",
    CONSTRAINT "immo_statut_check" CHECK (("statut" = ANY (ARRAY['actif'::"text", 'cede'::"text", 'rebut'::"text"])))
);


ALTER TABLE "public"."immobilisations" OWNER TO "postgres";

--
-- Name: COLUMN "immobilisations"."deleted_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."immobilisations"."deleted_at" IS 'NULL = actif ; non-NULL = dans la corbeille (soft delete)';


--
-- Name: immobilisations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."immobilisations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."immobilisations_id_seq" OWNER TO "postgres";

--
-- Name: immobilisations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."immobilisations_id_seq" OWNED BY "public"."immobilisations"."id";


--
-- Name: informations_fiscales; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."informations_fiscales" (
    "societe_id" "uuid" NOT NULL,
    "annee" integer NOT NULL,
    "donnees" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."informations_fiscales" OWNER TO "postgres";

--
-- Name: mfa_recovery_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."mfa_recovery_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "code_hash" "text" NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mfa_recovery_codes" OWNER TO "postgres";

--
-- Name: mouvements_stock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."mouvements_stock" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "annee" integer NOT NULL,
    "mois" integer NOT NULL,
    "date" "date" NOT NULL,
    "article_id" bigint NOT NULL,
    "type" "text" NOT NULL,
    "quantite" numeric NOT NULL,
    "prix_unitaire" numeric,
    "motif" "text",
    "reference" "text",
    "facture_id" bigint,
    "transaction_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activite_id" "uuid"
);


ALTER TABLE "public"."mouvements_stock" OWNER TO "postgres";

--
-- Name: mouvements_stock_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."mouvements_stock_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."mouvements_stock_id_seq" OWNER TO "postgres";

--
-- Name: mouvements_stock_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."mouvements_stock_id_seq" OWNED BY "public"."mouvements_stock"."id";


--
-- Name: params_annuels; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."params_annuels" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "annee" integer NOT NULL,
    "th" numeric,
    "rsl" numeric,
    "activite" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."params_annuels" OWNER TO "postgres";

--
-- Name: params_annuels_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."params_annuels_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."params_annuels_id_seq" OWNER TO "postgres";

--
-- Name: params_annuels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."params_annuels_id_seq" OWNED BY "public"."params_annuels"."id";


--
-- Name: permission_overrides; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."permission_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module" "text" NOT NULL,
    "level" "public"."access_level" NOT NULL,
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "permission_overrides_module_check" CHECK (("module" = ANY (ARRAY['dashboard'::"text", 'compta'::"text", 'factures'::"text", 'stock'::"text", 'immobilisations'::"text", 'fiscalite'::"text", 'parametres_sociaux'::"text", 'grh'::"text", 'saisie_ecritures'::"text", 'validation_ecritures'::"text", 'journaux'::"text", 'rapports_compta'::"text", 'devis'::"text", 'factures_vente'::"text", 'factures_achat'::"text", 'articles'::"text", 'mouvements_stock'::"text", 'inventaire'::"text", 'fiches_immo'::"text", 'cessions_immo'::"text", 'tva'::"text", 'is_impot'::"text", 'imf'::"text", 'patente'::"text", 'parafiscaux'::"text", 'grilles_salaire'::"text", 'baremes_cnss'::"text", 'employes'::"text", 'bulletins'::"text", 'conges_absences'::"text", 'sanctions'::"text", 'paie_virements'::"text"])))
);


ALTER TABLE "public"."permission_overrides" OWNER TO "postgres";

--
-- Name: CONSTRAINT "permission_overrides_module_check" ON "permission_overrides"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON CONSTRAINT "permission_overrides_module_check" ON "public"."permission_overrides" IS '32 modules valides : 8 parents + 24 sous-modules (mis à jour 2026-05-26)';


--
-- Name: portail_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."portail_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "employe_user_id" "uuid" NOT NULL,
    "contenu" "text" NOT NULL,
    "auteur" "text" NOT NULL,
    "lu" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "portail_messages_auteur_check" CHECK (("auteur" = ANY (ARRAY['admin'::"text", 'employe'::"text"]))),
    CONSTRAINT "portail_messages_contenu_check" CHECK (("char_length"("contenu") > 0))
);


ALTER TABLE "public"."portail_messages" OWNER TO "postgres";

--
-- Name: primes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."primes" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "annee" integer NOT NULL,
    "mois" integer NOT NULL,
    "employe_id" bigint NOT NULL,
    "libelle" "text" DEFAULT ''::"text" NOT NULL,
    "montant" numeric DEFAULT 0 NOT NULL,
    "statut_validation" "text" DEFAULT 'en_validation'::"text",
    "motif_rejet" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "cree_par" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."primes" OWNER TO "postgres";

--
-- Name: COLUMN "primes"."deleted_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."primes"."deleted_at" IS 'NULL = actif ; non-NULL = dans la corbeille (soft delete)';


--
-- Name: primes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."primes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."primes_id_seq" OWNER TO "postgres";

--
-- Name: primes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."primes_id_seq" OWNED BY "public"."primes"."id";


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text",
    "nom" "text",
    "actif" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "must_change_password" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";

--
-- Name: COLUMN "profiles"."must_change_password"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."profiles"."must_change_password" IS 'Si TRUE, l''utilisateur est forcé à changer son mot de passe à la prochaine connexion. Positionné à TRUE automatiquement lors d''une création de compte ou d''un reset password admin. Remis à FALSE par l''utilisateur lui-même après avoir défini son nouveau mot de passe.';


--
-- Name: retenues; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."retenues" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "annee" integer NOT NULL,
    "mois" integer NOT NULL,
    "employe_id" bigint NOT NULL,
    "montant" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retenues" OWNER TO "postgres";

--
-- Name: retenues_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."retenues_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."retenues_id_seq" OWNER TO "postgres";

--
-- Name: retenues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."retenues_id_seq" OWNED BY "public"."retenues"."id";


--
-- Name: sanctions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."sanctions" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "employe_id" bigint NOT NULL,
    "date" "date" NOT NULL,
    "type" "text" NOT NULL,
    "motif" "text" DEFAULT ''::"text" NOT NULL,
    "jours_mise_a_pied" integer,
    "observations" "text",
    "statut_validation" "text" DEFAULT 'en_validation'::"text",
    "motif_rejet" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "cree_par" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."sanctions" OWNER TO "postgres";

--
-- Name: COLUMN "sanctions"."deleted_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."sanctions"."deleted_at" IS 'NULL = actif ; non-NULL = dans la corbeille (soft delete)';


--
-- Name: sanctions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."sanctions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sanctions_id_seq" OWNER TO "postgres";

--
-- Name: sanctions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."sanctions_id_seq" OWNED BY "public"."sanctions"."id";


--
-- Name: service_membres; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."service_membres" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_membres_role_check" CHECK (("role" = ANY (ARRAY['chef'::"text", 'membre'::"text"])))
);


ALTER TABLE "public"."service_membres" OWNER TO "postgres";

--
-- Name: services; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "description" "text",
    "couleur" "text" DEFAULT '#6366f1'::"text",
    "built_in" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."services" OWNER TO "postgres";

--
-- Name: societe_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."societe_config" (
    "societe_id" "uuid" NOT NULL,
    "logo_url" "text",
    "couleur_primaire" "text" DEFAULT '#1F3864'::"text",
    "couleur_secondaire" "text" DEFAULT '#2E75B6'::"text",
    "couleur_accent" "text" DEFAULT '#C55A11'::"text",
    "police" "text" DEFAULT 'Calibri'::"text",
    "adresse" "text",
    "telephone" "text",
    "email" "text",
    "site_web" "text",
    "nif" "text",
    "rccm" "text",
    "mention_facture" "text",
    "mention_contrat" "text",
    "module_stock" boolean DEFAULT false NOT NULL,
    "module_grh" boolean DEFAULT false NOT NULL,
    "module_fiscalite" boolean DEFAULT false NOT NULL,
    "module_immobilisations" boolean DEFAULT false NOT NULL,
    "theme_custom" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "module_ia" boolean DEFAULT false NOT NULL,
    "module_multi_societes" boolean DEFAULT false NOT NULL,
    "format_facture" "text" DEFAULT 'FAC-{YYYY}-{NNN}'::"text" NOT NULL,
    "format_devis" "text" DEFAULT 'DEV-{YYYY}-{NNN}'::"text" NOT NULL,
    "compteur_facture" integer DEFAULT 1 NOT NULL,
    "compteur_devis" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."societe_config" OWNER TO "postgres";

--
-- Name: societe_identification; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."societe_identification" (
    "societe_id" "uuid" NOT NULL,
    "donnees" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."societe_identification" OWNER TO "postgres";

--
-- Name: societes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."societes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nom" "text" NOT NULL,
    "adresse" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "telephone" "text" DEFAULT ''::"text" NOT NULL,
    "nif" "text" DEFAULT ''::"text" NOT NULL,
    "rccm" "text" DEFAULT ''::"text" NOT NULL,
    "representant" "text" DEFAULT ''::"text" NOT NULL,
    "fonction_representant" "text" DEFAULT ''::"text" NOT NULL,
    "site_web" "text" DEFAULT ''::"text" NOT NULL,
    "logo_url" "text" DEFAULT ''::"text" NOT NULL,
    "slogan" "text" DEFAULT ''::"text" NOT NULL,
    "mention_legale_pied" "text" DEFAULT ''::"text" NOT NULL,
    "couleur_primaire" "text" DEFAULT '#1F3864'::"text" NOT NULL,
    "couleur_secondaire" "text" DEFAULT '#2E75B6'::"text" NOT NULL,
    "slug" "text",
    "statut" "text" DEFAULT 'active'::"text" NOT NULL,
    "plan" "text" DEFAULT 'starter'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "regime_fiscal" "public"."regime_fiscal_enum" DEFAULT 'IS'::"public"."regime_fiscal_enum",
    "secteur_activite" "public"."secteur_activite_enum" DEFAULT 'SE'::"public"."secteur_activite_enum",
    "assujetti_tva" boolean DEFAULT false NOT NULL,
    "set_impots" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "ca_annuel_estime" numeric(18,0) DEFAULT 0,
    CONSTRAINT "societes_plan_check" CHECK (("plan" = ANY (ARRAY['starter'::"text", 'pro'::"text", 'enterprise'::"text"]))),
    CONSTRAINT "societes_statut_check" CHECK (("statut" = ANY (ARRAY['active'::"text", 'suspendu'::"text", 'essai'::"text"])))
);


ALTER TABLE "public"."societes" OWNER TO "postgres";

--
-- Name: suppressed_emails; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."suppressed_emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."suppressed_emails" OWNER TO "postgres";

--
-- Name: taux_historique; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."taux_historique" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "date_effet" "date" NOT NULL,
    "tva" numeric DEFAULT 0.18 NOT NULL,
    "is_taux" numeric DEFAULT 0.27 NOT NULL,
    "imf_taux" numeric DEFAULT 0.01 NOT NULL,
    "imf_min" numeric DEFAULT 20000 NOT NULL,
    "patente_service" numeric DEFAULT 0.0075 NOT NULL,
    "patente_commerce" numeric DEFAULT 0.0055 NOT NULL,
    "cnss_sal" numeric DEFAULT 0.04 NOT NULL,
    "cnss_emp" numeric DEFAULT 0.175 NOT NULL,
    "amu_sal" numeric DEFAULT 0.05 NOT NULL,
    "amu_emp" numeric DEFAULT 0.05 NOT NULL,
    "activite_defaut" "text" DEFAULT 'service'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."taux_historique" OWNER TO "postgres";

--
-- Name: taux_historique_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."taux_historique_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."taux_historique_id_seq" OWNER TO "postgres";

--
-- Name: taux_historique_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."taux_historique_id_seq" OWNED BY "public"."taux_historique"."id";


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."transactions" (
    "id" bigint NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "annee" integer NOT NULL,
    "mois" integer NOT NULL,
    "date" "date" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "type" "text" NOT NULL,
    "montant" numeric DEFAULT 0 NOT NULL,
    "source" "text" DEFAULT 'manuelle'::"text" NOT NULL,
    "facture_id" bigint,
    "activite" "text",
    "piece_jointe" "text",
    "piece_jointe_nom" "text",
    "piece_jointe_type" "text",
    "fournisseur" "text",
    "auto" boolean DEFAULT false,
    "statut" "text" DEFAULT 'en_validation'::"text",
    "motif_rejet" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "activite_id" "uuid",
    "cree_par" "uuid" DEFAULT "auth"."uid"(),
    "compte" "text",
    "tresorerie" "text",
    "avec_tva" boolean
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";

--
-- Name: COLUMN "transactions"."deleted_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."transactions"."deleted_at" IS 'NULL = actif ; non-NULL = dans la corbeille (soft delete)';


--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."transactions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."transactions_id_seq" OWNER TO "postgres";

--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."transactions_id_seq" OWNED BY "public"."transactions"."id";


--
-- Name: user_activites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."user_activites" (
    "user_id" "uuid" NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "activite_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_activites" OWNER TO "postgres";

--
-- Name: user_custom_postes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."user_custom_postes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "poste_id" "uuid" NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_custom_postes" OWNER TO "postgres";

--
-- Name: user_feature_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."user_feature_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "feature" "public"."header_feature" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_feature_access" OWNER TO "postgres";

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "service" "text",
    CONSTRAINT "user_roles_service_check" CHECK ((("service" IS NULL) OR ("service" = ANY (ARRAY['compta'::"text", 'grh'::"text", 'transverse'::"text"]))))
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";

--
-- Name: COLUMN "user_roles"."service"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."user_roles"."service" IS 'Service informatif rattaché au rôle (compta/grh/transverse). La logique de permissions reste basée sur l''enum app_role.';


--
-- Name: user_societes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."user_societes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "societe_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_societes" OWNER TO "postgres";

--
-- Name: absences id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."absences" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."absences_id_seq"'::"regclass");


--
-- Name: articles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."articles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."articles_id_seq"'::"regclass");


--
-- Name: categories_stock id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories_stock" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."categories_stock_id_seq"'::"regclass");


--
-- Name: devis id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."devis" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."devis_id_seq"'::"regclass");


--
-- Name: ecritures_comptables id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ecritures_comptables" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ecritures_comptables_id_seq"'::"regclass");


--
-- Name: employes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."employes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."employes_id_seq"'::"regclass");


--
-- Name: emprunts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."emprunts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."emprunts_id_seq"'::"regclass");


--
-- Name: factures id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."factures" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."factures_id_seq"'::"regclass");


--
-- Name: fournisseurs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fournisseurs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fournisseurs_id_seq"'::"regclass");


--
-- Name: heures_sup id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."heures_sup" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."heures_sup_id_seq"'::"regclass");


--
-- Name: immobilisations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."immobilisations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."immobilisations_id_seq"'::"regclass");


--
-- Name: mouvements_stock id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mouvements_stock" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."mouvements_stock_id_seq"'::"regclass");


--
-- Name: params_annuels id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."params_annuels" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."params_annuels_id_seq"'::"regclass");


--
-- Name: primes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."primes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."primes_id_seq"'::"regclass");


--
-- Name: retenues id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."retenues" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."retenues_id_seq"'::"regclass");


--
-- Name: sanctions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sanctions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."sanctions_id_seq"'::"regclass");


--
-- Name: taux_historique id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."taux_historique" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."taux_historique_id_seq"'::"regclass");


--
-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."transactions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transactions_id_seq"'::"regclass");


--
-- Name: absences absences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_pkey" PRIMARY KEY ("id");


--
-- Name: activites activites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activites"
    ADD CONSTRAINT "activites_pkey" PRIMARY KEY ("id");


--
-- Name: alertes_lues alertes_lues_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."alertes_lues"
    ADD CONSTRAINT "alertes_lues_pkey" PRIMARY KEY ("id");


--
-- Name: alertes_lues alertes_lues_user_id_alerte_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."alertes_lues"
    ADD CONSTRAINT "alertes_lues_user_id_alerte_id_key" UNIQUE ("user_id", "alerte_id");


--
-- Name: app_state app_state_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."app_state"
    ADD CONSTRAINT "app_state_key_key" UNIQUE ("key");


--
-- Name: app_state app_state_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."app_state"
    ADD CONSTRAINT "app_state_pkey" PRIMARY KEY ("id");


--
-- Name: articles articles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_pkey" PRIMARY KEY ("id");


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");


--
-- Name: bulletins_paie bulletins_paie_employe_id_societe_id_mois_annee_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bulletins_paie"
    ADD CONSTRAINT "bulletins_paie_employe_id_societe_id_mois_annee_key" UNIQUE ("employe_id", "societe_id", "mois", "annee");


--
-- Name: bulletins_paie bulletins_paie_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bulletins_paie"
    ADD CONSTRAINT "bulletins_paie_pkey" PRIMARY KEY ("id");


--
-- Name: categories_stock categories_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories_stock"
    ADD CONSTRAINT "categories_stock_pkey" PRIMARY KEY ("id");


--
-- Name: compteurs_numerotation compteurs_numerotation_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."compteurs_numerotation"
    ADD CONSTRAINT "compteurs_numerotation_pkey" PRIMARY KEY ("societe_id", "type", "annee");


--
-- Name: cross_service_grants cross_service_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cross_service_grants"
    ADD CONSTRAINT "cross_service_grants_pkey" PRIMARY KEY ("id");


--
-- Name: custom_postes custom_postes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."custom_postes"
    ADD CONSTRAINT "custom_postes_pkey" PRIMARY KEY ("id");


--
-- Name: custom_services custom_services_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."custom_services"
    ADD CONSTRAINT "custom_services_pkey" PRIMARY KEY ("id");


--
-- Name: device_otps device_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."device_otps"
    ADD CONSTRAINT "device_otps_pkey" PRIMARY KEY ("id");


--
-- Name: device_sessions device_sessions_confirmation_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."device_sessions"
    ADD CONSTRAINT "device_sessions_confirmation_token_key" UNIQUE ("confirmation_token");


--
-- Name: device_sessions device_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."device_sessions"
    ADD CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: devis devis_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."devis"
    ADD CONSTRAINT "devis_pkey" PRIMARY KEY ("id");


--
-- Name: ecritures_comptables ecritures_comptables_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ecritures_comptables"
    ADD CONSTRAINT "ecritures_comptables_pkey" PRIMARY KEY ("id");


--
-- Name: email_send_log email_send_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."email_send_log"
    ADD CONSTRAINT "email_send_log_pkey" PRIMARY KEY ("id");


--
-- Name: email_send_state email_send_state_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."email_send_state"
    ADD CONSTRAINT "email_send_state_pkey" PRIMARY KEY ("id");


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."email_unsubscribe_tokens"
    ADD CONSTRAINT "email_unsubscribe_tokens_email_key" UNIQUE ("email");


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."email_unsubscribe_tokens"
    ADD CONSTRAINT "email_unsubscribe_tokens_pkey" PRIMARY KEY ("id");


--
-- Name: employes employes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."employes"
    ADD CONSTRAINT "employes_pkey" PRIMARY KEY ("id");


--
-- Name: emprunts emprunts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."emprunts"
    ADD CONSTRAINT "emprunts_pkey" PRIMARY KEY ("id");


--
-- Name: exercices exercices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."exercices"
    ADD CONSTRAINT "exercices_pkey" PRIMARY KEY ("societe_id", "annee");


--
-- Name: factures factures_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."factures"
    ADD CONSTRAINT "factures_pkey" PRIMARY KEY ("id");


--
-- Name: fiscal_delegations fiscal_delegations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fiscal_delegations"
    ADD CONSTRAINT "fiscal_delegations_pkey" PRIMARY KEY ("id");


--
-- Name: fiscal_delegations fiscal_delegations_societe_id_delegue_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fiscal_delegations"
    ADD CONSTRAINT "fiscal_delegations_societe_id_delegue_user_id_key" UNIQUE ("societe_id", "delegue_user_id");


--
-- Name: fournisseurs fournisseurs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fournisseurs"
    ADD CONSTRAINT "fournisseurs_pkey" PRIMARY KEY ("id");


--
-- Name: heures_sup heures_sup_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."heures_sup"
    ADD CONSTRAINT "heures_sup_pkey" PRIMARY KEY ("id");


--
-- Name: heures_sup heures_sup_societe_id_annee_mois_employe_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."heures_sup"
    ADD CONSTRAINT "heures_sup_societe_id_annee_mois_employe_id_key" UNIQUE ("societe_id", "annee", "mois", "employe_id");


--
-- Name: immobilisations immobilisations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."immobilisations"
    ADD CONSTRAINT "immobilisations_pkey" PRIMARY KEY ("id");


--
-- Name: informations_fiscales informations_fiscales_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."informations_fiscales"
    ADD CONSTRAINT "informations_fiscales_pkey" PRIMARY KEY ("societe_id", "annee");


--
-- Name: mfa_recovery_codes mfa_recovery_codes_code_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mfa_recovery_codes"
    ADD CONSTRAINT "mfa_recovery_codes_code_hash_key" UNIQUE ("code_hash");


--
-- Name: mfa_recovery_codes mfa_recovery_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mfa_recovery_codes"
    ADD CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id");


--
-- Name: mouvements_stock mouvements_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mouvements_stock"
    ADD CONSTRAINT "mouvements_stock_pkey" PRIMARY KEY ("id");


--
-- Name: params_annuels params_annuels_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."params_annuels"
    ADD CONSTRAINT "params_annuels_pkey" PRIMARY KEY ("id");


--
-- Name: params_annuels params_annuels_societe_id_annee_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."params_annuels"
    ADD CONSTRAINT "params_annuels_societe_id_annee_key" UNIQUE ("societe_id", "annee");


--
-- Name: permission_overrides permission_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."permission_overrides"
    ADD CONSTRAINT "permission_overrides_pkey" PRIMARY KEY ("id");


--
-- Name: permission_overrides permission_overrides_user_id_module_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."permission_overrides"
    ADD CONSTRAINT "permission_overrides_user_id_module_key" UNIQUE ("user_id", "module");


--
-- Name: portail_messages portail_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."portail_messages"
    ADD CONSTRAINT "portail_messages_pkey" PRIMARY KEY ("id");


--
-- Name: primes primes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."primes"
    ADD CONSTRAINT "primes_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");


--
-- Name: retenues retenues_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."retenues"
    ADD CONSTRAINT "retenues_pkey" PRIMARY KEY ("id");


--
-- Name: retenues retenues_societe_id_annee_mois_employe_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."retenues"
    ADD CONSTRAINT "retenues_societe_id_annee_mois_employe_id_key" UNIQUE ("societe_id", "annee", "mois", "employe_id");


--
-- Name: sanctions sanctions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sanctions"
    ADD CONSTRAINT "sanctions_pkey" PRIMARY KEY ("id");


--
-- Name: service_membres service_membres_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."service_membres"
    ADD CONSTRAINT "service_membres_pkey" PRIMARY KEY ("id");


--
-- Name: service_membres service_membres_service_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."service_membres"
    ADD CONSTRAINT "service_membres_service_id_user_id_key" UNIQUE ("service_id", "user_id");


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");


--
-- Name: societe_config societe_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."societe_config"
    ADD CONSTRAINT "societe_config_pkey" PRIMARY KEY ("societe_id");


--
-- Name: societe_identification societe_identification_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."societe_identification"
    ADD CONSTRAINT "societe_identification_pkey" PRIMARY KEY ("societe_id");


--
-- Name: societes societes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."societes"
    ADD CONSTRAINT "societes_pkey" PRIMARY KEY ("id");


--
-- Name: suppressed_emails suppressed_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."suppressed_emails"
    ADD CONSTRAINT "suppressed_emails_pkey" PRIMARY KEY ("id");


--
-- Name: taux_historique taux_historique_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."taux_historique"
    ADD CONSTRAINT "taux_historique_pkey" PRIMARY KEY ("id");


--
-- Name: taux_historique taux_historique_societe_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."taux_historique"
    ADD CONSTRAINT "taux_historique_societe_date_key" UNIQUE ("societe_id", "date_effet");


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");


--
-- Name: user_activites user_activites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_activites"
    ADD CONSTRAINT "user_activites_pkey" PRIMARY KEY ("user_id", "activite_id");


--
-- Name: user_custom_postes user_custom_postes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_custom_postes"
    ADD CONSTRAINT "user_custom_postes_pkey" PRIMARY KEY ("id");


--
-- Name: user_feature_access user_feature_access_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_feature_access"
    ADD CONSTRAINT "user_feature_access_pkey" PRIMARY KEY ("id");


--
-- Name: user_feature_access user_feature_access_user_id_feature_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_feature_access"
    ADD CONSTRAINT "user_feature_access_user_id_feature_key" UNIQUE ("user_id", "feature");


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");


--
-- Name: user_societes user_societes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_societes"
    ADD CONSTRAINT "user_societes_pkey" PRIMARY KEY ("id");


--
-- Name: user_societes user_societes_user_id_societe_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_societes"
    ADD CONSTRAINT "user_societes_user_id_societe_id_key" UNIQUE ("user_id", "societe_id");


--
-- Name: articles_activite_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "articles_activite_id_idx" ON "public"."articles" USING "btree" ("activite_id");


--
-- Name: bulletins_employe_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bulletins_employe_user_idx" ON "public"."bulletins_paie" USING "btree" ("employe_user_id", "societe_id");


--
-- Name: bulletins_societe_periode_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bulletins_societe_periode_idx" ON "public"."bulletins_paie" USING "btree" ("societe_id", "annee" DESC, "mois" DESC);


--
-- Name: custom_postes_service_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "custom_postes_service_id_idx" ON "public"."custom_postes" USING "btree" ("service_id");


--
-- Name: custom_services_societe_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "custom_services_societe_id_idx" ON "public"."custom_services" USING "btree" ("societe_id");


--
-- Name: device_otps_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "device_otps_user_idx" ON "public"."device_otps" USING "btree" ("user_id", "expires_at" DESC);


--
-- Name: devis_activite_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "devis_activite_id_idx" ON "public"."devis" USING "btree" ("activite_id");


--
-- Name: ecritures_activite_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ecritures_activite_id_idx" ON "public"."ecritures_comptables" USING "btree" ("activite_id");


--
-- Name: ecritures_bulletin_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ecritures_bulletin_id_idx" ON "public"."ecritures_comptables" USING "btree" ("bulletin_id");


--
-- Name: ecritures_cree_par_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ecritures_cree_par_idx" ON "public"."ecritures_comptables" USING "btree" ("cree_par");


--
-- Name: ecritures_facture_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ecritures_facture_id_idx" ON "public"."ecritures_comptables" USING "btree" ("facture_id");


--
-- Name: ecritures_piece_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ecritures_piece_unique" ON "public"."ecritures_comptables" USING "btree" ("societe_id", "numero_piece", COALESCE("activite_id", '00000000-0000-0000-0000-000000000000'::"uuid"));


--
-- Name: ecritures_valide_par_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ecritures_valide_par_idx" ON "public"."ecritures_comptables" USING "btree" ("valide_par");


--
-- Name: email_unsubscribe_tokens_token_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "email_unsubscribe_tokens_token_key" ON "public"."email_unsubscribe_tokens" USING "btree" ("token");


--
-- Name: employes_activite_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "employes_activite_id_idx" ON "public"."employes" USING "btree" ("activite_id");


--
-- Name: employes_societe_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "employes_societe_idx" ON "public"."employes" USING "btree" ("societe_id");


--
-- Name: employes_user_societe_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "employes_user_societe_idx" ON "public"."employes" USING "btree" ("user_id", "societe_id") WHERE ("user_id" IS NOT NULL);


--
-- Name: emprunts_societe_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "emprunts_societe_idx" ON "public"."emprunts" USING "btree" ("societe_id");


--
-- Name: factures_activite_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "factures_activite_id_idx" ON "public"."factures" USING "btree" ("activite_id");


--
-- Name: fiscal_delegations_delegue_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "fiscal_delegations_delegue_idx" ON "public"."fiscal_delegations" USING "btree" ("delegue_user_id", "is_active");


--
-- Name: fiscal_delegations_granted_by_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "fiscal_delegations_granted_by_idx" ON "public"."fiscal_delegations" USING "btree" ("granted_by");


--
-- Name: fiscal_delegations_societe_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "fiscal_delegations_societe_idx" ON "public"."fiscal_delegations" USING "btree" ("societe_id", "is_active");


--
-- Name: idx_absences_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_absences_deleted_at" ON "public"."absences" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_absences_societe_periode; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_absences_societe_periode" ON "public"."absences" USING "btree" ("societe_id", "annee", "mois");


--
-- Name: idx_activites_societe; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_activites_societe" ON "public"."activites" USING "btree" ("societe_id");


--
-- Name: idx_alertes_lues_societe; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_alertes_lues_societe" ON "public"."alertes_lues" USING "btree" ("societe_id");


--
-- Name: idx_alertes_lues_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_alertes_lues_user" ON "public"."alertes_lues" USING "btree" ("user_id");


--
-- Name: idx_articles_activite; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_articles_activite" ON "public"."articles" USING "btree" ("societe_id", "activite_id");


--
-- Name: idx_articles_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_articles_deleted_at" ON "public"."articles" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_articles_societe; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_articles_societe" ON "public"."articles" USING "btree" ("societe_id");


--
-- Name: idx_audit_log_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_log_created_at" ON "public"."audit_log" USING "btree" ("created_at" DESC);


--
-- Name: idx_audit_log_societe_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_log_societe_created" ON "public"."audit_log" USING "btree" ("societe_id", "created_at" DESC);


--
-- Name: idx_audit_log_societe_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_log_societe_id" ON "public"."audit_log" USING "btree" ("societe_id");


--
-- Name: idx_audit_log_table; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_log_table" ON "public"."audit_log" USING "btree" ("table_name");


--
-- Name: idx_audit_log_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_log_user_id" ON "public"."audit_log" USING "btree" ("user_id");


--
-- Name: idx_categories_stock_societe; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_stock_societe" ON "public"."categories_stock" USING "btree" ("societe_id");


--
-- Name: idx_cross_grants_user_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cross_grants_user_active" ON "public"."cross_service_grants" USING "btree" ("user_id", "service", "expires_at");


--
-- Name: idx_device_sessions_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_device_sessions_token" ON "public"."device_sessions" USING "btree" ("confirmation_token") WHERE ("confirmation_token" IS NOT NULL);


--
-- Name: idx_device_sessions_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_device_sessions_user" ON "public"."device_sessions" USING "btree" ("user_id", "status", "last_seen_at");


--
-- Name: idx_devis_activite; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_devis_activite" ON "public"."devis" USING "btree" ("societe_id", "activite_id");


--
-- Name: idx_devis_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_devis_deleted_at" ON "public"."devis" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_devis_societe_periode; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_devis_societe_periode" ON "public"."devis" USING "btree" ("societe_id", "annee", "mois");


--
-- Name: idx_ecritures_activite; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ecritures_activite" ON "public"."ecritures_comptables" USING "btree" ("societe_id", "activite_id");


--
-- Name: idx_ecritures_journal; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ecritures_journal" ON "public"."ecritures_comptables" USING "btree" ("societe_id", "journal");


--
-- Name: idx_ecritures_societe_mois; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ecritures_societe_mois" ON "public"."ecritures_comptables" USING "btree" ("societe_id", "annee", "mois");


--
-- Name: idx_ecritures_statut; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ecritures_statut" ON "public"."ecritures_comptables" USING "btree" ("societe_id", "statut");


--
-- Name: idx_employes_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_employes_deleted_at" ON "public"."employes" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_employes_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_employes_user" ON "public"."employes" USING "btree" ("user_id");


--
-- Name: idx_factures_activite; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_factures_activite" ON "public"."factures" USING "btree" ("societe_id", "activite_id");


--
-- Name: idx_factures_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_factures_deleted_at" ON "public"."factures" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_factures_societe_periode; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_factures_societe_periode" ON "public"."factures" USING "btree" ("societe_id", "annee", "mois");


--
-- Name: idx_fournisseurs_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fournisseurs_deleted_at" ON "public"."fournisseurs" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_fournisseurs_societe; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fournisseurs_societe" ON "public"."fournisseurs" USING "btree" ("societe_id");


--
-- Name: idx_immo_activite; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_immo_activite" ON "public"."immobilisations" USING "btree" ("societe_id", "activite_id");


--
-- Name: idx_immobilisations_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_immobilisations_deleted_at" ON "public"."immobilisations" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_immobilisations_societe; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_immobilisations_societe" ON "public"."immobilisations" USING "btree" ("societe_id");


--
-- Name: idx_mfa_recovery_codes_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_mfa_recovery_codes_user" ON "public"."mfa_recovery_codes" USING "btree" ("user_id") WHERE ("used_at" IS NULL);


--
-- Name: idx_mouvements_societe_periode; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_mouvements_societe_periode" ON "public"."mouvements_stock" USING "btree" ("societe_id", "annee", "mois");


--
-- Name: idx_mouvstock_activite; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_mouvstock_activite" ON "public"."mouvements_stock" USING "btree" ("societe_id", "activite_id");


--
-- Name: idx_primes_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_primes_deleted_at" ON "public"."primes" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_primes_societe_periode; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_primes_societe_periode" ON "public"."primes" USING "btree" ("societe_id", "annee", "mois");


--
-- Name: idx_sanctions_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sanctions_deleted_at" ON "public"."sanctions" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_sanctions_societe; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sanctions_societe" ON "public"."sanctions" USING "btree" ("societe_id");


--
-- Name: idx_service_membres_service_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_service_membres_service_id" ON "public"."service_membres" USING "btree" ("service_id");


--
-- Name: idx_service_membres_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_service_membres_user_id" ON "public"."service_membres" USING "btree" ("user_id");


--
-- Name: idx_services_societe_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_services_societe_id" ON "public"."services" USING "btree" ("societe_id");


--
-- Name: idx_transactions_activite; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_transactions_activite" ON "public"."transactions" USING "btree" ("societe_id", "activite_id");


--
-- Name: idx_transactions_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_transactions_deleted_at" ON "public"."transactions" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_transactions_societe_periode; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_transactions_societe_periode" ON "public"."transactions" USING "btree" ("societe_id", "annee", "mois");


--
-- Name: immobilisations_activite_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "immobilisations_activite_id_idx" ON "public"."immobilisations" USING "btree" ("activite_id");


--
-- Name: mouvements_stock_activite_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "mouvements_stock_activite_id_idx" ON "public"."mouvements_stock" USING "btree" ("activite_id");


--
-- Name: portail_messages_employe_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "portail_messages_employe_idx" ON "public"."portail_messages" USING "btree" ("employe_user_id", "societe_id", "created_at" DESC);


--
-- Name: portail_messages_societe_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "portail_messages_societe_id_idx" ON "public"."portail_messages" USING "btree" ("societe_id");


--
-- Name: retenues_societe_annee_mois_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "retenues_societe_annee_mois_idx" ON "public"."retenues" USING "btree" ("societe_id", "annee", "mois");


--
-- Name: sanctions_societe_employe_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sanctions_societe_employe_idx" ON "public"."sanctions" USING "btree" ("societe_id", "employe_id");


--
-- Name: societes_slug_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "societes_slug_unique" ON "public"."societes" USING "btree" ("slug") WHERE ("slug" IS NOT NULL);


--
-- Name: transactions_activite_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "transactions_activite_id_idx" ON "public"."transactions" USING "btree" ("activite_id");


--
-- Name: user_activites_user_societe_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "user_activites_user_societe_idx" ON "public"."user_activites" USING "btree" ("user_id", "societe_id");


--
-- Name: user_custom_postes_poste_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "user_custom_postes_poste_id_idx" ON "public"."user_custom_postes" USING "btree" ("poste_id");


--
-- Name: user_custom_postes_societe_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "user_custom_postes_societe_id_idx" ON "public"."user_custom_postes" USING "btree" ("societe_id");


--
-- Name: user_societes_societe_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "user_societes_societe_id_idx" ON "public"."user_societes" USING "btree" ("societe_id");


--
-- Name: app_state audit_app_state; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "audit_app_state" AFTER INSERT OR DELETE OR UPDATE ON "public"."app_state" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: profiles audit_profiles; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "audit_profiles" AFTER INSERT OR DELETE OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: user_roles audit_user_roles; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "audit_user_roles" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: user_societes audit_user_societes; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "audit_user_societes" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_societes" FOR EACH ROW EXECUTE FUNCTION "public"."audit_user_societes"();


--
-- Name: retenues retenues_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "retenues_updated_at" BEFORE UPDATE ON "public"."retenues" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();


--
-- Name: sanctions sanctions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "sanctions_updated_at" BEFORE UPDATE ON "public"."sanctions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();


--
-- Name: services tg_services_prevent_builtin_delete; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "tg_services_prevent_builtin_delete" BEFORE DELETE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_builtin_service_delete"();


--
-- Name: services tg_services_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "tg_services_updated_at" BEFORE UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();


--
-- Name: transactions transactions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "transactions_updated_at" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();


--
-- Name: absences trg_absences_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_absences_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."absences" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: absences trg_absences_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_absences_updated_at" BEFORE UPDATE ON "public"."absences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: articles trg_articles_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_articles_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."articles" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: articles trg_articles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_articles_updated_at" BEFORE UPDATE ON "public"."articles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: user_roles trg_bloquer_role_super_admin; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_bloquer_role_super_admin" BEFORE INSERT OR UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."bloquer_role_super_admin"();


--
-- Name: categories_stock trg_categories_stock_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_categories_stock_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."categories_stock" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: categories_stock trg_categories_stock_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_categories_stock_updated_at" BEFORE UPDATE ON "public"."categories_stock" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: societes trg_create_societe_config; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_create_societe_config" AFTER INSERT ON "public"."societes" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_societe"();


--
-- Name: device_sessions trg_device_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_device_sessions_updated_at" BEFORE UPDATE ON "public"."device_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: devis trg_devis_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_devis_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."devis" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: devis trg_devis_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_devis_updated_at" BEFORE UPDATE ON "public"."devis" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: ecritures_comptables trg_ecritures_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_ecritures_updated_at" BEFORE UPDATE ON "public"."ecritures_comptables" FOR EACH ROW EXECUTE FUNCTION "public"."update_ecritures_updated_at"();


--
-- Name: employes trg_employes_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_employes_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."employes" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: employes trg_employes_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_employes_updated_at" BEFORE UPDATE ON "public"."employes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: ecritures_comptables trg_exercice_cloture; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_exercice_cloture" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ecritures_comptables" FOR EACH ROW EXECUTE FUNCTION "public"."interdire_exercice_cloture"();


--
-- Name: factures trg_exercice_cloture; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_exercice_cloture" BEFORE INSERT OR DELETE OR UPDATE ON "public"."factures" FOR EACH ROW EXECUTE FUNCTION "public"."interdire_exercice_cloture"();


--
-- Name: transactions trg_exercice_cloture; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_exercice_cloture" BEFORE INSERT OR DELETE OR UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."interdire_exercice_cloture"();


--
-- Name: exercices trg_exercices_reouverture; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_exercices_reouverture" BEFORE UPDATE ON "public"."exercices" FOR EACH ROW EXECUTE FUNCTION "public"."controle_reouverture_exercice"();


--
-- Name: factures trg_factures_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_factures_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."factures" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: factures trg_factures_encaissement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_factures_encaissement" BEFORE UPDATE ON "public"."factures" FOR EACH ROW EXECUTE FUNCTION "public"."interdire_encaissement_non_validee"();


--
-- Name: factures trg_factures_suppression; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_factures_suppression" BEFORE DELETE OR UPDATE ON "public"."factures" FOR EACH ROW EXECUTE FUNCTION "public"."interdire_suppression_facture_engagee"();


--
-- Name: factures trg_factures_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_factures_updated_at" BEFORE UPDATE ON "public"."factures" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: fournisseurs trg_fournisseurs_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_fournisseurs_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."fournisseurs" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: fournisseurs trg_fournisseurs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_fournisseurs_updated_at" BEFORE UPDATE ON "public"."fournisseurs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: heures_sup trg_heures_sup_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_heures_sup_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."heures_sup" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: heures_sup trg_heures_sup_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_heures_sup_updated_at" BEFORE UPDATE ON "public"."heures_sup" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: immobilisations trg_immobilisations_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_immobilisations_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."immobilisations" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: immobilisations trg_immobilisations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_immobilisations_updated_at" BEFORE UPDATE ON "public"."immobilisations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: mouvements_stock trg_mouvements_stock_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_mouvements_stock_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."mouvements_stock" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: mouvements_stock trg_mouvements_stock_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_mouvements_stock_updated_at" BEFORE UPDATE ON "public"."mouvements_stock" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: absences trg_notify_absences_ins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_notify_absences_ins" AFTER INSERT ON "public"."absences" FOR EACH ROW EXECUTE FUNCTION "public"."notify_validation_insert"('statut_validation', 'absence');


--
-- Name: absences trg_notify_absences_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_notify_absences_upd" AFTER UPDATE ON "public"."absences" FOR EACH ROW EXECUTE FUNCTION "public"."notify_validation_change"('statut_validation', 'absence');


--
-- Name: employes trg_notify_employes_ins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_notify_employes_ins" AFTER INSERT ON "public"."employes" FOR EACH ROW EXECUTE FUNCTION "public"."notify_validation_insert"('statut_validation', 'employe');


--
-- Name: employes trg_notify_employes_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_notify_employes_upd" AFTER UPDATE ON "public"."employes" FOR EACH ROW EXECUTE FUNCTION "public"."notify_validation_change"('statut_validation', 'employe');


--
-- Name: factures trg_notify_factures_ins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_notify_factures_ins" AFTER INSERT ON "public"."factures" FOR EACH ROW EXECUTE FUNCTION "public"."notify_validation_insert"('statut_validation', 'facture');


--
-- Name: factures trg_notify_factures_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_notify_factures_upd" AFTER UPDATE ON "public"."factures" FOR EACH ROW EXECUTE FUNCTION "public"."notify_validation_change"('statut_validation', 'facture');


--
-- Name: heures_sup trg_notify_heures_sup_ins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_notify_heures_sup_ins" AFTER INSERT ON "public"."heures_sup" FOR EACH ROW EXECUTE FUNCTION "public"."notify_validation_insert"('statut_validation', 'heures_sup');


--
-- Name: heures_sup trg_notify_heures_sup_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_notify_heures_sup_upd" AFTER UPDATE ON "public"."heures_sup" FOR EACH ROW EXECUTE FUNCTION "public"."notify_validation_change"('statut_validation', 'heures_sup');


--
-- Name: primes trg_notify_primes_ins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_notify_primes_ins" AFTER INSERT ON "public"."primes" FOR EACH ROW EXECUTE FUNCTION "public"."notify_validation_insert"('statut_validation', 'prime');


--
-- Name: primes trg_notify_primes_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_notify_primes_upd" AFTER UPDATE ON "public"."primes" FOR EACH ROW EXECUTE FUNCTION "public"."notify_validation_change"('statut_validation', 'prime');


--
-- Name: sanctions trg_notify_sanctions_ins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_notify_sanctions_ins" AFTER INSERT ON "public"."sanctions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_validation_insert"('statut_validation', 'sanction');


--
-- Name: sanctions trg_notify_sanctions_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_notify_sanctions_upd" AFTER UPDATE ON "public"."sanctions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_validation_change"('statut_validation', 'sanction');


--
-- Name: transactions trg_notify_transactions_ins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_notify_transactions_ins" AFTER INSERT ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_validation_insert"('statut', 'transaction');


--
-- Name: transactions trg_notify_transactions_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_notify_transactions_upd" AFTER UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_validation_change"('statut', 'transaction');


--
-- Name: params_annuels trg_params_annuels_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_params_annuels_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."params_annuels" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: params_annuels trg_params_annuels_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_params_annuels_updated_at" BEFORE UPDATE ON "public"."params_annuels" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: permission_overrides trg_permission_overrides_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_permission_overrides_updated" BEFORE UPDATE ON "public"."permission_overrides" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: primes trg_primes_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_primes_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."primes" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: primes trg_primes_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_primes_updated_at" BEFORE UPDATE ON "public"."primes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: absences trg_quatre_yeux; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_quatre_yeux" BEFORE UPDATE ON "public"."absences" FOR EACH ROW EXECUTE FUNCTION "public"."controle_quatre_yeux"('statut_validation', 'valide');


--
-- Name: ecritures_comptables trg_quatre_yeux; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_quatre_yeux" BEFORE UPDATE ON "public"."ecritures_comptables" FOR EACH ROW EXECUTE FUNCTION "public"."controle_quatre_yeux"('statut', 'valide');


--
-- Name: employes trg_quatre_yeux; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_quatre_yeux" BEFORE UPDATE ON "public"."employes" FOR EACH ROW EXECUTE FUNCTION "public"."controle_quatre_yeux"('statut_validation', 'valide');


--
-- Name: factures trg_quatre_yeux; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_quatre_yeux" BEFORE UPDATE ON "public"."factures" FOR EACH ROW EXECUTE FUNCTION "public"."controle_quatre_yeux"('statut_validation', 'valide');


--
-- Name: heures_sup trg_quatre_yeux; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_quatre_yeux" BEFORE UPDATE ON "public"."heures_sup" FOR EACH ROW EXECUTE FUNCTION "public"."controle_quatre_yeux"('statut_validation', 'valide');


--
-- Name: primes trg_quatre_yeux; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_quatre_yeux" BEFORE UPDATE ON "public"."primes" FOR EACH ROW EXECUTE FUNCTION "public"."controle_quatre_yeux"('statut_validation', 'valide');


--
-- Name: sanctions trg_quatre_yeux; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_quatre_yeux" BEFORE UPDATE ON "public"."sanctions" FOR EACH ROW EXECUTE FUNCTION "public"."controle_quatre_yeux"('statut_validation', 'valide');


--
-- Name: transactions trg_quatre_yeux; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_quatre_yeux" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."controle_quatre_yeux"('statut', 'valide');


--
-- Name: retenues trg_retenues_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_retenues_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."retenues" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: retenues trg_retenues_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_retenues_updated_at" BEFORE UPDATE ON "public"."retenues" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: sanctions trg_sanctions_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_sanctions_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."sanctions" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: sanctions trg_sanctions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_sanctions_updated_at" BEFORE UPDATE ON "public"."sanctions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: societe_config trg_societe_config_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_societe_config_updated" BEFORE UPDATE ON "public"."societe_config" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: societes trg_societes_recalc_set_impots; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_societes_recalc_set_impots" BEFORE UPDATE ON "public"."societes" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recalc_set_impots"();


--
-- Name: taux_historique trg_taux_historique_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_taux_historique_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."taux_historique" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: taux_historique trg_taux_historique_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_taux_historique_updated_at" BEFORE UPDATE ON "public"."taux_historique" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: transactions trg_transactions_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_transactions_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_fn"();


--
-- Name: transactions trg_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_transactions_updated_at" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: societe_config trg_verrou_apparence_societe; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_verrou_apparence_societe" BEFORE UPDATE ON "public"."societe_config" FOR EACH ROW EXECUTE FUNCTION "public"."verrou_apparence_societe"();


--
-- Name: app_state update_app_state_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_app_state_updated_at" BEFORE UPDATE ON "public"."app_state" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: cross_service_grants validate_grant_expiration_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "validate_grant_expiration_trigger" BEFORE INSERT OR UPDATE ON "public"."cross_service_grants" FOR EACH ROW EXECUTE FUNCTION "public"."validate_grant_expiration"();


--
-- Name: absences absences_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: activites activites_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activites"
    ADD CONSTRAINT "activites_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: articles articles_activite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_activite_id_fkey" FOREIGN KEY ("activite_id") REFERENCES "public"."activites"("id") ON DELETE SET NULL;


--
-- Name: articles articles_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: audit_log audit_log_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE SET NULL;


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: bulletins_paie bulletins_paie_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bulletins_paie"
    ADD CONSTRAINT "bulletins_paie_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: categories_stock categories_stock_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories_stock"
    ADD CONSTRAINT "categories_stock_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: compteurs_numerotation compteurs_numerotation_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."compteurs_numerotation"
    ADD CONSTRAINT "compteurs_numerotation_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: custom_postes custom_postes_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."custom_postes"
    ADD CONSTRAINT "custom_postes_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."custom_services"("id") ON DELETE CASCADE;


--
-- Name: custom_services custom_services_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."custom_services"
    ADD CONSTRAINT "custom_services_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: device_sessions device_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."device_sessions"
    ADD CONSTRAINT "device_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: devis devis_activite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."devis"
    ADD CONSTRAINT "devis_activite_id_fkey" FOREIGN KEY ("activite_id") REFERENCES "public"."activites"("id") ON DELETE SET NULL;


--
-- Name: devis devis_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."devis"
    ADD CONSTRAINT "devis_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: ecritures_comptables ecritures_comptables_activite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ecritures_comptables"
    ADD CONSTRAINT "ecritures_comptables_activite_id_fkey" FOREIGN KEY ("activite_id") REFERENCES "public"."activites"("id") ON DELETE SET NULL;


--
-- Name: ecritures_comptables ecritures_comptables_bulletin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ecritures_comptables"
    ADD CONSTRAINT "ecritures_comptables_bulletin_id_fkey" FOREIGN KEY ("bulletin_id") REFERENCES "public"."bulletins_paie"("id") ON DELETE SET NULL;


--
-- Name: ecritures_comptables ecritures_comptables_cree_par_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ecritures_comptables"
    ADD CONSTRAINT "ecritures_comptables_cree_par_fkey" FOREIGN KEY ("cree_par") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: ecritures_comptables ecritures_comptables_facture_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ecritures_comptables"
    ADD CONSTRAINT "ecritures_comptables_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "public"."factures"("id") ON DELETE SET NULL;


--
-- Name: ecritures_comptables ecritures_comptables_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ecritures_comptables"
    ADD CONSTRAINT "ecritures_comptables_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: ecritures_comptables ecritures_comptables_valide_par_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ecritures_comptables"
    ADD CONSTRAINT "ecritures_comptables_valide_par_fkey" FOREIGN KEY ("valide_par") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: employes employes_activite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."employes"
    ADD CONSTRAINT "employes_activite_id_fkey" FOREIGN KEY ("activite_id") REFERENCES "public"."activites"("id") ON DELETE SET NULL;


--
-- Name: employes employes_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."employes"
    ADD CONSTRAINT "employes_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: emprunts emprunts_activite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."emprunts"
    ADD CONSTRAINT "emprunts_activite_id_fkey" FOREIGN KEY ("activite_id") REFERENCES "public"."activites"("id") ON DELETE SET NULL;


--
-- Name: emprunts emprunts_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."emprunts"
    ADD CONSTRAINT "emprunts_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: exercices exercices_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."exercices"
    ADD CONSTRAINT "exercices_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: factures factures_activite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."factures"
    ADD CONSTRAINT "factures_activite_id_fkey" FOREIGN KEY ("activite_id") REFERENCES "public"."activites"("id") ON DELETE SET NULL;


--
-- Name: factures factures_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."factures"
    ADD CONSTRAINT "factures_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: fiscal_delegations fiscal_delegations_delegue_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fiscal_delegations"
    ADD CONSTRAINT "fiscal_delegations_delegue_user_id_fkey" FOREIGN KEY ("delegue_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: fiscal_delegations fiscal_delegations_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fiscal_delegations"
    ADD CONSTRAINT "fiscal_delegations_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id");


--
-- Name: fiscal_delegations fiscal_delegations_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fiscal_delegations"
    ADD CONSTRAINT "fiscal_delegations_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: fournisseurs fournisseurs_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fournisseurs"
    ADD CONSTRAINT "fournisseurs_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: heures_sup heures_sup_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."heures_sup"
    ADD CONSTRAINT "heures_sup_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: immobilisations immobilisations_activite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."immobilisations"
    ADD CONSTRAINT "immobilisations_activite_id_fkey" FOREIGN KEY ("activite_id") REFERENCES "public"."activites"("id") ON DELETE SET NULL;


--
-- Name: immobilisations immobilisations_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."immobilisations"
    ADD CONSTRAINT "immobilisations_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: informations_fiscales informations_fiscales_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."informations_fiscales"
    ADD CONSTRAINT "informations_fiscales_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: mouvements_stock mouvements_stock_activite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mouvements_stock"
    ADD CONSTRAINT "mouvements_stock_activite_id_fkey" FOREIGN KEY ("activite_id") REFERENCES "public"."activites"("id") ON DELETE SET NULL;


--
-- Name: mouvements_stock mouvements_stock_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mouvements_stock"
    ADD CONSTRAINT "mouvements_stock_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: params_annuels params_annuels_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."params_annuels"
    ADD CONSTRAINT "params_annuels_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: portail_messages portail_messages_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."portail_messages"
    ADD CONSTRAINT "portail_messages_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: primes primes_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."primes"
    ADD CONSTRAINT "primes_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: retenues retenues_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."retenues"
    ADD CONSTRAINT "retenues_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: sanctions sanctions_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sanctions"
    ADD CONSTRAINT "sanctions_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: service_membres service_membres_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."service_membres"
    ADD CONSTRAINT "service_membres_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;


--
-- Name: service_membres service_membres_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."service_membres"
    ADD CONSTRAINT "service_membres_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;


--
-- Name: services services_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: societe_config societe_config_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."societe_config"
    ADD CONSTRAINT "societe_config_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: societe_identification societe_identification_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."societe_identification"
    ADD CONSTRAINT "societe_identification_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: taux_historique taux_historique_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."taux_historique"
    ADD CONSTRAINT "taux_historique_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: transactions transactions_activite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_activite_id_fkey" FOREIGN KEY ("activite_id") REFERENCES "public"."activites"("id") ON DELETE SET NULL;


--
-- Name: transactions transactions_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: user_activites user_activites_activite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_activites"
    ADD CONSTRAINT "user_activites_activite_id_fkey" FOREIGN KEY ("activite_id") REFERENCES "public"."activites"("id") ON DELETE CASCADE;


--
-- Name: user_activites user_activites_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_activites"
    ADD CONSTRAINT "user_activites_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: user_activites user_activites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_activites"
    ADD CONSTRAINT "user_activites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_custom_postes user_custom_postes_poste_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_custom_postes"
    ADD CONSTRAINT "user_custom_postes_poste_id_fkey" FOREIGN KEY ("poste_id") REFERENCES "public"."custom_postes"("id") ON DELETE CASCADE;


--
-- Name: user_custom_postes user_custom_postes_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_custom_postes"
    ADD CONSTRAINT "user_custom_postes_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_societes user_societes_societe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_societes"
    ADD CONSTRAINT "user_societes_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "public"."societes"("id") ON DELETE CASCADE;


--
-- Name: profiles Admins can delete their users profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete their users profiles" ON "public"."profiles" FOR DELETE TO "authenticated" USING ("public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id"));


--
-- Name: profiles Admins can update their users profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update their users profiles" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id")) WITH CHECK ("public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id"));


--
-- Name: user_roles Admins can view roles of their users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view roles of their users" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ("public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id"));


--
-- Name: profiles Admins can view their users profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view their users profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id"));


--
-- Name: user_feature_access Admins delete features; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins delete features" ON "public"."user_feature_access" FOR DELETE TO "authenticated" USING ("public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id"));


--
-- Name: permission_overrides Admins delete overrides; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins delete overrides" ON "public"."permission_overrides" FOR DELETE TO "authenticated" USING ("public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id"));


--
-- Name: user_feature_access Admins insert features; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins insert features" ON "public"."user_feature_access" FOR INSERT TO "authenticated" WITH CHECK ("public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id"));


--
-- Name: permission_overrides Admins insert overrides; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins insert overrides" ON "public"."permission_overrides" FOR INSERT TO "authenticated" WITH CHECK ("public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id"));


--
-- Name: cross_service_grants Admins manage grants - all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins manage grants - all" ON "public"."cross_service_grants" TO "authenticated" USING ("public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id")) WITH CHECK ("public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id"));


--
-- Name: user_feature_access Admins update features; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins update features" ON "public"."user_feature_access" FOR UPDATE TO "authenticated" USING ("public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id")) WITH CHECK ("public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id"));


--
-- Name: permission_overrides Admins update overrides; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins update overrides" ON "public"."permission_overrides" FOR UPDATE TO "authenticated" USING ("public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id")) WITH CHECK ("public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id"));


--
-- Name: app_state Authenticated users can view app_state; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can view app_state" ON "public"."app_state" FOR SELECT TO "authenticated" USING (true);


--
-- Name: app_state Chefs and admin can delete app_state; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Chefs and admin can delete app_state" ON "public"."app_state" FOR DELETE TO "authenticated" USING (("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_chef_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_chef_grh"(( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: app_state Delete app_state by societe; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Delete app_state by societe" ON "public"."app_state" FOR DELETE TO "authenticated" USING (
CASE
    WHEN ("key" ~~ 's:%'::"text") THEN ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "public"."app_state_societe_id"("key")) AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_chef_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_chef_grh"(( SELECT "auth"."uid"() AS "uid"))))
    ELSE "public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid"))
END);


--
-- Name: societe_config Delete societe_config; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Delete societe_config" ON "public"."societe_config" FOR DELETE TO "authenticated" USING ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")));


--
-- Name: app_state Insert app_state by societe; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Insert app_state by societe" ON "public"."app_state" FOR INSERT TO "authenticated" WITH CHECK (
CASE
    WHEN ("key" ~~ 's:%'::"text") THEN ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "public"."app_state_societe_id"("key")) AND ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role") OR "public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'comptable'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'rh'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'saisie'::"public"."app_role")))
    ELSE "public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid"))
END);


--
-- Name: societe_config Insert societe_config; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Insert societe_config" ON "public"."societe_config" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")));


--
-- Name: app_state Service members can insert app_state; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service members can insert app_state" ON "public"."app_state" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role") OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'comptable'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'rh'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'saisie'::"public"."app_role")));


--
-- Name: app_state Service members can update app_state; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service members can update app_state" ON "public"."app_state" FOR UPDATE TO "authenticated" USING (("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role") OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'comptable'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'rh'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'saisie'::"public"."app_role")));


--
-- Name: app_state Update app_state by societe; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Update app_state by societe" ON "public"."app_state" FOR UPDATE TO "authenticated" USING (
CASE
    WHEN ("key" ~~ 's:%'::"text") THEN ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "public"."app_state_societe_id"("key")) AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_chef_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_chef_grh"(( SELECT "auth"."uid"() AS "uid"))))
    ELSE "public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid"))
END) WITH CHECK (
CASE
    WHEN ("key" ~~ 's:%'::"text") THEN ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "public"."app_state_societe_id"("key")) AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_chef_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_chef_grh"(( SELECT "auth"."uid"() AS "uid"))))
    ELSE "public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid"))
END);


--
-- Name: societe_config Update societe_config; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Update societe_config" ON "public"."societe_config" FOR UPDATE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")))) WITH CHECK (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id"))));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: cross_service_grants Users can view own grants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own grants" ON "public"."cross_service_grants" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: user_feature_access Users view own features; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users view own features" ON "public"."user_feature_access" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id")));


--
-- Name: permission_overrides Users view own overrides; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users view own overrides" ON "public"."permission_overrides" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."admin_gere_utilisateur"(( SELECT "auth"."uid"() AS "uid"), "user_id")));


--
-- Name: device_sessions Users view own sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users view own sessions" ON "public"."device_sessions" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: app_state View app_state by societe; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "View app_state by societe" ON "public"."app_state" FOR SELECT TO "authenticated" USING (
CASE
    WHEN ("key" ~~ 's:%'::"text") THEN "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "public"."app_state_societe_id"("key"))
    ELSE "public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid"))
END);


--
-- Name: societe_config View societe_config; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "View societe_config" ON "public"."societe_config" FOR SELECT TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")));


--
-- Name: absences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."absences" ENABLE ROW LEVEL SECURITY;

--
-- Name: absences absences_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "absences_delete" ON "public"."absences" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: absences absences_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "absences_insert" ON "public"."absences" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")) OR (("employe_id" = "public"."current_employe_id"(( SELECT "auth"."uid"() AS "uid"))) AND ("statut_validation" = 'en_validation'::"text")))));


--
-- Name: absences absences_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "absences_select" ON "public"."absences" FOR SELECT USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))) OR ("employe_id" = "public"."current_employe_id"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: absences absences_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "absences_update" ON "public"."absences" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: absences activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."absences" AS RESTRICTIVE TO "authenticated" USING ("public"."employe_id_autorise"(( SELECT "auth"."uid"() AS "uid"), "employe_id")) WITH CHECK ("public"."employe_id_autorise"(( SELECT "auth"."uid"() AS "uid"), "employe_id"));


--
-- Name: activites activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."activites" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "id"));


--
-- Name: articles activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."articles" AS RESTRICTIVE TO "authenticated" USING ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id")) WITH CHECK ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id"));


--
-- Name: bulletins_paie activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."bulletins_paie" AS RESTRICTIVE TO "authenticated" USING ("public"."employe_id_autorise"(( SELECT "auth"."uid"() AS "uid"), "employe_id")) WITH CHECK ("public"."employe_id_autorise"(( SELECT "auth"."uid"() AS "uid"), "employe_id"));


--
-- Name: devis activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."devis" AS RESTRICTIVE TO "authenticated" USING ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id")) WITH CHECK ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id"));


--
-- Name: ecritures_comptables activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."ecritures_comptables" AS RESTRICTIVE TO "authenticated" USING ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id")) WITH CHECK ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id"));


--
-- Name: employes activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."employes" AS RESTRICTIVE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."employe_autorise"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id", "repartition"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."employe_autorise"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id", "repartition")));


--
-- Name: emprunts activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."emprunts" AS RESTRICTIVE TO "authenticated" USING ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id")) WITH CHECK ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id"));


--
-- Name: factures activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."factures" AS RESTRICTIVE TO "authenticated" USING ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id")) WITH CHECK ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id"));


--
-- Name: heures_sup activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."heures_sup" AS RESTRICTIVE TO "authenticated" USING ("public"."employe_id_autorise"(( SELECT "auth"."uid"() AS "uid"), "employe_id")) WITH CHECK ("public"."employe_id_autorise"(( SELECT "auth"."uid"() AS "uid"), "employe_id"));


--
-- Name: immobilisations activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."immobilisations" AS RESTRICTIVE TO "authenticated" USING ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id")) WITH CHECK ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id"));


--
-- Name: mouvements_stock activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."mouvements_stock" AS RESTRICTIVE TO "authenticated" USING ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id")) WITH CHECK ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id"));


--
-- Name: primes activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."primes" AS RESTRICTIVE TO "authenticated" USING ("public"."employe_id_autorise"(( SELECT "auth"."uid"() AS "uid"), "employe_id")) WITH CHECK ("public"."employe_id_autorise"(( SELECT "auth"."uid"() AS "uid"), "employe_id"));


--
-- Name: retenues activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."retenues" AS RESTRICTIVE TO "authenticated" USING ("public"."employe_id_autorise"(( SELECT "auth"."uid"() AS "uid"), "employe_id")) WITH CHECK ("public"."employe_id_autorise"(( SELECT "auth"."uid"() AS "uid"), "employe_id"));


--
-- Name: sanctions activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."sanctions" AS RESTRICTIVE TO "authenticated" USING ("public"."employe_id_autorise"(( SELECT "auth"."uid"() AS "uid"), "employe_id")) WITH CHECK ("public"."employe_id_autorise"(( SELECT "auth"."uid"() AS "uid"), "employe_id"));


--
-- Name: transactions activite_restriction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activite_restriction" ON "public"."transactions" AS RESTRICTIVE TO "authenticated" USING ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id")) WITH CHECK ("public"."activite_autorisee"(( SELECT "auth"."uid"() AS "uid"), "societe_id", "activite_id"));


--
-- Name: activites; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."activites" ENABLE ROW LEVEL SECURITY;

--
-- Name: activites activites_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activites_select" ON "public"."activites" FOR SELECT TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")));


--
-- Name: activites activites_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activites_write" ON "public"."activites" TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")))) WITH CHECK (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id"))));


--
-- Name: alertes_lues; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."alertes_lues" ENABLE ROW LEVEL SECURITY;

--
-- Name: alertes_lues alertes_lues_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "alertes_lues_delete_own" ON "public"."alertes_lues" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


--
-- Name: alertes_lues alertes_lues_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "alertes_lues_insert_own" ON "public"."alertes_lues" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")));


--
-- Name: alertes_lues alertes_lues_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "alertes_lues_select_own" ON "public"."alertes_lues" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: app_state; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."app_state" ENABLE ROW LEVEL SECURITY;

--
-- Name: articles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."articles" ENABLE ROW LEVEL SECURITY;

--
-- Name: articles articles_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "articles_delete" ON "public"."articles" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: articles articles_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "articles_insert" ON "public"."articles" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: articles articles_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "articles_select" ON "public"."articles" FOR SELECT USING ("public"."est_personnel"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: articles articles_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "articles_update" ON "public"."articles" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "audit_log_insert" ON "public"."audit_log" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: audit_log audit_log_select_societe; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "audit_log_select_societe" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ((("societe_id" IS NOT NULL) AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: audit_log audit_log_select_super_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "audit_log_select_super_admin" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")));


--
-- Name: bulletins_paie bulletins_admin_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bulletins_admin_delete" ON "public"."bulletins_paie" FOR DELETE USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: bulletins_paie bulletins_admin_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bulletins_admin_insert" ON "public"."bulletins_paie" FOR INSERT WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: bulletins_paie bulletins_admin_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bulletins_admin_select" ON "public"."bulletins_paie" FOR SELECT USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid"))))));


--
-- Name: bulletins_paie bulletins_admin_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bulletins_admin_update" ON "public"."bulletins_paie" FOR UPDATE USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: bulletins_paie bulletins_employe_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bulletins_employe_select" ON "public"."bulletins_paie" FOR SELECT USING (("employe_user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: bulletins_paie; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."bulletins_paie" ENABLE ROW LEVEL SECURITY;

--
-- Name: categories_stock; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."categories_stock" ENABLE ROW LEVEL SECURITY;

--
-- Name: categories_stock categories_stock_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "categories_stock_delete" ON "public"."categories_stock" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: categories_stock categories_stock_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "categories_stock_insert" ON "public"."categories_stock" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: categories_stock categories_stock_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "categories_stock_select" ON "public"."categories_stock" FOR SELECT USING ("public"."est_personnel"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: categories_stock categories_stock_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "categories_stock_update" ON "public"."categories_stock" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: compteurs_numerotation; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."compteurs_numerotation" ENABLE ROW LEVEL SECURITY;

--
-- Name: compteurs_numerotation compteurs_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "compteurs_select" ON "public"."compteurs_numerotation" FOR SELECT TO "authenticated" USING ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: cross_service_grants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."cross_service_grants" ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_postes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."custom_postes" ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_postes custom_postes_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "custom_postes_all" ON "public"."custom_postes" TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."custom_services" "cs"
  WHERE (("cs"."id" = "custom_postes"."service_id") AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "cs"."societe_id")))))) WITH CHECK (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."custom_services" "cs"
  WHERE (("cs"."id" = "custom_postes"."service_id") AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "cs"."societe_id"))))));


--
-- Name: custom_services; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."custom_services" ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_services custom_services_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "custom_services_all" ON "public"."custom_services" TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id"))) WITH CHECK (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")));


--
-- Name: device_otps device_otp_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "device_otp_insert" ON "public"."device_otps" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: device_otps device_otp_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "device_otp_select" ON "public"."device_otps" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: device_otps device_otp_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "device_otp_update" ON "public"."device_otps" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: device_otps; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."device_otps" ENABLE ROW LEVEL SECURITY;

--
-- Name: device_sessions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."device_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: devis; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."devis" ENABLE ROW LEVEL SECURITY;

--
-- Name: devis devis_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "devis_delete" ON "public"."devis" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: devis devis_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "devis_insert" ON "public"."devis" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: devis devis_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "devis_select" ON "public"."devis" FOR SELECT USING ("public"."est_personnel"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: devis devis_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "devis_update" ON "public"."devis" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: ecritures_comptables; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ecritures_comptables" ENABLE ROW LEVEL SECURITY;

--
-- Name: ecritures_comptables ecritures_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ecritures_delete" ON "public"."ecritures_comptables" FOR DELETE USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid"))))));


--
-- Name: ecritures_comptables ecritures_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ecritures_insert" ON "public"."ecritures_comptables" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: ecritures_comptables ecritures_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ecritures_select" ON "public"."ecritures_comptables" FOR SELECT USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid"))))));


--
-- Name: ecritures_comptables ecritures_societe_access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ecritures_societe_access" ON "public"."ecritures_comptables" USING ("public"."est_personnel"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) WITH CHECK ("public"."est_personnel"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: ecritures_comptables ecritures_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ecritures_update" ON "public"."ecritures_comptables" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: email_send_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."email_send_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_send_state; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."email_send_state" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_unsubscribe_tokens; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."email_unsubscribe_tokens" ENABLE ROW LEVEL SECURITY;

--
-- Name: app_state employe_no_direct_app_state; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "employe_no_direct_app_state" ON "public"."app_state" AS RESTRICTIVE TO "authenticated" USING ((NOT (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("user_roles"."role" = 'employe'::"public"."app_role")))))) WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("user_roles"."role" = 'employe'::"public"."app_role"))))));


--
-- Name: employes employe_read_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "employe_read_own" ON "public"."employes" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: employes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."employes" ENABLE ROW LEVEL SECURITY;

--
-- Name: employes employes_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "employes_delete" ON "public"."employes" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: employes employes_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "employes_insert" ON "public"."employes" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: employes employes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "employes_select" ON "public"."employes" FOR SELECT USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: employes employes_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "employes_update" ON "public"."employes" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: emprunts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."emprunts" ENABLE ROW LEVEL SECURITY;

--
-- Name: emprunts emprunts_ecriture; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "emprunts_ecriture" ON "public"."emprunts" TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid"))))));


--
-- Name: emprunts emprunts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "emprunts_select" ON "public"."emprunts" FOR SELECT TO "authenticated" USING ("public"."est_personnel"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: exercices; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."exercices" ENABLE ROW LEVEL SECURITY;

--
-- Name: exercices exercices_ecriture; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "exercices_ecriture" ON "public"."exercices" TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_chef_compta"(( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_chef_compta"(( SELECT "auth"."uid"() AS "uid"))))));


--
-- Name: exercices exercices_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "exercices_select" ON "public"."exercices" FOR SELECT TO "authenticated" USING ("public"."est_personnel"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: factures; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."factures" ENABLE ROW LEVEL SECURITY;

--
-- Name: factures factures_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "factures_delete" ON "public"."factures" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: factures factures_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "factures_insert" ON "public"."factures" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: factures factures_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "factures_select" ON "public"."factures" FOR SELECT USING ("public"."est_personnel"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: factures factures_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "factures_update" ON "public"."factures" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: fiscal_delegations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."fiscal_delegations" ENABLE ROW LEVEL SECURITY;

--
-- Name: fiscal_delegations fiscal_delegations_admin_manage; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fiscal_delegations_admin_manage" ON "public"."fiscal_delegations" TO "authenticated" USING (("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id"))) WITH CHECK (("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")));


--
-- Name: fiscal_delegations fiscal_delegations_admin_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fiscal_delegations_admin_read" ON "public"."fiscal_delegations" FOR SELECT TO "authenticated" USING ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: fiscal_delegations fiscal_delegations_delegue_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fiscal_delegations_delegue_read" ON "public"."fiscal_delegations" FOR SELECT TO "authenticated" USING ((("delegue_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("is_active" = true)));


--
-- Name: fiscal_delegations fiscal_delegations_super_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fiscal_delegations_super_admin_all" ON "public"."fiscal_delegations" TO "authenticated" USING ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")));


--
-- Name: fournisseurs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."fournisseurs" ENABLE ROW LEVEL SECURITY;

--
-- Name: fournisseurs fournisseurs_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fournisseurs_delete" ON "public"."fournisseurs" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: fournisseurs fournisseurs_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fournisseurs_insert" ON "public"."fournisseurs" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: fournisseurs fournisseurs_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fournisseurs_select" ON "public"."fournisseurs" FOR SELECT USING ("public"."est_personnel"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: fournisseurs fournisseurs_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fournisseurs_update" ON "public"."fournisseurs" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: heures_sup; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."heures_sup" ENABLE ROW LEVEL SECURITY;

--
-- Name: heures_sup heures_sup_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "heures_sup_delete" ON "public"."heures_sup" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: heures_sup heures_sup_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "heures_sup_insert" ON "public"."heures_sup" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: heures_sup heures_sup_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "heures_sup_select" ON "public"."heures_sup" FOR SELECT USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))) OR ("employe_id" = "public"."current_employe_id"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: heures_sup heures_sup_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "heures_sup_update" ON "public"."heures_sup" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: immobilisations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."immobilisations" ENABLE ROW LEVEL SECURITY;

--
-- Name: immobilisations immobilisations_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "immobilisations_delete" ON "public"."immobilisations" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: immobilisations immobilisations_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "immobilisations_insert" ON "public"."immobilisations" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: immobilisations immobilisations_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "immobilisations_select" ON "public"."immobilisations" FOR SELECT USING ("public"."est_personnel"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: immobilisations immobilisations_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "immobilisations_update" ON "public"."immobilisations" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: informations_fiscales; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."informations_fiscales" ENABLE ROW LEVEL SECURITY;

--
-- Name: informations_fiscales informations_fiscales_ecriture; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "informations_fiscales_ecriture" ON "public"."informations_fiscales" TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid"))))));


--
-- Name: informations_fiscales informations_fiscales_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "informations_fiscales_select" ON "public"."informations_fiscales" FOR SELECT TO "authenticated" USING ("public"."est_personnel"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: mfa_recovery_codes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."mfa_recovery_codes" ENABLE ROW LEVEL SECURITY;

--
-- Name: mouvements_stock; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."mouvements_stock" ENABLE ROW LEVEL SECURITY;

--
-- Name: mouvements_stock mouvements_stock_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mouvements_stock_delete" ON "public"."mouvements_stock" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: mouvements_stock mouvements_stock_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mouvements_stock_insert" ON "public"."mouvements_stock" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: mouvements_stock mouvements_stock_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mouvements_stock_select" ON "public"."mouvements_stock" FOR SELECT USING ("public"."est_personnel"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: mouvements_stock mouvements_stock_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mouvements_stock_update" ON "public"."mouvements_stock" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: params_annuels; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."params_annuels" ENABLE ROW LEVEL SECURITY;

--
-- Name: params_annuels params_annuels_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "params_annuels_delete" ON "public"."params_annuels" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: params_annuels params_annuels_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "params_annuels_insert" ON "public"."params_annuels" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: params_annuels params_annuels_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "params_annuels_select" ON "public"."params_annuels" FOR SELECT USING ("public"."est_personnel"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: params_annuels params_annuels_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "params_annuels_update" ON "public"."params_annuels" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: permission_overrides; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."permission_overrides" ENABLE ROW LEVEL SECURITY;

--
-- Name: portail_messages portail_admin_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "portail_admin_insert" ON "public"."portail_messages" FOR INSERT WITH CHECK ((("auteur" = 'admin'::"text") AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))))));


--
-- Name: portail_messages portail_admin_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "portail_admin_select" ON "public"."portail_messages" FOR SELECT USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))));


--
-- Name: portail_messages portail_admin_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "portail_admin_update" ON "public"."portail_messages" FOR UPDATE USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))));


--
-- Name: portail_messages portail_employe_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "portail_employe_insert" ON "public"."portail_messages" FOR INSERT WITH CHECK ((("employe_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("auteur" = 'employe'::"text")));


--
-- Name: portail_messages portail_employe_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "portail_employe_select" ON "public"."portail_messages" FOR SELECT USING (("employe_user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: portail_messages portail_employe_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "portail_employe_update" ON "public"."portail_messages" FOR UPDATE USING (("employe_user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("employe_user_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: portail_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."portail_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: primes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."primes" ENABLE ROW LEVEL SECURITY;

--
-- Name: primes primes_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "primes_delete" ON "public"."primes" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: primes primes_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "primes_insert" ON "public"."primes" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: primes primes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "primes_select" ON "public"."primes" FOR SELECT USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))) OR ("employe_id" = "public"."current_employe_id"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: primes primes_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "primes_update" ON "public"."primes" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: retenues; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."retenues" ENABLE ROW LEVEL SECURITY;

--
-- Name: retenues retenues_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "retenues_delete" ON "public"."retenues" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: retenues retenues_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "retenues_insert" ON "public"."retenues" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: retenues retenues_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "retenues_select" ON "public"."retenues" FOR SELECT USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))) OR ("employe_id" = "public"."current_employe_id"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: retenues retenues_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "retenues_update" ON "public"."retenues" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: sanctions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sanctions" ENABLE ROW LEVEL SECURITY;

--
-- Name: sanctions sanctions_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "sanctions_delete" ON "public"."sanctions" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: sanctions sanctions_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "sanctions_insert" ON "public"."sanctions" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: sanctions sanctions_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "sanctions_select" ON "public"."sanctions" FOR SELECT USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))) OR ("employe_id" = "public"."current_employe_id"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: sanctions sanctions_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "sanctions_update" ON "public"."sanctions" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: service_membres; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."service_membres" ENABLE ROW LEVEL SECURITY;

--
-- Name: service_membres service_membres_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "service_membres_select" ON "public"."service_membres" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."services" "s"
  WHERE (("s"."id" = "service_membres"."service_id") AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "s"."societe_id")))));


--
-- Name: service_membres service_membres_write_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "service_membres_write_admin" ON "public"."service_membres" TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."services" "s"
  WHERE (("s"."id" = "service_membres"."service_id") AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "s"."societe_id"))))))) WITH CHECK (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."services" "s"
  WHERE (("s"."id" = "service_membres"."service_id") AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "s"."societe_id")))))));


--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;

--
-- Name: services services_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "services_select" ON "public"."services" FOR SELECT USING ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: services services_write_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "services_write_admin" ON "public"."services" TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")))) WITH CHECK (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id"))));


--
-- Name: societe_config; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."societe_config" ENABLE ROW LEVEL SECURITY;

--
-- Name: societe_identification; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."societe_identification" ENABLE ROW LEVEL SECURITY;

--
-- Name: societe_identification societe_identification_ecriture; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "societe_identification_ecriture" ON "public"."societe_identification" TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_chef_compta"(( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_chef_compta"(( SELECT "auth"."uid"() AS "uid"))))));


--
-- Name: societe_identification societe_identification_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "societe_identification_select" ON "public"."societe_identification" FOR SELECT TO "authenticated" USING ("public"."est_personnel"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: societes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."societes" ENABLE ROW LEVEL SECURITY;

--
-- Name: societes societes_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "societes_delete" ON "public"."societes" FOR DELETE TO "authenticated" USING ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")));


--
-- Name: societes societes_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "societes_insert" ON "public"."societes" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")));


--
-- Name: societes societes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "societes_select" ON "public"."societes" FOR SELECT TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "id")));


--
-- Name: societes societes_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "societes_update" ON "public"."societes" FOR UPDATE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) AND "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "id"))));


--
-- Name: suppressed_emails; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."suppressed_emails" ENABLE ROW LEVEL SECURITY;

--
-- Name: taux_historique; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."taux_historique" ENABLE ROW LEVEL SECURITY;

--
-- Name: taux_historique taux_historique_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "taux_historique_delete" ON "public"."taux_historique" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: taux_historique taux_historique_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "taux_historique_insert" ON "public"."taux_historique" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: taux_historique taux_historique_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "taux_historique_select" ON "public"."taux_historique" FOR SELECT TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")));


--
-- Name: taux_historique taux_historique_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "taux_historique_update" ON "public"."taux_historique" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions transactions_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "transactions_delete" ON "public"."transactions" FOR DELETE TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: transactions transactions_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "transactions_insert" ON "public"."transactions" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: transactions transactions_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "transactions_select" ON "public"."transactions" FOR SELECT USING ("public"."est_personnel"(( SELECT "auth"."uid"() AS "uid"), "societe_id"));


--
-- Name: transactions transactions_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "transactions_update" ON "public"."transactions" FOR UPDATE TO "authenticated" USING ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")) AND ("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_compta"(( SELECT "auth"."uid"() AS "uid")) OR "public"."in_service_grh"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: user_activites; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_activites" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_activites user_activites_gestion; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_activites_gestion" ON "public"."user_activites" TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: user_activites user_activites_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_activites_select" ON "public"."user_activites" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id") AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: user_custom_postes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_custom_postes" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_custom_postes user_custom_postes_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_custom_postes_all" ON "public"."user_custom_postes" TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id"))) WITH CHECK (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")));


--
-- Name: user_feature_access; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_feature_access" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_societes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_societes" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_societes user_societes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_societes_select" ON "public"."user_societes" FOR SELECT TO "authenticated" USING (("public"."is_admin_general"(( SELECT "auth"."uid"() AS "uid")) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."has_societe_access"(( SELECT "auth"."uid"() AS "uid"), "societe_id")));


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT ALL ON SCHEMA "public" TO PUBLIC;


--
-- Name: FUNCTION "activite_autorisee"("_user_id" "uuid", "_societe_id" "uuid", "_activite_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."activite_autorisee"("_user_id" "uuid", "_societe_id" "uuid", "_activite_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activite_autorisee"("_user_id" "uuid", "_societe_id" "uuid", "_activite_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "admin_gere_utilisateur"("_admin" "uuid", "_cible" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."admin_gere_utilisateur"("_admin" "uuid", "_cible" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_gere_utilisateur"("_admin" "uuid", "_cible" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_gere_utilisateur"("_admin" "uuid", "_cible" "uuid") TO "service_role";


--
-- Name: FUNCTION "app_state_societe_id"("_key" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."app_state_societe_id"("_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."app_state_societe_id"("_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_state_societe_id"("_key" "text") TO "service_role";


--
-- Name: FUNCTION "audit_trigger_fn"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."audit_trigger_fn"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_trigger_fn"() TO "service_role";


--
-- Name: FUNCTION "audit_user_societes"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."audit_user_societes"() FROM PUBLIC;


--
-- Name: FUNCTION "bloquer_role_super_admin"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."bloquer_role_super_admin"() FROM PUBLIC;


--
-- Name: FUNCTION "controle_quatre_yeux"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."controle_quatre_yeux"() FROM PUBLIC;


--
-- Name: FUNCTION "controle_reouverture_exercice"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."controle_reouverture_exercice"() FROM PUBLIC;


--
-- Name: FUNCTION "current_employe_id"("_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."current_employe_id"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_employe_id"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_employe_id"("_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "definir_compteur"("p_societe" "uuid", "p_type" "text", "p_annee" integer, "p_valeur" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."definir_compteur"("p_societe" "uuid", "p_type" "text", "p_annee" integer, "p_valeur" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."definir_compteur"("p_societe" "uuid", "p_type" "text", "p_annee" integer, "p_valeur" integer) TO "authenticated";


--
-- Name: FUNCTION "employe_autorise"("_user_id" "uuid", "_societe_id" "uuid", "_activite_id" "uuid", "_repartition" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."employe_autorise"("_user_id" "uuid", "_societe_id" "uuid", "_activite_id" "uuid", "_repartition" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."employe_autorise"("_user_id" "uuid", "_societe_id" "uuid", "_activite_id" "uuid", "_repartition" "jsonb") TO "authenticated";


--
-- Name: FUNCTION "employe_id_autorise"("_user_id" "uuid", "_employe_id" bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."employe_id_autorise"("_user_id" "uuid", "_employe_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."employe_id_autorise"("_user_id" "uuid", "_employe_id" bigint) TO "authenticated";


--
-- Name: FUNCTION "est_personnel"("_user_id" "uuid", "_societe_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."est_personnel"("_user_id" "uuid", "_societe_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."est_personnel"("_user_id" "uuid", "_societe_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "generate_set_impots"("p_regime" "public"."regime_fiscal_enum", "p_secteur" "public"."secteur_activite_enum", "p_ca_annuel" numeric, "p_assujetti_tva" boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."generate_set_impots"("p_regime" "public"."regime_fiscal_enum", "p_secteur" "public"."secteur_activite_enum", "p_ca_annuel" numeric, "p_assujetti_tva" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_set_impots"("p_regime" "public"."regime_fiscal_enum", "p_secteur" "public"."secteur_activite_enum", "p_ca_annuel" numeric, "p_assujetti_tva" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_set_impots"("p_regime" "public"."regime_fiscal_enum", "p_secteur" "public"."secteur_activite_enum", "p_ca_annuel" numeric, "p_assujetti_tva" boolean) TO "service_role";


--
-- Name: FUNCTION "get_internal_webhook_secret"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_internal_webhook_secret"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_internal_webhook_secret"() TO "service_role";


--
-- Name: FUNCTION "handle_new_societe"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."handle_new_societe"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_societe"() TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "handle_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";


--
-- Name: FUNCTION "has_active_chef_grant"("_user_id" "uuid", "_service" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."has_active_chef_grant"("_user_id" "uuid", "_service" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_active_chef_grant"("_user_id" "uuid", "_service" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_active_chef_grant"("_user_id" "uuid", "_service" "text") TO "service_role";


--
-- Name: FUNCTION "has_active_grant"("_user_id" "uuid", "_service" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."has_active_grant"("_user_id" "uuid", "_service" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_active_grant"("_user_id" "uuid", "_service" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_active_grant"("_user_id" "uuid", "_service" "text") TO "service_role";


--
-- Name: FUNCTION "has_role"("_user_id" "uuid", "_role" "public"."app_role"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";


--
-- Name: FUNCTION "has_societe_access"("_societe_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."has_societe_access"("_societe_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_societe_access"("_societe_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_societe_access"("_societe_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "has_societe_access"("_user_id" "uuid", "_societe_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."has_societe_access"("_user_id" "uuid", "_societe_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_societe_access"("_user_id" "uuid", "_societe_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_societe_access"("_user_id" "uuid", "_societe_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "in_service_compta"("_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."in_service_compta"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."in_service_compta"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."in_service_compta"("_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "in_service_grh"("_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."in_service_grh"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."in_service_grh"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."in_service_grh"("_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "interdire_encaissement_non_validee"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."interdire_encaissement_non_validee"() FROM PUBLIC;


--
-- Name: FUNCTION "interdire_exercice_cloture"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."interdire_exercice_cloture"() FROM PUBLIC;


--
-- Name: FUNCTION "interdire_suppression_facture_engagee"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."interdire_suppression_facture_engagee"() FROM PUBLIC;


--
-- Name: FUNCTION "is_admin"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";


--
-- Name: FUNCTION "is_admin"("_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_admin"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_admin_general"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_admin_general"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin_general"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_general"() TO "service_role";


--
-- Name: FUNCTION "is_admin_general"("_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_admin_general"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin_general"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_general"("_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_chef"("_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_chef"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_chef"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_chef"("_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_chef_compta"("_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_chef_compta"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_chef_compta"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_chef_compta"("_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_chef_grh"("_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_chef_grh"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_chef_grh"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_chef_grh"("_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_employe"("_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_employe"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_employe"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_employe"("_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_modele_societe"("_societe_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_modele_societe"("_societe_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_modele_societe"("_societe_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_modele_societe"("_societe_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "nb_codes_secours"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."nb_codes_secours"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nb_codes_secours"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."nb_codes_secours"() TO "service_role";


--
-- Name: FUNCTION "notify_validation_change"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."notify_validation_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_validation_change"() TO "service_role";


--
-- Name: FUNCTION "notify_validation_insert"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."notify_validation_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_validation_insert"() TO "service_role";


--
-- Name: FUNCTION "numero_max_utilise"("p_societe" "uuid", "p_type" "text", "p_annee" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."numero_max_utilise"("p_societe" "uuid", "p_type" "text", "p_annee" integer) FROM PUBLIC;


--
-- Name: FUNCTION "prevent_builtin_service_delete"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."prevent_builtin_service_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_builtin_service_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_builtin_service_delete"() TO "service_role";


--
-- Name: FUNCTION "prochain_numero"("p_societe" "uuid", "p_type" "text", "p_annee" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."prochain_numero"("p_societe" "uuid", "p_type" "text", "p_annee" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prochain_numero"("p_societe" "uuid", "p_type" "text", "p_annee" integer) TO "authenticated";


--
-- Name: FUNCTION "profil_id_par_email"("_email" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."profil_id_par_email"("_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."profil_id_par_email"("_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."profil_id_par_email"("_email" "text") TO "service_role";


--
-- Name: FUNCTION "reserver_numero"("p_societe" "uuid", "p_type" "text", "p_annee" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reserver_numero"("p_societe" "uuid", "p_type" "text", "p_annee" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserver_numero"("p_societe" "uuid", "p_type" "text", "p_annee" integer) TO "authenticated";


--
-- Name: FUNCTION "set_ecritures_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_ecritures_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_ecritures_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_ecritures_updated_at"() TO "service_role";


--
-- Name: FUNCTION "set_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


--
-- Name: FUNCTION "trg_recalc_set_impots"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."trg_recalc_set_impots"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_recalc_set_impots"() TO "service_role";


--
-- Name: FUNCTION "update_ecritures_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_ecritures_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ecritures_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ecritures_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_updated_at_column"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


--
-- Name: FUNCTION "validate_grant_expiration"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."validate_grant_expiration"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_grant_expiration"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_grant_expiration"() TO "service_role";


--
-- Name: FUNCTION "verrou_apparence_societe"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."verrou_apparence_societe"() FROM PUBLIC;


--
-- Name: TABLE "absences"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."absences" TO "anon";
GRANT ALL ON TABLE "public"."absences" TO "authenticated";
GRANT ALL ON TABLE "public"."absences" TO "service_role";


--
-- Name: SEQUENCE "absences_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."absences_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."absences_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."absences_id_seq" TO "service_role";


--
-- Name: TABLE "activites"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."activites" TO "anon";
GRANT ALL ON TABLE "public"."activites" TO "authenticated";
GRANT ALL ON TABLE "public"."activites" TO "service_role";


--
-- Name: TABLE "alertes_lues"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."alertes_lues" TO "anon";
GRANT ALL ON TABLE "public"."alertes_lues" TO "authenticated";
GRANT ALL ON TABLE "public"."alertes_lues" TO "service_role";


--
-- Name: TABLE "app_state"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."app_state" TO "anon";
GRANT ALL ON TABLE "public"."app_state" TO "authenticated";
GRANT ALL ON TABLE "public"."app_state" TO "service_role";


--
-- Name: TABLE "articles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."articles" TO "anon";
GRANT ALL ON TABLE "public"."articles" TO "authenticated";
GRANT ALL ON TABLE "public"."articles" TO "service_role";


--
-- Name: SEQUENCE "articles_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."articles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."articles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."articles_id_seq" TO "service_role";


--
-- Name: TABLE "audit_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";


--
-- Name: TABLE "bulletins_paie"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."bulletins_paie" TO "anon";
GRANT ALL ON TABLE "public"."bulletins_paie" TO "authenticated";
GRANT ALL ON TABLE "public"."bulletins_paie" TO "service_role";


--
-- Name: TABLE "categories_stock"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."categories_stock" TO "anon";
GRANT ALL ON TABLE "public"."categories_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."categories_stock" TO "service_role";


--
-- Name: SEQUENCE "categories_stock_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."categories_stock_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."categories_stock_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."categories_stock_id_seq" TO "service_role";


--
-- Name: TABLE "compteurs_numerotation"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."compteurs_numerotation" TO "authenticated";


--
-- Name: TABLE "cross_service_grants"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cross_service_grants" TO "anon";
GRANT ALL ON TABLE "public"."cross_service_grants" TO "authenticated";
GRANT ALL ON TABLE "public"."cross_service_grants" TO "service_role";


--
-- Name: TABLE "custom_postes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."custom_postes" TO "anon";
GRANT ALL ON TABLE "public"."custom_postes" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_postes" TO "service_role";


--
-- Name: TABLE "custom_services"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."custom_services" TO "anon";
GRANT ALL ON TABLE "public"."custom_services" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_services" TO "service_role";


--
-- Name: TABLE "device_otps"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."device_otps" TO "anon";
GRANT ALL ON TABLE "public"."device_otps" TO "authenticated";
GRANT ALL ON TABLE "public"."device_otps" TO "service_role";


--
-- Name: TABLE "device_sessions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."device_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."device_sessions" TO "service_role";
GRANT ALL ON TABLE "public"."device_sessions" TO "anon";


--
-- Name: TABLE "devis"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."devis" TO "anon";
GRANT ALL ON TABLE "public"."devis" TO "authenticated";
GRANT ALL ON TABLE "public"."devis" TO "service_role";


--
-- Name: SEQUENCE "devis_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."devis_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."devis_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."devis_id_seq" TO "service_role";


--
-- Name: TABLE "ecritures_comptables"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ecritures_comptables" TO "anon";
GRANT ALL ON TABLE "public"."ecritures_comptables" TO "authenticated";
GRANT ALL ON TABLE "public"."ecritures_comptables" TO "service_role";


--
-- Name: SEQUENCE "ecritures_comptables_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."ecritures_comptables_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ecritures_comptables_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ecritures_comptables_id_seq" TO "service_role";


--
-- Name: TABLE "email_send_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."email_send_log" TO "anon";
GRANT ALL ON TABLE "public"."email_send_log" TO "authenticated";
GRANT ALL ON TABLE "public"."email_send_log" TO "service_role";


--
-- Name: TABLE "email_send_state"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."email_send_state" TO "anon";
GRANT ALL ON TABLE "public"."email_send_state" TO "authenticated";
GRANT ALL ON TABLE "public"."email_send_state" TO "service_role";


--
-- Name: SEQUENCE "email_send_state_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."email_send_state_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."email_send_state_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."email_send_state_id_seq" TO "service_role";


--
-- Name: TABLE "email_unsubscribe_tokens"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."email_unsubscribe_tokens" TO "anon";
GRANT ALL ON TABLE "public"."email_unsubscribe_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."email_unsubscribe_tokens" TO "service_role";


--
-- Name: TABLE "employes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."employes" TO "anon";
GRANT ALL ON TABLE "public"."employes" TO "authenticated";
GRANT ALL ON TABLE "public"."employes" TO "service_role";


--
-- Name: SEQUENCE "employes_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."employes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."employes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."employes_id_seq" TO "service_role";


--
-- Name: TABLE "emprunts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."emprunts" TO "authenticated";
GRANT ALL ON TABLE "public"."emprunts" TO "service_role";


--
-- Name: SEQUENCE "emprunts_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE "public"."emprunts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."emprunts_id_seq" TO "service_role";


--
-- Name: TABLE "exercices"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."exercices" TO "authenticated";
GRANT ALL ON TABLE "public"."exercices" TO "service_role";


--
-- Name: TABLE "factures"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."factures" TO "anon";
GRANT ALL ON TABLE "public"."factures" TO "authenticated";
GRANT ALL ON TABLE "public"."factures" TO "service_role";


--
-- Name: SEQUENCE "factures_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."factures_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."factures_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."factures_id_seq" TO "service_role";


--
-- Name: TABLE "fiscal_delegations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."fiscal_delegations" TO "anon";
GRANT ALL ON TABLE "public"."fiscal_delegations" TO "authenticated";
GRANT ALL ON TABLE "public"."fiscal_delegations" TO "service_role";


--
-- Name: TABLE "fournisseurs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."fournisseurs" TO "anon";
GRANT ALL ON TABLE "public"."fournisseurs" TO "authenticated";
GRANT ALL ON TABLE "public"."fournisseurs" TO "service_role";


--
-- Name: SEQUENCE "fournisseurs_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."fournisseurs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fournisseurs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fournisseurs_id_seq" TO "service_role";


--
-- Name: TABLE "heures_sup"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."heures_sup" TO "anon";
GRANT ALL ON TABLE "public"."heures_sup" TO "authenticated";
GRANT ALL ON TABLE "public"."heures_sup" TO "service_role";


--
-- Name: SEQUENCE "heures_sup_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."heures_sup_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."heures_sup_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."heures_sup_id_seq" TO "service_role";


--
-- Name: TABLE "immobilisations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."immobilisations" TO "anon";
GRANT ALL ON TABLE "public"."immobilisations" TO "authenticated";
GRANT ALL ON TABLE "public"."immobilisations" TO "service_role";


--
-- Name: SEQUENCE "immobilisations_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."immobilisations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."immobilisations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."immobilisations_id_seq" TO "service_role";


--
-- Name: TABLE "informations_fiscales"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."informations_fiscales" TO "authenticated";
GRANT ALL ON TABLE "public"."informations_fiscales" TO "service_role";


--
-- Name: TABLE "mfa_recovery_codes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."mfa_recovery_codes" TO "service_role";


--
-- Name: TABLE "mouvements_stock"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."mouvements_stock" TO "anon";
GRANT ALL ON TABLE "public"."mouvements_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."mouvements_stock" TO "service_role";


--
-- Name: SEQUENCE "mouvements_stock_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."mouvements_stock_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."mouvements_stock_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."mouvements_stock_id_seq" TO "service_role";


--
-- Name: TABLE "params_annuels"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."params_annuels" TO "anon";
GRANT ALL ON TABLE "public"."params_annuels" TO "authenticated";
GRANT ALL ON TABLE "public"."params_annuels" TO "service_role";


--
-- Name: SEQUENCE "params_annuels_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."params_annuels_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."params_annuels_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."params_annuels_id_seq" TO "service_role";


--
-- Name: TABLE "permission_overrides"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."permission_overrides" TO "anon";
GRANT ALL ON TABLE "public"."permission_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."permission_overrides" TO "service_role";


--
-- Name: TABLE "portail_messages"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."portail_messages" TO "anon";
GRANT ALL ON TABLE "public"."portail_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."portail_messages" TO "service_role";


--
-- Name: TABLE "primes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."primes" TO "anon";
GRANT ALL ON TABLE "public"."primes" TO "authenticated";
GRANT ALL ON TABLE "public"."primes" TO "service_role";


--
-- Name: SEQUENCE "primes_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."primes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."primes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."primes_id_seq" TO "service_role";


--
-- Name: TABLE "profiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";


--
-- Name: TABLE "retenues"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."retenues" TO "anon";
GRANT ALL ON TABLE "public"."retenues" TO "authenticated";
GRANT ALL ON TABLE "public"."retenues" TO "service_role";


--
-- Name: SEQUENCE "retenues_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."retenues_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."retenues_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."retenues_id_seq" TO "service_role";


--
-- Name: TABLE "sanctions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sanctions" TO "anon";
GRANT ALL ON TABLE "public"."sanctions" TO "authenticated";
GRANT ALL ON TABLE "public"."sanctions" TO "service_role";


--
-- Name: SEQUENCE "sanctions_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."sanctions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sanctions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sanctions_id_seq" TO "service_role";


--
-- Name: TABLE "service_membres"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."service_membres" TO "anon";
GRANT ALL ON TABLE "public"."service_membres" TO "authenticated";
GRANT ALL ON TABLE "public"."service_membres" TO "service_role";


--
-- Name: TABLE "services"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";


--
-- Name: TABLE "societe_config"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."societe_config" TO "anon";
GRANT ALL ON TABLE "public"."societe_config" TO "authenticated";
GRANT ALL ON TABLE "public"."societe_config" TO "service_role";


--
-- Name: TABLE "societe_identification"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."societe_identification" TO "authenticated";
GRANT ALL ON TABLE "public"."societe_identification" TO "service_role";


--
-- Name: TABLE "societes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."societes" TO "anon";
GRANT ALL ON TABLE "public"."societes" TO "authenticated";
GRANT ALL ON TABLE "public"."societes" TO "service_role";


--
-- Name: TABLE "suppressed_emails"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."suppressed_emails" TO "anon";
GRANT ALL ON TABLE "public"."suppressed_emails" TO "authenticated";
GRANT ALL ON TABLE "public"."suppressed_emails" TO "service_role";


--
-- Name: TABLE "taux_historique"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."taux_historique" TO "anon";
GRANT ALL ON TABLE "public"."taux_historique" TO "authenticated";
GRANT ALL ON TABLE "public"."taux_historique" TO "service_role";


--
-- Name: SEQUENCE "taux_historique_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."taux_historique_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."taux_historique_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."taux_historique_id_seq" TO "service_role";


--
-- Name: TABLE "transactions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";


--
-- Name: SEQUENCE "transactions_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."transactions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."transactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transactions_id_seq" TO "service_role";


--
-- Name: TABLE "user_activites"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_activites" TO "authenticated";


--
-- Name: TABLE "user_custom_postes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_custom_postes" TO "anon";
GRANT ALL ON TABLE "public"."user_custom_postes" TO "authenticated";
GRANT ALL ON TABLE "public"."user_custom_postes" TO "service_role";


--
-- Name: TABLE "user_feature_access"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_feature_access" TO "anon";
GRANT ALL ON TABLE "public"."user_feature_access" TO "authenticated";
GRANT ALL ON TABLE "public"."user_feature_access" TO "service_role";


--
-- Name: TABLE "user_roles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";


--
-- Name: TABLE "user_societes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."user_societes" TO "authenticated";
GRANT ALL ON TABLE "public"."user_societes" TO "service_role";


--
-- PostgreSQL database dump complete
--

RESET ALL;
