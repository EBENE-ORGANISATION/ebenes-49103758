-- ============================================================================
-- Migration : table ecritures_comptables
-- Persistance des écritures SYSCOHADA (anciennement en local state).
-- Suit le même pattern que transactions, factures, etc.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ecritures_comptables (
  id            bigserial    PRIMARY KEY,
  societe_id    uuid         NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee         integer      NOT NULL,
  mois          integer      NOT NULL CHECK (mois BETWEEN 1 AND 12),
  journal       text         NOT NULL CHECK (journal IN ('AC','VE','BQ','CA','OD','AN')),
  numero_piece  text         NOT NULL DEFAULT '',
  libelle       text         NOT NULL DEFAULT '',
  lignes        jsonb        NOT NULL DEFAULT '[]',
  statut        text         NOT NULL DEFAULT 'brouillon'
                             CHECK (statut IN ('brouillon','valide','cloture')),
  facture_id    bigint       REFERENCES public.factures(id) ON DELETE SET NULL,
  bulletin_id   uuid         REFERENCES public.bulletins_paie(id) ON DELETE SET NULL,
  cree_par      uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  valide_par    uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  motif_rejet   text,
  piece_jointe      text,
  piece_jointe_nom  text,
  piece_jointe_type text,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

-- ── Index de performance ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ecritures_societe_mois
  ON public.ecritures_comptables(societe_id, annee, mois);

CREATE INDEX IF NOT EXISTS idx_ecritures_journal
  ON public.ecritures_comptables(societe_id, journal);

CREATE INDEX IF NOT EXISTS idx_ecritures_statut
  ON public.ecritures_comptables(societe_id, statut);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.ecritures_comptables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ecritures_societe_access" ON public.ecritures_comptables
  FOR ALL
  USING (
    societe_id IN (
      SELECT s.id FROM public.societes s
      WHERE
        s.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.services_membres sm
          WHERE sm.societe_id = s.id AND sm.user_id = auth.uid()
        )
    )
  );

-- ── Trigger updated_at ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_ecritures_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ecritures_updated_at
  BEFORE UPDATE ON public.ecritures_comptables
  FOR EACH ROW EXECUTE FUNCTION public.set_ecritures_updated_at();
