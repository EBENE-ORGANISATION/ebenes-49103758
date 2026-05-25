-- P1 : Écritures comptables — date comptable explicite
-- La colonne created_at existe déjà mais représente l'horodatage de création,
-- pas la date comptable (qui peut être rétro-datée ou proforma).
-- Par défaut on backfill avec la date de création si existante.

ALTER TABLE public.ecritures_comptables
  ADD COLUMN IF NOT EXISTS date date;

-- Backfill pour les lignes existantes : extrait la date de created_at
UPDATE public.ecritures_comptables
   SET date = created_at::date
 WHERE date IS NULL;
