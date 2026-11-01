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
