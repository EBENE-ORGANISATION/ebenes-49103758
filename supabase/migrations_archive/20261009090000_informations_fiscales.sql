-- Décision du 2026-10-09 : informations annuelles des états financiers non
-- déductibles de la comptabilité (réintégrations et déductions fiscales,
-- déficits antérieurs, engagements hors bilan, actifs et passifs éventuels).
CREATE TABLE IF NOT EXISTS public.informations_fiscales (
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee integer NOT NULL,
  donnees jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (societe_id, annee)
);
ALTER TABLE public.informations_fiscales ENABLE ROW LEVEL SECURITY;

CREATE POLICY informations_fiscales_select ON public.informations_fiscales FOR SELECT TO authenticated
  USING (public.est_personnel((SELECT auth.uid()), societe_id));
CREATE POLICY informations_fiscales_ecriture ON public.informations_fiscales FOR ALL TO authenticated
  USING (
    public.is_admin_general((SELECT auth.uid()))
    OR (public.has_societe_access((SELECT auth.uid()), societe_id)
        AND (public.is_admin((SELECT auth.uid())) OR public.in_service_compta((SELECT auth.uid()))))
  )
  WITH CHECK (
    public.is_admin_general((SELECT auth.uid()))
    OR (public.has_societe_access((SELECT auth.uid()), societe_id)
        AND (public.is_admin((SELECT auth.uid())) OR public.in_service_compta((SELECT auth.uid()))))
  );
