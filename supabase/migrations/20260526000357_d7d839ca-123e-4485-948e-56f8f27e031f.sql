-- Migration 1 — immobilisations (add statut, valeur_cession, plus_moins_value, deleted_at)
ALTER TABLE public.immobilisations
  ADD COLUMN IF NOT EXISTS statut           text    NOT NULL DEFAULT 'actif',
  ADD COLUMN IF NOT EXISTS valeur_cession   numeric,
  ADD COLUMN IF NOT EXISTS plus_moins_value numeric,
  ADD COLUMN IF NOT EXISTS deleted_at       timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'immo_statut_check'
      AND conrelid = 'public.immobilisations'::regclass
  ) THEN
    ALTER TABLE public.immobilisations
      ADD CONSTRAINT immo_statut_check
      CHECK (statut IN ('actif', 'cede', 'rebut'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_immobilisations_deleted_at
  ON public.immobilisations (societe_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Migration 2 — ecritures_comptables (add date column)
ALTER TABLE public.ecritures_comptables
  ADD COLUMN IF NOT EXISTS date date;

UPDATE public.ecritures_comptables
   SET date = created_at::date
 WHERE date IS NULL;

-- Migration 3 — taux_historique (add UNIQUE constraint)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'taux_historique_societe_date_key'
      AND conrelid = 'public.taux_historique'::regclass
  ) THEN
    ALTER TABLE public.taux_historique
      ADD CONSTRAINT taux_historique_societe_date_key
      UNIQUE (societe_id, date_effet);
  END IF;
END$$;

-- Migration 4 — app_module enum (add 'portail' value)
ALTER TYPE public.app_module ADD VALUE IF NOT EXISTS 'portail';