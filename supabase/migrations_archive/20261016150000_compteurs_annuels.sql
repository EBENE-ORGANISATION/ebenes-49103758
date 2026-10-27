-- Décision du 2026-10-16 : la numérotation des factures et des devis repart à 001
-- chaque année quand le format contient l'année ({YYYY} ou {YY}).
-- Un compteur par société, type et année. Au premier numéro d'une année, il part
-- du plus grand numéro déjà utilisé dans cette année (continuité de la suite).
-- Année 0 : format sans année, suite unique, qui reprend le compteur de societe_config.
CREATE TABLE IF NOT EXISTS public.compteurs_numerotation (
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('facture', 'devis')),
  annee integer NOT NULL,
  valeur integer NOT NULL CHECK (valeur >= 1),
  PRIMARY KEY (societe_id, type, annee)
);
ALTER TABLE public.compteurs_numerotation ENABLE ROW LEVEL SECURITY;
CREATE POLICY compteurs_select ON public.compteurs_numerotation FOR SELECT TO authenticated
  USING (public.has_societe_access((SELECT auth.uid()), societe_id));
-- Écriture uniquement par les fonctions ci-dessous
GRANT SELECT ON public.compteurs_numerotation TO authenticated;

-- Expression régulière d'un format : le compteur ({N}…{NNNNN}) est capturé
CREATE OR REPLACE FUNCTION public.regex_numero(p_format text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $function$
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
END $function$;

-- Plus grand compteur déjà utilisé dans l'année (pièces supprimées comprises : un numéro ne resert pas)
CREATE OR REPLACE FUNCTION public.numero_max_utilise(p_societe uuid, p_type text, p_annee integer)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
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
END $function$;

-- Prochain numéro libre (sans le réserver), pour l'aperçu
CREATE OR REPLACE FUNCTION public.prochain_numero(p_societe uuid, p_type text, p_annee integer)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
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
END $function$;

-- Réserve atomiquement le prochain numéro et avance le compteur
CREATE OR REPLACE FUNCTION public.reserver_numero(p_societe uuid, p_type text, p_annee integer)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $function$
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
END $function$;

-- Paramètres société : l'administrateur règle le prochain numéro d'une année
CREATE OR REPLACE FUNCTION public.definir_compteur(p_societe uuid, p_type text, p_annee integer, p_valeur integer)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $function$
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
END $function$;

REVOKE EXECUTE ON FUNCTION public.numero_max_utilise(uuid, text, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.prochain_numero(uuid, text, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reserver_numero(uuid, text, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.definir_compteur(uuid, text, integer, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.prochain_numero(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserver_numero(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.definir_compteur(uuid, text, integer, integer) TO authenticated;
