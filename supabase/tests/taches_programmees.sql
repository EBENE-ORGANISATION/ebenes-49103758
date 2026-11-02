BEGIN;
-- À exécuter en propriétaire après la migration 20261102120000.
-- Seul un nom invalide est appelé : aucun appel HTTP ne doit partir.
DO $$
DECLARE
  fonction regprocedure := to_regprocedure('private.appeler_fonction_interne(text, jsonb)');
  refus_obtenu boolean := false;
  commande text;
BEGIN
  ASSERT fonction IS NOT NULL, 'La fonction interne est absente';
  ASSERT NOT has_function_privilege('anon', fonction, 'EXECUTE'),
    'La fonction interne est exécutable par anon';
  ASSERT NOT has_function_privilege('authenticated', fonction, 'EXECUTE'),
    'La fonction interne est exécutable par authenticated';
  ASSERT has_function_privilege('service_role', fonction, 'EXECUTE'),
    'La fonction interne doit être exécutable par service_role';

  BEGIN
    PERFORM private.appeler_fonction_interne('x/../y');
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE 'FONCTION_INVALIDE:%',
      'Le refus doit précéder toute lecture du coffre : ' || SQLERRM;
    refus_obtenu := true;
  END;
  ASSERT refus_obtenu, 'Le nom de fonction invalide doit être refusé';

  ASSERT (SELECT count(*) = 1 FROM cron.job WHERE jobname = 'notification-alertes-daily'),
    'Une seule tâche quotidienne des alertes doit exister';
  ASSERT (SELECT schedule = '0 8 * * *' FROM cron.job WHERE jobname = 'notification-alertes-daily'),
    'Les alertes doivent être programmées à 08:00 UTC';
  SELECT command INTO commande FROM cron.job WHERE jobname = 'notification-alertes-daily';
  ASSERT position('private.appeler_fonction_interne(''notification-alertes''' IN commande) > 0,
    'La tâche doit appeler la fonction interne des alertes';
  ASSERT position('nmeyylvltlvvcvbhvxpz' IN commande) = 0,
    'La commande contient encore la référence de l’ancien projet';
  ASSERT position('eyJ' IN commande) = 0,
    'La commande contient encore un jeton';

  RAISE NOTICE 'OK taches_programmees';
END;
$$;
ROLLBACK;
