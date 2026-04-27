-- ═══════════════════════════════════════════════════════════════════════════
-- Tables métier multi-tenant : ajoute uniquement ce qui manque.
-- Utilise les helpers RLS déjà en place : has_societe_access, is_admin_general,
-- is_admin, in_service_compta, in_service_grh.
-- IDs en BIGINT pour matcher les types TS (Transaction.id: number, etc.).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── EMPLOYES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employes (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  poste TEXT NOT NULL DEFAULT '',
  salaire NUMERIC NOT NULL DEFAULT 0,
  situation TEXT NOT NULL DEFAULT 'celibataire',
  enfants INTEGER NOT NULL DEFAULT 0,
  matricule TEXT,
  date_naissance DATE,
  lieu_naissance TEXT,
  sexe TEXT,
  nationalite TEXT,
  adresse TEXT,
  telephone TEXT,
  email TEXT,
  num_cnss TEXT,
  cni TEXT,
  type_contrat TEXT,
  date_embauche DATE,
  date_fin_contrat DATE,
  categorie TEXT,
  echelon INTEGER,
  qualification TEXT,
  indemnite_transport NUMERIC DEFAULT 0,
  indemnite_logement NUMERIC DEFAULT 0,
  indemnite_fonction NUMERIC DEFAULT 0,
  sursalaire NUMERIC DEFAULT 0,
  solde_conges NUMERIC DEFAULT 0,
  user_id UUID,
  statut_validation TEXT DEFAULT 'en_validation',
  motif_rejet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employes_societe ON public.employes(societe_id);
CREATE INDEX IF NOT EXISTS idx_employes_user ON public.employes(user_id);

-- ─── TRANSACTIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee INTEGER NOT NULL,
  mois INTEGER NOT NULL,
  date DATE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  montant NUMERIC NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manuelle',
  facture_id BIGINT,
  activite TEXT,
  piece_jointe TEXT,
  piece_jointe_nom TEXT,
  piece_jointe_type TEXT,
  fournisseur TEXT,
  auto BOOLEAN DEFAULT false,
  statut TEXT DEFAULT 'en_validation',
  motif_rejet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transactions_societe_periode ON public.transactions(societe_id, annee, mois);

-- ─── FACTURES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.factures (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee INTEGER NOT NULL,
  mois INTEGER NOT NULL,
  numero TEXT NOT NULL,
  client TEXT NOT NULL,
  date DATE NOT NULL,
  lignes JSONB NOT NULL DEFAULT '[]'::jsonb,
  reduction NUMERIC DEFAULT 0,
  avec_tva BOOLEAN DEFAULT false,
  statut TEXT NOT NULL DEFAULT 'en_attente',
  transaction_id BIGINT,
  total_ht NUMERIC NOT NULL DEFAULT 0,
  total_tva NUMERIC NOT NULL DEFAULT 0,
  total_ttc NUMERIC NOT NULL DEFAULT 0,
  activite TEXT,
  statut_validation TEXT DEFAULT 'en_validation',
  motif_rejet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_factures_societe_periode ON public.factures(societe_id, annee, mois);

-- ─── DEVIS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.devis (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee INTEGER NOT NULL,
  mois INTEGER NOT NULL,
  numero TEXT NOT NULL,
  client TEXT NOT NULL,
  date DATE NOT NULL,
  date_validite DATE,
  lignes JSONB NOT NULL DEFAULT '[]'::jsonb,
  reduction NUMERIC DEFAULT 0,
  avec_tva BOOLEAN DEFAULT false,
  statut TEXT NOT NULL DEFAULT 'brouillon',
  total_ht NUMERIC NOT NULL DEFAULT 0,
  total_tva NUMERIC NOT NULL DEFAULT 0,
  total_ttc NUMERIC NOT NULL DEFAULT 0,
  activite TEXT,
  facture_id BIGINT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_devis_societe_periode ON public.devis(societe_id, annee, mois);

-- ─── FOURNISSEURS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fournisseurs (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  contact TEXT,
  telephone TEXT,
  email TEXT,
  adresse TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fournisseurs_societe ON public.fournisseurs(societe_id);

-- ─── CATEGORIES STOCK ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories_stock (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_categories_stock_societe ON public.categories_stock(societe_id);

-- ─── ARTICLES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.articles (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  designation TEXT NOT NULL,
  categorie_id BIGINT,
  unite TEXT NOT NULL DEFAULT 'pièce',
  prix_achat NUMERIC NOT NULL DEFAULT 0,
  prix_vente NUMERIC NOT NULL DEFAULT 0,
  stock NUMERIC NOT NULL DEFAULT 0,
  seuil_alerte NUMERIC NOT NULL DEFAULT 0,
  fournisseur_id BIGINT,
  emplacement TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_articles_societe ON public.articles(societe_id);

-- ─── MOUVEMENTS STOCK ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mouvements_stock (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee INTEGER NOT NULL,
  mois INTEGER NOT NULL,
  date DATE NOT NULL,
  article_id BIGINT NOT NULL,
  type TEXT NOT NULL,
  quantite NUMERIC NOT NULL,
  prix_unitaire NUMERIC,
  motif TEXT,
  reference TEXT,
  facture_id BIGINT,
  transaction_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mouvements_societe_periode ON public.mouvements_stock(societe_id, annee, mois);

-- ─── SANCTIONS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sanctions (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  employe_id BIGINT NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL,
  motif TEXT NOT NULL DEFAULT '',
  jours_mise_a_pied INTEGER,
  observations TEXT,
  statut_validation TEXT DEFAULT 'en_validation',
  motif_rejet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sanctions_societe ON public.sanctions(societe_id);

-- ─── IMMOBILISATIONS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.immobilisations (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  libelle TEXT NOT NULL,
  categorie TEXT,
  date_acquisition DATE NOT NULL,
  valeur_origine NUMERIC NOT NULL DEFAULT 0,
  duree_amortissement INTEGER NOT NULL DEFAULT 1,
  methode TEXT NOT NULL DEFAULT 'lineaire',
  comptes_syscohada JSONB NOT NULL DEFAULT '{}'::jsonb,
  valeur_residuelle NUMERIC,
  date_cession DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_immobilisations_societe ON public.immobilisations(societe_id);

-- ─── TAUX HISTORIQUE ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.taux_historique (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  date_effet DATE NOT NULL,
  tva NUMERIC NOT NULL DEFAULT 0.18,
  is_taux NUMERIC NOT NULL DEFAULT 0.27,
  imf_taux NUMERIC NOT NULL DEFAULT 0.01,
  imf_min NUMERIC NOT NULL DEFAULT 20000,
  patente_service NUMERIC NOT NULL DEFAULT 0.0075,
  patente_commerce NUMERIC NOT NULL DEFAULT 0.0055,
  cnss_sal NUMERIC NOT NULL DEFAULT 0.04,
  cnss_emp NUMERIC NOT NULL DEFAULT 0.175,
  amu_sal NUMERIC NOT NULL DEFAULT 0.05,
  amu_emp NUMERIC NOT NULL DEFAULT 0.05,
  activite_defaut TEXT NOT NULL DEFAULT 'service',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_taux_societe_date ON public.taux_historique(societe_id, date_effet);

-- ─── PARAMS ANNUELS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.params_annuels (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee INTEGER NOT NULL,
  th NUMERIC,
  rsl NUMERIC,
  activite TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (societe_id, annee)
);

-- ─── ABSENCES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.absences (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee INTEGER NOT NULL,
  mois INTEGER NOT NULL,
  employe_id BIGINT NOT NULL,
  type TEXT NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  jours NUMERIC NOT NULL DEFAULT 0,
  motif TEXT,
  statut_validation TEXT DEFAULT 'en_validation',
  motif_rejet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_absences_societe_periode ON public.absences(societe_id, annee, mois);

-- ─── HEURES SUP (5 catégories CCIT) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.heures_sup (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee INTEGER NOT NULL,
  mois INTEGER NOT NULL,
  employe_id BIGINT NOT NULL,
  jour_semaine NUMERIC DEFAULT 0,
  jour_sup NUMERIC DEFAULT 0,
  dimanche_ferie NUMERIC DEFAULT 0,
  nuit_semaine NUMERIC DEFAULT 0,
  nuit_dimanche_ferie NUMERIC DEFAULT 0,
  statut_validation TEXT DEFAULT 'en_validation',
  motif_rejet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (societe_id, annee, mois, employe_id)
);

-- ─── RETENUES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retenues (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee INTEGER NOT NULL,
  mois INTEGER NOT NULL,
  employe_id BIGINT NOT NULL,
  montant NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (societe_id, annee, mois, employe_id)
);

-- ─── PRIMES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.primes (
  id BIGSERIAL PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee INTEGER NOT NULL,
  mois INTEGER NOT NULL,
  employe_id BIGINT NOT NULL,
  libelle TEXT NOT NULL DEFAULT '',
  montant NUMERIC NOT NULL DEFAULT 0,
  statut_validation TEXT DEFAULT 'en_validation',
  motif_rejet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_primes_societe_periode ON public.primes(societe_id, annee, mois);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS updated_at + audit
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'employes','transactions','factures','devis','fournisseurs',
    'categories_stock','articles','mouvements_stock','sanctions',
    'immobilisations','taux_historique','params_annuels','absences',
    'heures_sup','retenues','primes'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);

    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_audit ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_audit AFTER INSERT OR UPDATE OR DELETE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn()', t);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — politiques uniformes par société
-- Lecture     : has_societe_access
-- Insert/Upd  : admin général | admin société | service compta | service GRH
-- Delete      : admin général uniquement
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'employes','transactions','factures','devis','fournisseurs',
    'categories_stock','articles','mouvements_stock','sanctions',
    'immobilisations','taux_historique','params_annuels','absences',
    'heures_sup','retenues','primes'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "%1$s_select" ON public.%1$s', t);
    EXECUTE format($f$
      CREATE POLICY "%1$s_select" ON public.%1$s
      FOR SELECT TO authenticated
      USING (is_admin_general(auth.uid()) OR has_societe_access(auth.uid(), societe_id))
    $f$, t);

    EXECUTE format('DROP POLICY IF EXISTS "%1$s_insert" ON public.%1$s', t);
    EXECUTE format($f$
      CREATE POLICY "%1$s_insert" ON public.%1$s
      FOR INSERT TO authenticated
      WITH CHECK (
        (is_admin_general(auth.uid()) OR has_societe_access(auth.uid(), societe_id))
        AND (
          is_admin_general(auth.uid())
          OR is_admin(auth.uid())
          OR in_service_compta(auth.uid())
          OR in_service_grh(auth.uid())
        )
      )
    $f$, t);

    EXECUTE format('DROP POLICY IF EXISTS "%1$s_update" ON public.%1$s', t);
    EXECUTE format($f$
      CREATE POLICY "%1$s_update" ON public.%1$s
      FOR UPDATE TO authenticated
      USING (
        (is_admin_general(auth.uid()) OR has_societe_access(auth.uid(), societe_id))
        AND (
          is_admin_general(auth.uid())
          OR is_admin(auth.uid())
          OR in_service_compta(auth.uid())
          OR in_service_grh(auth.uid())
        )
      )
      WITH CHECK (
        (is_admin_general(auth.uid()) OR has_societe_access(auth.uid(), societe_id))
        AND (
          is_admin_general(auth.uid())
          OR is_admin(auth.uid())
          OR in_service_compta(auth.uid())
          OR in_service_grh(auth.uid())
        )
      )
    $f$, t);

    EXECUTE format('DROP POLICY IF EXISTS "%1$s_delete" ON public.%1$s', t);
    EXECUTE format($f$
      CREATE POLICY "%1$s_delete" ON public.%1$s
      FOR DELETE TO authenticated
      USING (
        is_admin_general(auth.uid())
        OR (has_societe_access(auth.uid(), societe_id) AND is_admin(auth.uid()))
      )
    $f$, t);
  END LOOP;
END $$;