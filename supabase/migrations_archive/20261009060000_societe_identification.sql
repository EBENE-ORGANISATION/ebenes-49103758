-- Décision du 2026-10-09 : identification complète de la société pour les
-- états financiers (fiches d'identification, dirigeants, associés, capital).
-- Une ligne par société ; rubriques dans `donnees` (JSON) : forme juridique,
-- capital, CNSS employeur, code activité, banques, dirigeants, associés…
-- Lecture : personnel de la société (pas les simples employés, ces données
-- contiennent des coordonnées personnelles) ; écriture : administrateurs et
-- chefs comptables.
CREATE TABLE IF NOT EXISTS public.societe_identification (
  societe_id uuid PRIMARY KEY REFERENCES public.societes(id) ON DELETE CASCADE,
  donnees jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.societe_identification ENABLE ROW LEVEL SECURITY;

CREATE POLICY societe_identification_select ON public.societe_identification FOR SELECT TO authenticated
  USING (public.est_personnel((SELECT auth.uid()), societe_id));

CREATE POLICY societe_identification_ecriture ON public.societe_identification FOR ALL TO authenticated
  USING (
    public.is_admin_general((SELECT auth.uid()))
    OR (public.has_societe_access((SELECT auth.uid()), societe_id)
        AND (public.is_admin((SELECT auth.uid())) OR public.is_chef_compta((SELECT auth.uid()))))
  )
  WITH CHECK (
    public.is_admin_general((SELECT auth.uid()))
    OR (public.has_societe_access((SELECT auth.uid()), societe_id)
        AND (public.is_admin((SELECT auth.uid())) OR public.is_chef_compta((SELECT auth.uid()))))
  );
