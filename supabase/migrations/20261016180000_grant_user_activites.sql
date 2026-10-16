-- La table des droits par activité (20261009050000) n'avait aucun GRANT :
-- chaque lecture renvoyait 403 et l'écran d'attribution des activités ne
-- pouvait rien enregistrer. Les politiques RLS existantes restent la règle.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_activites TO authenticated;
