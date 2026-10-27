-- Décision du 2026-10-09 : le stock apparaît au bilan (variation de stock en
-- fin de mois). La nature d'un article détermine son compte de stock :
-- marchandise (31), matière première / denrée (32), consommable (33).
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS nature text NOT NULL DEFAULT 'marchandise'
  CHECK (nature IN ('marchandise', 'matiere', 'consommable'));
