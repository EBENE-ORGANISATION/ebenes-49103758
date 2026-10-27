-- Décision du 2026-10-09 : la taxe de séjour est facultative, facture par
-- facture. Montant hors TVA, ajouté au total payé par le client et collecté
-- pour le compte de l'État ou de la commune (compte 442).
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS taxe_sejour numeric NOT NULL DEFAULT 0;
