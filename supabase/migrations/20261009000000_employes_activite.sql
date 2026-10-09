-- Décision du 2026-10-08 : un employé peut être rattaché à une activité de la
-- société (Hôtellerie, Services d'entretien…). Sa paie (écritures et paiement
-- du net) est alors comptée dans cette activité.
ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS activite_id uuid REFERENCES public.activites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employes_activite_id_idx ON public.employes (activite_id);
