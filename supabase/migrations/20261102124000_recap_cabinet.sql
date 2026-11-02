-- Calcul interne ; l'enveloppe publique ne donne accès qu'au service d'envoi.
CREATE OR REPLACE FUNCTION private.recap_cabinet(_dossier uuid, _fin timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  lien public.cabinet_dossiers%ROWTYPE;
  resultat jsonb;
BEGIN
  SELECT * INTO lien FROM public.cabinet_dossiers WHERE id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECAP_INTROUVABLE: Dossier introuvable.';
  END IF;

  WITH lignes AS MATERIALIZED (
    SELECT * FROM public.audit_log
    WHERE societe_id = lien.societe_id AND cabinet_id = lien.cabinet_id
      AND created_at >= _fin - interval '7 days' AND created_at < _fin
  ), declarations AS (
    SELECT DISTINCT new_data->>'type' AS type, (new_data->>'annee')::integer AS annee,
      (new_data->>'mois')::integer AS mois, new_data->>'statut' AS statut
    FROM lignes WHERE table_name = 'suivi_declarations' AND action IN ('INSERT', 'UPDATE')
  ), personnes AS (
    SELECT a.user_id, coalesce(nullif(p.nom, ''), nullif(p.email, ''),
      min(nullif(a.user_email, '')), 'Personne inconnue') AS nom, count(*) AS actions
    FROM lignes a LEFT JOIN public.profiles p ON p.user_id = a.user_id
    GROUP BY a.user_id, p.nom, p.email
  )
  SELECT jsonb_build_object(
    'cabinet', (SELECT nom FROM public.cabinets WHERE id = lien.cabinet_id),
    'societe', (SELECT nom FROM public.societes WHERE id = lien.societe_id),
    'debut', _fin - interval '7 days', 'fin', _fin,
    'actions', jsonb_build_object(
      'transactions', count(*) FILTER (WHERE table_name = 'transactions'),
      'factures', count(*) FILTER (WHERE table_name = 'factures'),
      'ecritures', count(*) FILTER (WHERE table_name = 'ecritures'),
      'bulletins', count(*) FILTER (WHERE table_name = 'bulletins'),
      'suivi_declarations', count(*) FILTER (WHERE table_name = 'suivi_declarations'),
      'autres', count(*) FILTER (WHERE table_name NOT IN ('transactions','factures','ecritures','bulletins','suivi_declarations'))
    ),
    'total', count(*),
    'validations', count(*) FILTER (WHERE action LIKE 'VALIDER\_%' ESCAPE '\'
      OR (action = 'UPDATE'
        AND coalesce(old_data->>'statut_validation', old_data->>'statut') = 'en_validation'
        AND coalesce(new_data->>'statut_validation', new_data->>'statut') = 'valide')),
    'declarations', (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY type, annee, mois, statut), '[]'::jsonb) FROM declarations d),
    'personnes', (SELECT coalesce(jsonb_agg(jsonb_build_object('nom', nom, 'actions', actions)
      ORDER BY actions DESC, nom, user_id), '[]'::jsonb) FROM personnes),
    -- to_jsonb permet aussi les schémas où deleted_at est absent.
    'en_attente_client', jsonb_build_object(
      'transactions', (SELECT count(*) FROM public.transactions t WHERE t.societe_id = lien.societe_id
        AND t.statut = 'en_validation' AND to_jsonb(t)->>'deleted_at' IS NULL),
      'factures', (SELECT count(*) FROM public.factures f WHERE f.societe_id = lien.societe_id
        AND f.statut_validation = 'en_validation' AND to_jsonb(f)->>'deleted_at' IS NULL)
    )
  ) INTO resultat FROM lignes;
  RETURN resultat;
END;
$$;
REVOKE ALL ON FUNCTION private.recap_cabinet(uuid, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.recap_cabinet(uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.recap_cabinet_service(_dossier uuid, _fin timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT private.recap_cabinet(_dossier, _fin) $$;
REVOKE ALL ON FUNCTION public.recap_cabinet_service(uuid, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recap_cabinet_service(uuid, timestamptz) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recap-cabinet-hebdo') THEN
    PERFORM cron.unschedule('recap-cabinet-hebdo');
  END IF;
END;
$$;
SELECT cron.schedule('recap-cabinet-hebdo', '0 7 * * 1',
  $$SELECT private.appeler_fonction_interne('recap-cabinet-hebdo')$$);
