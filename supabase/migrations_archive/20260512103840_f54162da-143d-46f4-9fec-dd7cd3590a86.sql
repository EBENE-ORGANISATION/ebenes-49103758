-- ============================================================================
-- Migration B.3 — Création des tables manquantes pour la migration relationnelle
-- EBENE v2 — Chantier B : isolation multi-tenant par RLS Postgres
-- ============================================================================

-- ── 1. Table `transactions` (données comptables) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  societe_id      uuid   NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee           integer NOT NULL,
  mois            integer NOT NULL CHECK (mois BETWEEN 1 AND 12),
  date            date    NOT NULL,
  libelle         text    NOT NULL DEFAULT '',
  montant         numeric(15, 2) NOT NULL,
  type            text    NOT NULL CHECK (type IN ('r', 'd')),
  source          text    NOT NULL DEFAULT 'manuelle'
                    CHECK (source IN ('manuelle', 'facture', 'salaires', 'fournisseur')),
  facture_id      bigint  REFERENCES public.factures(id) ON DELETE SET NULL,
  activite        text    CHECK (activite IN ('service', 'commerce')),
  piece_jointe    text,
  piece_jointe_nom  text,
  piece_jointe_type text,
  fournisseur     text,
  auto            boolean NOT NULL DEFAULT false,
  statut_validation text  NOT NULL DEFAULT 'en_validation'
                    CHECK (statut_validation IN ('brouillon','en_validation','valide','rejete')),
  motif_rejet     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.transactions
  USING (public.has_societe_access(auth.uid(), societe_id));

CREATE INDEX IF NOT EXISTS transactions_societe_annee_mois_idx
  ON public.transactions(societe_id, annee, mois);

-- ── 2. Table `retenues` (retenues mensuelles par employé) ─────────────────────
CREATE TABLE IF NOT EXISTS public.retenues (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  societe_id  uuid    NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  employe_id  integer NOT NULL,
  annee       integer NOT NULL,
  mois        integer NOT NULL CHECK (mois BETWEEN 1 AND 12),
  montant     numeric(15, 2) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (societe_id, employe_id, annee, mois)
);

ALTER TABLE public.retenues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.retenues
  USING (public.has_societe_access(auth.uid(), societe_id));

CREATE INDEX IF NOT EXISTS retenues_societe_annee_mois_idx
  ON public.retenues(societe_id, annee, mois);

-- ── 3. Table `sanctions` (sanctions disciplinaires) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.sanctions (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  societe_id    uuid    NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  employe_id    integer NOT NULL,
  date          date    NOT NULL,
  type          text    NOT NULL
                  CHECK (type IN (
                    'avertissement_oral',
                    'avertissement_ecrit',
                    'blame',
                    'mise_a_pied',
                    'licenciement_faute_simple',
                    'licenciement_faute_grave',
                    'licenciement_faute_lourde'
                  )),
  motif         text    NOT NULL DEFAULT '',
  jours_mise_a_pied integer,
  observations  text,
  statut_validation text NOT NULL DEFAULT 'valide'
                  CHECK (statut_validation IN ('brouillon','en_validation','valide','rejete')),
  motif_rejet   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sanctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.sanctions
  USING (public.has_societe_access(auth.uid(), societe_id));

CREATE INDEX IF NOT EXISTS sanctions_societe_employe_idx
  ON public.sanctions(societe_id, employe_id);

-- ── 4. Triggers updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER retenues_updated_at
  BEFORE UPDATE ON public.retenues
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER sanctions_updated_at
  BEFORE UPDATE ON public.sanctions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
