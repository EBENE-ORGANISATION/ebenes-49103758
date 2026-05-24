-- ============================================================================
-- Migration Fiscalité EBENE — Régime fiscal Togo (CGI 2025)
-- Enums, colonnes sur societes, table fiscal_delegations, RLS
-- ============================================================================

-- ─── 1. Enums ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.regime_fiscal_enum AS ENUM (
    'IS',   -- Impôt sur les Sociétés (SA, SARL — bénéfice net 27%)
    'IMF',  -- Impôt Minimum Forfaitaire (1 % CA HT, min 200 000 FCFA)
    'TPU',  -- Taxe Professionnelle Unique (petits contribuables < 60M)
    'BE',   -- Banques & Établissements de crédit (TAF 10%)
    'ASS',  -- Assurances (TCA taux variables)
    'TEL',  -- Télécommunications (TETTIC 5%)
    'TI'    -- Transferts Internationaux (TETTIC 5%)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.secteur_activite_enum AS ENUM (
    'CO',   -- Commerce général
    'HO',   -- Hôtellerie & Restauration
    'PH',   -- Pharmacie
    'SE',   -- Services (hors secteurs spéciaux)
    'BTP',  -- BTP & Travaux publics
    'ASS',  -- Assurances
    'BE',   -- Banques & Établissements de crédit
    'TEL',  -- Télécommunications
    'TI',   -- Transferts Internationaux
    'IND',  -- Industrie & Manufacture
    'AGRI', -- Agriculture & Élevage
    'AUT'   -- Autres / Non classé
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Colonnes fiscales sur la table societes ────────────────────────────

ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS regime_fiscal      public.regime_fiscal_enum    DEFAULT 'IS',
  ADD COLUMN IF NOT EXISTS secteur_activite   public.secteur_activite_enum DEFAULT 'SE',
  ADD COLUMN IF NOT EXISTS assujetti_tva      boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS set_impots         jsonb    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ca_annuel_estime   numeric(18, 0) DEFAULT 0;

-- ─── 3. Table fiscal_delegations ──────────────────────────────────────────
-- Permet à un admin de déléguer l'accès fiscal à un expert-comptable, etc.

CREATE TABLE IF NOT EXISTS public.fiscal_delegations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id       uuid        NOT NULL REFERENCES public.societes(id)  ON DELETE CASCADE,
  delegue_user_id  uuid        NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  granted_by       uuid        NOT NULL REFERENCES auth.users(id),
  granted_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz,
  is_active        boolean     NOT NULL DEFAULT true,
  note             text,
  UNIQUE (societe_id, delegue_user_id)
);

ALTER TABLE public.fiscal_delegations ENABLE ROW LEVEL SECURITY;

-- ─── 4. RLS fiscal_delegations ────────────────────────────────────────────

-- Super-admin : accès total
DROP POLICY IF EXISTS "fiscal_delegations_super_admin_all" ON public.fiscal_delegations;
CREATE POLICY "fiscal_delegations_super_admin_all" ON public.fiscal_delegations
  FOR ALL TO authenticated
  USING  (public.is_admin_general(auth.uid()))
  WITH CHECK (public.is_admin_general(auth.uid()));

-- Admin société : lecture de ses délégations
DROP POLICY IF EXISTS "fiscal_delegations_admin_read" ON public.fiscal_delegations;
CREATE POLICY "fiscal_delegations_admin_read" ON public.fiscal_delegations
  FOR SELECT TO authenticated
  USING (public.has_societe_access(auth.uid(), societe_id));

-- Admin société : gérer (insert / update / delete) ses délégations
DROP POLICY IF EXISTS "fiscal_delegations_admin_manage" ON public.fiscal_delegations;
CREATE POLICY "fiscal_delegations_admin_manage" ON public.fiscal_delegations
  FOR ALL TO authenticated
  USING  (public.is_admin(auth.uid()) AND public.has_societe_access(auth.uid(), societe_id))
  WITH CHECK (public.is_admin(auth.uid()) AND public.has_societe_access(auth.uid(), societe_id));

-- Délégué : voit les délégations actives qui le concernent
DROP POLICY IF EXISTS "fiscal_delegations_delegue_read" ON public.fiscal_delegations;
CREATE POLICY "fiscal_delegations_delegue_read" ON public.fiscal_delegations
  FOR SELECT TO authenticated
  USING (delegue_user_id = auth.uid() AND is_active = true);

-- ─── 5. Index ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS fiscal_delegations_societe_idx
  ON public.fiscal_delegations (societe_id, is_active);

CREATE INDEX IF NOT EXISTS fiscal_delegations_delegue_idx
  ON public.fiscal_delegations (delegue_user_id, is_active);
