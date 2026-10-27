-- Ajout des modules Assistant IA et Multi-sociétés à societe_config
ALTER TABLE public.societe_config
  ADD COLUMN IF NOT EXISTS module_ia BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS module_multi_societes BOOLEAN NOT NULL DEFAULT false;