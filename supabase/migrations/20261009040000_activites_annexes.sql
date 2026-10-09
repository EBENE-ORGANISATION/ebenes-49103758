-- Décision du 2026-10-09 : une activité peut être une annexe (autre site),
-- avec son adresse et son téléphone (imprimés sur ses factures) et sa propre
-- caisse (sous-compte de 571, ex. 5711). Vide : coordonnées de la société et
-- caisse principale 571.
ALTER TABLE public.activites
  ADD COLUMN IF NOT EXISTS adresse text,
  ADD COLUMN IF NOT EXISTS telephone text,
  ADD COLUMN IF NOT EXISTS compte_caisse text
    CHECK (compte_caisse IS NULL OR compte_caisse ~ '^57[0-9]{2,6}$');
