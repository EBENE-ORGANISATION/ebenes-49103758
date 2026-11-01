-- D?ploiement cabinet, ?tape 2, t?ches 1 et 2.
-- G?n?r? depuis les migrations ; une seule transaction, aucune connexion automatique.
BEGIN;
DO $g$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261102090000') THEN
    RAISE EXCEPTION 'La migration 20261102090000 n est pas inscrite : arr?t.';
  END IF;
END $g$;

-- Suivi manuel des déclarations ; mêmes droits directs que les informations fiscales.
DO $$ BEGIN
  IF public.module_de_table('suivi_declarations') IS DISTINCT FROM 'fiscalite' THEN
    RAISE EXCEPTION 'suivi_declarations : module fiscalite attendu.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.suivi_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee smallint NOT NULL,
  mois smallint NOT NULL CHECK (mois BETWEEN 1 AND 12),
  type text NOT NULL CHECK (type IN ('TVA', 'CNSS', 'IRPP', 'patente')),
  statut text NOT NULL CHECK (statut IN ('deposee', 'payee')),
  date date NOT NULL DEFAULT current_date,
  par uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (societe_id, annee, mois, type),
  CHECK (type <> 'patente' OR mois IN (3, 6, 9, 12))
);
ALTER TABLE public.suivi_declarations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.suivi_declarations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suivi_declarations TO authenticated;
GRANT ALL ON public.suivi_declarations TO service_role;

DROP POLICY IF EXISTS suivi_declarations_select ON public.suivi_declarations;
CREATE POLICY suivi_declarations_select ON public.suivi_declarations
  FOR SELECT TO authenticated USING (public.est_personnel((SELECT auth.uid()), societe_id));
DROP POLICY IF EXISTS suivi_declarations_ecriture ON public.suivi_declarations;
CREATE POLICY suivi_declarations_ecriture ON public.suivi_declarations
  FOR ALL TO authenticated
  USING (public.is_admin_general((SELECT auth.uid())) OR
    (public.has_societe_access((SELECT auth.uid()), societe_id) AND
      (public.is_admin((SELECT auth.uid())) OR public.in_service_compta((SELECT auth.uid())))))
  WITH CHECK (public.is_admin_general((SELECT auth.uid())) OR
    (public.has_societe_access((SELECT auth.uid()), societe_id) AND
      (public.is_admin((SELECT auth.uid())) OR public.in_service_compta((SELECT auth.uid())))));

DROP POLICY IF EXISTS cabinet_lecture ON public.suivi_declarations;
CREATE POLICY cabinet_lecture ON public.suivi_declarations FOR SELECT TO authenticated
  USING (societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 1))::uuid[]));
DROP POLICY IF EXISTS cabinet_ecriture_insert ON public.suivi_declarations;
CREATE POLICY cabinet_ecriture_insert ON public.suivi_declarations FOR INSERT TO authenticated
  WITH CHECK (societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]));
DROP POLICY IF EXISTS cabinet_ecriture_update ON public.suivi_declarations;
CREATE POLICY cabinet_ecriture_update ON public.suivi_declarations FOR UPDATE TO authenticated
  USING (societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]))
  WITH CHECK (societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]));
DROP POLICY IF EXISTS cabinet_ecriture_delete ON public.suivi_declarations;
CREATE POLICY cabinet_ecriture_delete ON public.suivi_declarations FOR DELETE TO authenticated
  USING (societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 3))::uuid[]));
DROP POLICY IF EXISTS cabinet_plafond_lecture ON public.suivi_declarations;
CREATE POLICY cabinet_plafond_lecture ON public.suivi_declarations AS RESTRICTIVE FOR SELECT TO authenticated
  USING (societe_id <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
    OR societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 1))::uuid[]));
DROP POLICY IF EXISTS cabinet_plafond_ecriture_insert ON public.suivi_declarations;
CREATE POLICY cabinet_plafond_ecriture_insert ON public.suivi_declarations AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (societe_id <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
    OR societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]));
DROP POLICY IF EXISTS cabinet_plafond_ecriture_update ON public.suivi_declarations;
CREATE POLICY cabinet_plafond_ecriture_update ON public.suivi_declarations AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (societe_id <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
    OR societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]))
  WITH CHECK (societe_id <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
    OR societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]));
DROP POLICY IF EXISTS cabinet_plafond_ecriture_delete ON public.suivi_declarations;
CREATE POLICY cabinet_plafond_ecriture_delete ON public.suivi_declarations AS RESTRICTIVE FOR DELETE TO authenticated
  USING (societe_id <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
    OR societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 3))::uuid[]));

CREATE OR REPLACE FUNCTION public.forcer_par_declaration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fonction$
BEGIN
  NEW.par := auth.uid();
  RETURN NEW;
END
$fonction$;
REVOKE ALL ON FUNCTION public.forcer_par_declaration() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_par_declaration ON public.suivi_declarations;
CREATE TRIGGER trg_par_declaration BEFORE INSERT OR UPDATE ON public.suivi_declarations
  FOR EACH ROW EXECUTE FUNCTION public.forcer_par_declaration();
DROP TRIGGER IF EXISTS trg_societe_immuable ON public.suivi_declarations;
CREATE TRIGGER trg_societe_immuable BEFORE UPDATE OF societe_id ON public.suivi_declarations
  FOR EACH ROW EXECUTE FUNCTION public.interdire_changement_societe('societe_id');
DROP TRIGGER IF EXISTS audit_suivi_declarations ON public.suivi_declarations;
CREATE TRIGGER audit_suivi_declarations AFTER INSERT OR UPDATE OR DELETE ON public.suivi_declarations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES ('20261102100000', 'suivi_declarations', ARRAY[$migration_sql$
-- Suivi manuel des déclarations ; mêmes droits directs que les informations fiscales.
DO $$ BEGIN
  IF public.module_de_table('suivi_declarations') IS DISTINCT FROM 'fiscalite' THEN
    RAISE EXCEPTION 'suivi_declarations : module fiscalite attendu.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.suivi_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee smallint NOT NULL,
  mois smallint NOT NULL CHECK (mois BETWEEN 1 AND 12),
  type text NOT NULL CHECK (type IN ('TVA', 'CNSS', 'IRPP', 'patente')),
  statut text NOT NULL CHECK (statut IN ('deposee', 'payee')),
  date date NOT NULL DEFAULT current_date,
  par uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (societe_id, annee, mois, type),
  CHECK (type <> 'patente' OR mois IN (3, 6, 9, 12))
);
ALTER TABLE public.suivi_declarations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.suivi_declarations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suivi_declarations TO authenticated;
GRANT ALL ON public.suivi_declarations TO service_role;

DROP POLICY IF EXISTS suivi_declarations_select ON public.suivi_declarations;
CREATE POLICY suivi_declarations_select ON public.suivi_declarations
  FOR SELECT TO authenticated USING (public.est_personnel((SELECT auth.uid()), societe_id));
DROP POLICY IF EXISTS suivi_declarations_ecriture ON public.suivi_declarations;
CREATE POLICY suivi_declarations_ecriture ON public.suivi_declarations
  FOR ALL TO authenticated
  USING (public.is_admin_general((SELECT auth.uid())) OR
    (public.has_societe_access((SELECT auth.uid()), societe_id) AND
      (public.is_admin((SELECT auth.uid())) OR public.in_service_compta((SELECT auth.uid())))))
  WITH CHECK (public.is_admin_general((SELECT auth.uid())) OR
    (public.has_societe_access((SELECT auth.uid()), societe_id) AND
      (public.is_admin((SELECT auth.uid())) OR public.in_service_compta((SELECT auth.uid())))));

DROP POLICY IF EXISTS cabinet_lecture ON public.suivi_declarations;
CREATE POLICY cabinet_lecture ON public.suivi_declarations FOR SELECT TO authenticated
  USING (societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 1))::uuid[]));
DROP POLICY IF EXISTS cabinet_ecriture_insert ON public.suivi_declarations;
CREATE POLICY cabinet_ecriture_insert ON public.suivi_declarations FOR INSERT TO authenticated
  WITH CHECK (societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]));
DROP POLICY IF EXISTS cabinet_ecriture_update ON public.suivi_declarations;
CREATE POLICY cabinet_ecriture_update ON public.suivi_declarations FOR UPDATE TO authenticated
  USING (societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]))
  WITH CHECK (societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]));
DROP POLICY IF EXISTS cabinet_ecriture_delete ON public.suivi_declarations;
CREATE POLICY cabinet_ecriture_delete ON public.suivi_declarations FOR DELETE TO authenticated
  USING (societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 3))::uuid[]));
DROP POLICY IF EXISTS cabinet_plafond_lecture ON public.suivi_declarations;
CREATE POLICY cabinet_plafond_lecture ON public.suivi_declarations AS RESTRICTIVE FOR SELECT TO authenticated
  USING (societe_id <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
    OR societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 1))::uuid[]));
DROP POLICY IF EXISTS cabinet_plafond_ecriture_insert ON public.suivi_declarations;
CREATE POLICY cabinet_plafond_ecriture_insert ON public.suivi_declarations AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (societe_id <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
    OR societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]));
DROP POLICY IF EXISTS cabinet_plafond_ecriture_update ON public.suivi_declarations;
CREATE POLICY cabinet_plafond_ecriture_update ON public.suivi_declarations AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (societe_id <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
    OR societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]))
  WITH CHECK (societe_id <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
    OR societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 2))::uuid[]));
DROP POLICY IF EXISTS cabinet_plafond_ecriture_delete ON public.suivi_declarations;
CREATE POLICY cabinet_plafond_ecriture_delete ON public.suivi_declarations AS RESTRICTIVE FOR DELETE TO authenticated
  USING (societe_id <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
    OR societe_id = ANY ((SELECT public.cabinet_societes('fiscalite', 3))::uuid[]));

CREATE OR REPLACE FUNCTION public.forcer_par_declaration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fonction$
BEGIN
  NEW.par := auth.uid();
  RETURN NEW;
END
$fonction$;
REVOKE ALL ON FUNCTION public.forcer_par_declaration() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_par_declaration ON public.suivi_declarations;
CREATE TRIGGER trg_par_declaration BEFORE INSERT OR UPDATE ON public.suivi_declarations
  FOR EACH ROW EXECUTE FUNCTION public.forcer_par_declaration();
DROP TRIGGER IF EXISTS trg_societe_immuable ON public.suivi_declarations;
CREATE TRIGGER trg_societe_immuable BEFORE UPDATE OF societe_id ON public.suivi_declarations
  FOR EACH ROW EXECUTE FUNCTION public.interdire_changement_societe('societe_id');
DROP TRIGGER IF EXISTS audit_suivi_declarations ON public.suivi_declarations;
CREATE TRIGGER audit_suivi_declarations AFTER INSERT OR UPDATE OR DELETE ON public.suivi_declarations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
$migration_sql$])
ON CONFLICT (version) DO NOTHING;

-- Calculs internes : aucun accès direct depuis une session de l'application.
CREATE OR REPLACE FUNCTION private.tva_liquidee(_societe uuid, _annee int, _mois int)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fonction$
  SELECT EXISTS (
    SELECT 1 FROM public.ecritures_comptables e
    WHERE e.societe_id = _societe AND e.annee = _annee AND e.mois = _mois AND e.statut = 'valide'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.lignes) l
        WHERE l->>'compte' LIKE '443%' AND l->>'compte' NOT LIKE '4438%'
          AND coalesce((l->>'debit')::numeric, 0) > 0)
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.lignes) l
        WHERE l->>'compte' LIKE '4441%' OR l->>'compte' LIKE '4449%'
          OR l->>'compte' ~ '^5[0-8]'
          OR (l->>'compte' LIKE '445%' AND coalesce((l->>'credit')::numeric, 0) > 0))
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(e.lignes) l WHERE l->>'compte' ~ '^[67]')
  )
$fonction$;

CREATE OR REPLACE FUNCTION private.du_social(_societe uuid, _prefixes text[], _avant date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fonction$
  -- Les paiements postérieurs à la période éteignent aussi sa dette.
  -- Comme dettesPaie : à partir des derniers à-nouveaux (journal AN) antérieurs
  -- à la période, qui reprennent les dettes des exercices clos ; sinon tout.
  WITH depart AS (
    SELECT coalesce(max(a.annee), -1) AS annee FROM public.ecritures_comptables a
    WHERE a.societe_id = _societe AND a.statut = 'valide' AND a.journal = 'AN'
      AND a.date < _avant
  )
  SELECT round(coalesce(sum(CASE WHEN e.date < _avant THEN coalesce((l->>'credit')::numeric, 0)
    ELSE 0 END - coalesce((l->>'debit')::numeric, 0)), 0))
  FROM public.ecritures_comptables e CROSS JOIN depart
  CROSS JOIN LATERAL jsonb_array_elements(e.lignes) l
  WHERE e.societe_id = _societe AND e.statut = 'valide' AND e.annee >= depart.annee
    AND EXISTS (SELECT 1 FROM unnest(_prefixes) p WHERE starts_with(l->>'compte', p))
$fonction$;
REVOKE ALL ON FUNCTION private.tva_liquidee(uuid, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.du_social(uuid, text[], date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.tva_liquidee(uuid, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION private.du_social(uuid, text[], date) TO service_role;

CREATE OR REPLACE FUNCTION public.tableau_cabinet(_annee int, _mois int, _aujourdhui date DEFAULT current_date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fonction$
DECLARE
  appelant uuid := auth.uid();
  cabinet uuid;
  responsable boolean;
  debut date;
  suivant date;
  dossiers jsonb;
  charge jsonb := NULL;
BEGIN
  SELECT m.cabinet_id INTO cabinet FROM public.cabinet_membres m
  JOIN public.cabinets c ON c.id = m.cabinet_id AND c.actif
  WHERE m.user_id = appelant AND m.actif;
  IF appelant IS NULL OR cabinet IS NULL THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Accès au tableau du cabinet refusé.' USING ERRCODE = '42501';
  END IF;
  IF _mois IS NULL OR _mois NOT BETWEEN 1 AND 12 OR _annee IS NULL
     OR _annee NOT BETWEEN 1 AND 9998 OR _aujourdhui IS NULL THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Période ou date invalide.';
  END IF;
  responsable := private.cabinet_responsable_actif(appelant, cabinet);
  debut := make_date(_annee, _mois, 1);
  suivant := (debut + interval '1 month')::date;

  WITH visibles AS MATERIALIZED (
    SELECT d.*, s.nom AS societe_nom
    FROM public.cabinet_dossiers d JOIN public.societes s ON s.id = d.societe_id
    WHERE d.cabinet_id = cabinet AND d.etat IN ('actif', 'depart_demande')
      -- Le contrôle d'attribution reste explicite même pour un membre ayant
      -- aussi un accès direct à une société ou un rôle global.
      AND (responsable OR EXISTS (SELECT 1 FROM public.cabinet_attributions a
        WHERE a.dossier_id = d.id AND a.user_id = appelant))
      AND public.cabinet_lit_dossier(appelant, d.id)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'dossier_id', d.id, 'societe_id', d.societe_id, 'societe_nom', d.societe_nom,
    'mission', d.mission, 'etat', d.etat,
    'echeances', (
      SELECT jsonb_agg(jsonb_build_object('type', t.type, 'annee', _annee, 'mois', _mois,
        'echeance', t.echeance, 'etat', CASE
          WHEN t.type = 'patente' AND t.echeance IS NULL THEN 'sans_objet'
          WHEN sd.id IS NOT NULL THEN 'faite'
          WHEN NOT t.concernee THEN 'sans_objet'
          WHEN t.faite THEN 'faite'
          WHEN _aujourdhui > t.echeance THEN 'en_retard' ELSE 'a_faire' END,
        'marquee', CASE WHEN sd.id IS NOT NULL THEN jsonb_build_object(
          'statut', sd.statut, 'date', sd.date, 'par_nom', nullif(btrim(p.nom), '')) ELSE NULL END)
        ORDER BY t.ordre)
      FROM (VALUES
        (1, 'TVA', suivant + 14,
          EXISTS (SELECT 1 FROM public.ecritures_comptables e, LATERAL jsonb_array_elements(e.lignes) l
            WHERE e.societe_id = d.societe_id AND e.statut = 'valide' AND e.annee = _annee AND e.mois = _mois
              AND (l->>'compte' LIKE '443%' OR l->>'compte' LIKE '445%')),
          private.tva_liquidee(d.societe_id, _annee, _mois)),
        (2, 'CNSS', suivant + 14,
          EXISTS (SELECT 1 FROM public.ecritures_comptables e, LATERAL jsonb_array_elements(e.lignes) l
            WHERE e.societe_id = d.societe_id AND e.statut = 'valide' AND e.annee = _annee AND e.mois = _mois
              AND (l->>'compte' LIKE '431%' OR l->>'compte' LIKE '433%') AND coalesce((l->>'credit')::numeric, 0) > 0),
          private.du_social(d.societe_id, ARRAY['431','433'], suivant) <= 0),
        (3, 'IRPP', suivant + 14,
          EXISTS (SELECT 1 FROM public.ecritures_comptables e, LATERAL jsonb_array_elements(e.lignes) l
            WHERE e.societe_id = d.societe_id AND e.statut = 'valide' AND e.annee = _annee AND e.mois = _mois
              AND l->>'compte' LIKE '447%' AND coalesce((l->>'credit')::numeric, 0) > 0),
          private.du_social(d.societe_id, ARRAY['447'], suivant) <= 0),
        (4, 'patente', CASE WHEN _mois IN (3,6,9,12) THEN debut + 14 END, _mois IN (3,6,9,12), false)
      ) AS t(ordre,type,echeance,concernee,faite)
      LEFT JOIN public.suivi_declarations sd ON sd.societe_id = d.societe_id
        AND sd.annee = _annee AND sd.mois = _mois AND sd.type = t.type
      LEFT JOIN public.profiles p ON p.user_id = sd.par
    ),
    'pieces', jsonb_build_object(
      'transactions', (SELECT count(*) FROM public.transactions t WHERE t.societe_id = d.societe_id AND t.statut = 'en_validation' AND t.deleted_at IS NULL),
      'factures', (SELECT count(*) FROM public.factures f WHERE f.societe_id = d.societe_id AND f.statut_validation = 'en_validation' AND f.deleted_at IS NULL),
      'ecritures_brouillon', (SELECT count(*) FROM public.ecritures_comptables e WHERE e.societe_id = d.societe_id AND e.statut = 'brouillon'),
      'sans_justificatif', (SELECT count(*) FROM public.transactions t WHERE t.societe_id = d.societe_id
        AND t.annee = _annee AND t.type = 'depense' AND t.auto IS FALSE AND t.deleted_at IS NULL AND nullif(btrim(t.piece_jointe), '') IS NULL)),
    'avancement', jsonb_build_object(
      'dernier_mois', (SELECT lpad(e.annee::text, 4, '0') || '-' || lpad(e.mois::text, 2, '0')
        FROM public.ecritures_comptables e WHERE e.societe_id = d.societe_id AND e.statut = 'valide'
        ORDER BY e.annee DESC, e.mois DESC LIMIT 1),
      'bulletins_faits', (SELECT count(*) FROM public.bulletins_paie b WHERE b.societe_id = d.societe_id AND b.annee = _annee AND b.mois = _mois),
      'bulletins_attendus', (SELECT count(*) FROM public.employes e WHERE e.societe_id = d.societe_id
        AND e.deleted_at IS NULL AND e.date_embauche < suivant AND (e.date_fin_contrat IS NULL OR e.date_fin_contrat >= debut)),
      'exercice_precedent_cloture', EXISTS (SELECT 1 FROM public.exercices e WHERE e.societe_id = d.societe_id AND e.annee = _annee - 1 AND e.statut = 'cloture'))
    ) ORDER BY d.societe_nom, d.id), '[]'::jsonb) INTO dossiers FROM visibles d;

  IF responsable THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id,
      'nom', coalesce(nullif(btrim(p.nom), ''), 'Membre du cabinet'), 'role', m.role,
      'dossiers', (SELECT count(*) FROM jsonb_array_elements(dossiers) d
        WHERE m.role = 'responsable' OR EXISTS (SELECT 1 FROM public.cabinet_attributions a
          WHERE a.dossier_id = (d->>'dossier_id')::uuid AND a.user_id = m.user_id)),
      'pieces', (SELECT coalesce(sum((d->'pieces'->>'transactions')::int + (d->'pieces'->>'factures')::int
        + (d->'pieces'->>'ecritures_brouillon')::int + (d->'pieces'->>'sans_justificatif')::int), 0)
        FROM jsonb_array_elements(dossiers) d WHERE m.role = 'responsable'
          OR EXISTS (SELECT 1 FROM public.cabinet_attributions a WHERE a.dossier_id = (d->>'dossier_id')::uuid AND a.user_id = m.user_id)))
      ORDER BY m.role, p.nom, m.user_id), '[]'::jsonb) INTO charge
    FROM public.cabinet_membres m LEFT JOIN public.profiles p ON p.user_id = m.user_id
    WHERE m.cabinet_id = cabinet AND m.actif;
  END IF;
  RETURN jsonb_build_object('cabinet_id', cabinet, 'responsable', responsable, 'dossiers', dossiers, 'charge', charge);
END
$fonction$;
REVOKE ALL ON FUNCTION public.tableau_cabinet(int, int, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tableau_cabinet(int, int, date) TO authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES ('20261102101000', 'tableau_cabinet', ARRAY[$migration_sql$
-- Calculs internes : aucun accès direct depuis une session de l'application.
CREATE OR REPLACE FUNCTION private.tva_liquidee(_societe uuid, _annee int, _mois int)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fonction$
  SELECT EXISTS (
    SELECT 1 FROM public.ecritures_comptables e
    WHERE e.societe_id = _societe AND e.annee = _annee AND e.mois = _mois AND e.statut = 'valide'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.lignes) l
        WHERE l->>'compte' LIKE '443%' AND l->>'compte' NOT LIKE '4438%'
          AND coalesce((l->>'debit')::numeric, 0) > 0)
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.lignes) l
        WHERE l->>'compte' LIKE '4441%' OR l->>'compte' LIKE '4449%'
          OR l->>'compte' ~ '^5[0-8]'
          OR (l->>'compte' LIKE '445%' AND coalesce((l->>'credit')::numeric, 0) > 0))
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(e.lignes) l WHERE l->>'compte' ~ '^[67]')
  )
$fonction$;

CREATE OR REPLACE FUNCTION private.du_social(_societe uuid, _prefixes text[], _avant date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fonction$
  -- Les paiements postérieurs à la période éteignent aussi sa dette.
  -- Comme dettesPaie : à partir des derniers à-nouveaux (journal AN) antérieurs
  -- à la période, qui reprennent les dettes des exercices clos ; sinon tout.
  WITH depart AS (
    SELECT coalesce(max(a.annee), -1) AS annee FROM public.ecritures_comptables a
    WHERE a.societe_id = _societe AND a.statut = 'valide' AND a.journal = 'AN'
      AND a.date < _avant
  )
  SELECT round(coalesce(sum(CASE WHEN e.date < _avant THEN coalesce((l->>'credit')::numeric, 0)
    ELSE 0 END - coalesce((l->>'debit')::numeric, 0)), 0))
  FROM public.ecritures_comptables e CROSS JOIN depart
  CROSS JOIN LATERAL jsonb_array_elements(e.lignes) l
  WHERE e.societe_id = _societe AND e.statut = 'valide' AND e.annee >= depart.annee
    AND EXISTS (SELECT 1 FROM unnest(_prefixes) p WHERE starts_with(l->>'compte', p))
$fonction$;
REVOKE ALL ON FUNCTION private.tva_liquidee(uuid, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.du_social(uuid, text[], date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.tva_liquidee(uuid, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION private.du_social(uuid, text[], date) TO service_role;

CREATE OR REPLACE FUNCTION public.tableau_cabinet(_annee int, _mois int, _aujourdhui date DEFAULT current_date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fonction$
DECLARE
  appelant uuid := auth.uid();
  cabinet uuid;
  responsable boolean;
  debut date;
  suivant date;
  dossiers jsonb;
  charge jsonb := NULL;
BEGIN
  SELECT m.cabinet_id INTO cabinet FROM public.cabinet_membres m
  JOIN public.cabinets c ON c.id = m.cabinet_id AND c.actif
  WHERE m.user_id = appelant AND m.actif;
  IF appelant IS NULL OR cabinet IS NULL THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Accès au tableau du cabinet refusé.' USING ERRCODE = '42501';
  END IF;
  IF _mois IS NULL OR _mois NOT BETWEEN 1 AND 12 OR _annee IS NULL
     OR _annee NOT BETWEEN 1 AND 9998 OR _aujourdhui IS NULL THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Période ou date invalide.';
  END IF;
  responsable := private.cabinet_responsable_actif(appelant, cabinet);
  debut := make_date(_annee, _mois, 1);
  suivant := (debut + interval '1 month')::date;

  WITH visibles AS MATERIALIZED (
    SELECT d.*, s.nom AS societe_nom
    FROM public.cabinet_dossiers d JOIN public.societes s ON s.id = d.societe_id
    WHERE d.cabinet_id = cabinet AND d.etat IN ('actif', 'depart_demande')
      -- Le contrôle d'attribution reste explicite même pour un membre ayant
      -- aussi un accès direct à une société ou un rôle global.
      AND (responsable OR EXISTS (SELECT 1 FROM public.cabinet_attributions a
        WHERE a.dossier_id = d.id AND a.user_id = appelant))
      AND public.cabinet_lit_dossier(appelant, d.id)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'dossier_id', d.id, 'societe_id', d.societe_id, 'societe_nom', d.societe_nom,
    'mission', d.mission, 'etat', d.etat,
    'echeances', (
      SELECT jsonb_agg(jsonb_build_object('type', t.type, 'annee', _annee, 'mois', _mois,
        'echeance', t.echeance, 'etat', CASE
          WHEN t.type = 'patente' AND t.echeance IS NULL THEN 'sans_objet'
          WHEN sd.id IS NOT NULL THEN 'faite'
          WHEN NOT t.concernee THEN 'sans_objet'
          WHEN t.faite THEN 'faite'
          WHEN _aujourdhui > t.echeance THEN 'en_retard' ELSE 'a_faire' END,
        'marquee', CASE WHEN sd.id IS NOT NULL THEN jsonb_build_object(
          'statut', sd.statut, 'date', sd.date, 'par_nom', nullif(btrim(p.nom), '')) ELSE NULL END)
        ORDER BY t.ordre)
      FROM (VALUES
        (1, 'TVA', suivant + 14,
          EXISTS (SELECT 1 FROM public.ecritures_comptables e, LATERAL jsonb_array_elements(e.lignes) l
            WHERE e.societe_id = d.societe_id AND e.statut = 'valide' AND e.annee = _annee AND e.mois = _mois
              AND (l->>'compte' LIKE '443%' OR l->>'compte' LIKE '445%')),
          private.tva_liquidee(d.societe_id, _annee, _mois)),
        (2, 'CNSS', suivant + 14,
          EXISTS (SELECT 1 FROM public.ecritures_comptables e, LATERAL jsonb_array_elements(e.lignes) l
            WHERE e.societe_id = d.societe_id AND e.statut = 'valide' AND e.annee = _annee AND e.mois = _mois
              AND (l->>'compte' LIKE '431%' OR l->>'compte' LIKE '433%') AND coalesce((l->>'credit')::numeric, 0) > 0),
          private.du_social(d.societe_id, ARRAY['431','433'], suivant) <= 0),
        (3, 'IRPP', suivant + 14,
          EXISTS (SELECT 1 FROM public.ecritures_comptables e, LATERAL jsonb_array_elements(e.lignes) l
            WHERE e.societe_id = d.societe_id AND e.statut = 'valide' AND e.annee = _annee AND e.mois = _mois
              AND l->>'compte' LIKE '447%' AND coalesce((l->>'credit')::numeric, 0) > 0),
          private.du_social(d.societe_id, ARRAY['447'], suivant) <= 0),
        (4, 'patente', CASE WHEN _mois IN (3,6,9,12) THEN debut + 14 END, _mois IN (3,6,9,12), false)
      ) AS t(ordre,type,echeance,concernee,faite)
      LEFT JOIN public.suivi_declarations sd ON sd.societe_id = d.societe_id
        AND sd.annee = _annee AND sd.mois = _mois AND sd.type = t.type
      LEFT JOIN public.profiles p ON p.user_id = sd.par
    ),
    'pieces', jsonb_build_object(
      'transactions', (SELECT count(*) FROM public.transactions t WHERE t.societe_id = d.societe_id AND t.statut = 'en_validation' AND t.deleted_at IS NULL),
      'factures', (SELECT count(*) FROM public.factures f WHERE f.societe_id = d.societe_id AND f.statut_validation = 'en_validation' AND f.deleted_at IS NULL),
      'ecritures_brouillon', (SELECT count(*) FROM public.ecritures_comptables e WHERE e.societe_id = d.societe_id AND e.statut = 'brouillon'),
      'sans_justificatif', (SELECT count(*) FROM public.transactions t WHERE t.societe_id = d.societe_id
        AND t.annee = _annee AND t.type = 'depense' AND t.auto IS FALSE AND t.deleted_at IS NULL AND nullif(btrim(t.piece_jointe), '') IS NULL)),
    'avancement', jsonb_build_object(
      'dernier_mois', (SELECT lpad(e.annee::text, 4, '0') || '-' || lpad(e.mois::text, 2, '0')
        FROM public.ecritures_comptables e WHERE e.societe_id = d.societe_id AND e.statut = 'valide'
        ORDER BY e.annee DESC, e.mois DESC LIMIT 1),
      'bulletins_faits', (SELECT count(*) FROM public.bulletins_paie b WHERE b.societe_id = d.societe_id AND b.annee = _annee AND b.mois = _mois),
      'bulletins_attendus', (SELECT count(*) FROM public.employes e WHERE e.societe_id = d.societe_id
        AND e.deleted_at IS NULL AND e.date_embauche < suivant AND (e.date_fin_contrat IS NULL OR e.date_fin_contrat >= debut)),
      'exercice_precedent_cloture', EXISTS (SELECT 1 FROM public.exercices e WHERE e.societe_id = d.societe_id AND e.annee = _annee - 1 AND e.statut = 'cloture'))
    ) ORDER BY d.societe_nom, d.id), '[]'::jsonb) INTO dossiers FROM visibles d;

  IF responsable THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id,
      'nom', coalesce(nullif(btrim(p.nom), ''), 'Membre du cabinet'), 'role', m.role,
      'dossiers', (SELECT count(*) FROM jsonb_array_elements(dossiers) d
        WHERE m.role = 'responsable' OR EXISTS (SELECT 1 FROM public.cabinet_attributions a
          WHERE a.dossier_id = (d->>'dossier_id')::uuid AND a.user_id = m.user_id)),
      'pieces', (SELECT coalesce(sum((d->'pieces'->>'transactions')::int + (d->'pieces'->>'factures')::int
        + (d->'pieces'->>'ecritures_brouillon')::int + (d->'pieces'->>'sans_justificatif')::int), 0)
        FROM jsonb_array_elements(dossiers) d WHERE m.role = 'responsable'
          OR EXISTS (SELECT 1 FROM public.cabinet_attributions a WHERE a.dossier_id = (d->>'dossier_id')::uuid AND a.user_id = m.user_id)))
      ORDER BY m.role, p.nom, m.user_id), '[]'::jsonb) INTO charge
    FROM public.cabinet_membres m LEFT JOIN public.profiles p ON p.user_id = m.user_id
    WHERE m.cabinet_id = cabinet AND m.actif;
  END IF;
  RETURN jsonb_build_object('cabinet_id', cabinet, 'responsable', responsable, 'dossiers', dossiers, 'charge', charge);
END
$fonction$;
REVOKE ALL ON FUNCTION public.tableau_cabinet(int, int, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tableau_cabinet(int, int, date) TO authenticated, service_role;
$migration_sql$])
ON CONFLICT (version) DO NOTHING;
COMMIT;
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version IN ('20261102090000', '20261102100000', '20261102101000') ORDER BY version;
