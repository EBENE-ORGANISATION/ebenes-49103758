-- Anomalie 77 : « dernier mois saisi » prenait les écritures datées dans le
-- futur, comme les dotations aux amortissements de l'exercice passées
-- d'avance au 31 décembre. Seules les écritures datées au plus tard du jour
-- de consultation comptent désormais. Le reste de la fonction est inchangé.
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
          AND e.date <= _aujourdhui
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
