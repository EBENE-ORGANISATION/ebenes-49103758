-- Droits des tables des états financiers (le projet n'accorde pas de droits
-- par défaut aux nouvelles tables ; l'accès reste filtré par les politiques RLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.societe_identification TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emprunts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.informations_fiscales TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.emprunts_id_seq TO authenticated;
GRANT ALL ON public.societe_identification, public.exercices, public.emprunts, public.informations_fiscales TO service_role;
GRANT ALL ON SEQUENCE public.emprunts_id_seq TO service_role;
