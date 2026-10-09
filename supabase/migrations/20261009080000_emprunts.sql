-- Décision du 2026-10-09 : suivi des emprunts (échéancier, remboursements,
-- garanties) pour la comptabilité et les notes 1 et 16A des états financiers.
CREATE TABLE IF NOT EXISTS public.emprunts (
  id bigserial PRIMARY KEY,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  preteur text NOT NULL,
  objet text,
  montant numeric NOT NULL CHECK (montant > 0),
  taux_annuel numeric NOT NULL DEFAULT 0 CHECK (taux_annuel >= 0),
  duree_mois integer NOT NULL CHECK (duree_mois > 0),
  periodicite text NOT NULL DEFAULT 'mensuelle' CHECK (periodicite IN ('mensuelle', 'trimestrielle', 'semestrielle', 'annuelle')),
  date_deblocage date NOT NULL,
  compte text NOT NULL DEFAULT '162',
  tresorerie text NOT NULL DEFAULT '521',
  garantie text CHECK (garantie IS NULL OR garantie IN ('hypotheque', 'nantissement', 'gage', 'caution', 'autre')),
  montant_garanti numeric,
  activite_id uuid REFERENCES public.activites(id) ON DELETE SET NULL,
  cree_par uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS emprunts_societe_idx ON public.emprunts (societe_id);
ALTER TABLE public.emprunts ENABLE ROW LEVEL SECURITY;

CREATE POLICY emprunts_select ON public.emprunts FOR SELECT TO authenticated
  USING (public.est_personnel((SELECT auth.uid()), societe_id));
CREATE POLICY emprunts_ecriture ON public.emprunts FOR ALL TO authenticated
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
-- Droits par activité (comme les autres tables rattachées à une activité)
CREATE POLICY activite_restriction ON public.emprunts AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.activite_autorisee((SELECT auth.uid()), societe_id, activite_id))
  WITH CHECK (public.activite_autorisee((SELECT auth.uid()), societe_id, activite_id));
-- Déblocage et remboursements : écritures EMP-<id>-<n° d'échéance> (0 = déblocage)
