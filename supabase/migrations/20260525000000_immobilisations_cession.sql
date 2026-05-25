-- P0 : Immobilisations — statut, cession, plus/moins-value, soft-delete
-- Colonnes absentes qui bloquent les sorties d'inventaire depuis le front-end.

ALTER TABLE public.immobilisations
  ADD COLUMN IF NOT EXISTS statut           text    NOT NULL DEFAULT 'actif',
  ADD COLUMN IF NOT EXISTS valeur_cession   numeric,
  ADD COLUMN IF NOT EXISTS plus_moins_value numeric,
  ADD COLUMN IF NOT EXISTS deleted_at       timestamptz;

-- Contrainte CHECK sur statut
ALTER TABLE public.immobilisations
  ADD CONSTRAINT IF NOT EXISTS immo_statut_check
  CHECK (statut IN ('actif', 'cede', 'rebut'));

-- Index pour les soft-deletes (n'indexe que les lignes supprimées, coût quasi nul)
CREATE INDEX IF NOT EXISTS idx_immobilisations_deleted_at
  ON public.immobilisations (societe_id, deleted_at)
  WHERE deleted_at IS NOT NULL;
