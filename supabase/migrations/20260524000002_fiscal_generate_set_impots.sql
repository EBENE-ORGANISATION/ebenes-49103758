-- ============================================================================
-- Migration Fiscalité EBENE — Fonction generate_set_impots + trigger auto
-- CGI Togo 2025 : IS 27%, IMF 1%, TVA 18%, TAF 10%, TCA, TETTIC 5%, TPU, Patente
-- ============================================================================

-- ─── 1. Fonction generate_set_impots ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_set_impots(
  p_regime        public.regime_fiscal_enum,
  p_secteur       public.secteur_activite_enum,
  p_ca_annuel     numeric  DEFAULT 0,
  p_assujetti_tva boolean  DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result   jsonb    := '[]'::jsonb;
  v_taux_pat numeric;
  v_imf_min  numeric;
BEGIN

  -- ── IS — Impôt sur les Sociétés ──────────────────────────────────────────
  -- Régimes IS et IMF (IS s'applique si le bénéfice > IMF calculé)
  -- Taux : 27 % du bénéfice net imposable  —  CGI Togo Art. 128
  IF p_regime IN ('IS', 'IMF') THEN
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'code',        'IS',
      'label',       'Impôt sur les Sociétés',
      'taux',        0.27,
      'assiette',    'benefice_net',
      'article',     'CGI Art. 128',
      'periodicite', 'annuel'
    ));
  END IF;

  -- ── IMF — Impôt Minimum Forfaitaire ──────────────────────────────────────
  -- Taux : 1 % CA HT (min 200 000 FCFA)
  -- Exception VVO : 2 % (min 20 000 FCFA) — CGI Art. 141
  -- (VVO géré comme secteur spécial via note dans set_impots)
  IF p_regime IN ('IS', 'IMF') THEN
    v_imf_min := 200000;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'code',        'IMF',
      'label',       'Impôt Minimum Forfaitaire',
      'taux',        0.01,
      'assiette',    'ca_ht',
      'montant_min', v_imf_min,
      'article',     'CGI Art. 141',
      'periodicite', 'annuel'
    ));
  END IF;

  -- ── TPU — Taxe Professionnelle Unique ────────────────────────────────────
  -- Réservée aux petits contribuables (CA < 60 M FCFA, personnes physiques)
  -- Taux : 2 % commerce/production  |  8 % services  —  CGI Art. 163
  IF p_regime = 'TPU' THEN
    IF p_secteur IN ('CO', 'HO', 'PH', 'IND', 'AGRI') THEN
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'code',        'TPU',
        'label',       'Taxe Professionnelle Unique — Commerce / Production',
        'taux',        0.02,
        'assiette',    'ca_ht',
        'article',     'CGI Art. 163',
        'periodicite', 'trimestriel'
      ));
    ELSE
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'code',        'TPU',
        'label',       'Taxe Professionnelle Unique — Services',
        'taux',        0.08,
        'assiette',    'ca_ht',
        'article',     'CGI Art. 163',
        'periodicite', 'trimestriel'
      ));
    END IF;
  END IF;

  -- ── TVA — Taxe sur la Valeur Ajoutée ─────────────────────────────────────
  -- Applicable si assujetti ET CA > 60 M FCFA
  -- Jamais pour BE et ASS  —  Taux 18 %  —  CGI Art. 203
  IF p_assujetti_tva
     AND p_regime NOT IN ('BE', 'ASS', 'TPU')
     AND p_secteur NOT IN ('BE', 'ASS')
     AND p_ca_annuel > 60000000 THEN
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'code',        'TVA',
      'label',       'Taxe sur la Valeur Ajoutée',
      'taux',        0.18,
      'assiette',    'ca_ht',
      'seuil_ca',    60000000,
      'article',     'CGI Art. 203',
      'periodicite', 'mensuel'
    ));
  END IF;

  -- ── TAF — Taxe sur les Activités Financières ─────────────────────────────
  -- Remplace la TVA pour BE.  Taux : 10 % produits bruts — CGI Art. 230
  IF p_regime = 'BE' OR p_secteur = 'BE' THEN
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'code',        'TAF',
      'label',       'Taxe sur les Activités Financières',
      'taux',        0.10,
      'assiette',    'produits_bruts',
      'article',     'CGI Art. 230',
      'periodicite', 'mensuel'
    ));
  END IF;

  -- ── TCA — Taxe sur les Contrats d'Assurance ──────────────────────────────
  -- ASS uniquement. Taux variables selon type de contrat — CGI Art. 246
  IF p_regime = 'ASS' OR p_secteur = 'ASS' THEN
    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'code', 'TCA_NAV',     'label', 'TCA Navigation',
        'taux', 0.05,           'assiette', 'primes_nettes',
        'article', 'CGI Art. 246', 'periodicite', 'mensuel'
      ),
      jsonb_build_object(
        'code', 'TCA_INC_GEN', 'label', 'TCA Incendie général',
        'taux', 0.25,           'assiette', 'primes_nettes',
        'article', 'CGI Art. 246', 'periodicite', 'mensuel'
      ),
      jsonb_build_object(
        'code', 'TCA_INC_PRO', 'label', 'TCA Incendie professionnel',
        'taux', 0.20,           'assiette', 'primes_nettes',
        'article', 'CGI Art. 246', 'periodicite', 'mensuel'
      ),
      jsonb_build_object(
        'code', 'TCA_VIE',     'label', 'TCA Vie',
        'taux', 0.03,           'assiette', 'primes_nettes',
        'article', 'CGI Art. 246', 'periodicite', 'mensuel'
      ),
      jsonb_build_object(
        'code', 'TCA_AUT',     'label', 'TCA Autres',
        'taux', 0.06,           'assiette', 'primes_nettes',
        'article', 'CGI Art. 246', 'periodicite', 'mensuel'
      ),
      jsonb_build_object(
        'code', 'TCA_CRED',    'label', 'TCA Crédit export',
        'taux', 0.002,          'assiette', 'primes_nettes',
        'article', 'CGI Art. 246', 'periodicite', 'mensuel'
      )
    );
  END IF;

  -- ── TETTIC — Taxe TEL & TI ────────────────────────────────────────────────
  -- Télécommunications et Transferts Internationaux : 5 % CA HT — CGI Art. 253
  IF p_regime IN ('TEL', 'TI') OR p_secteur IN ('TEL', 'TI') THEN
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'code',        'TETTIC',
      'label',       CASE
                       WHEN p_secteur = 'TEL' THEN 'TETTIC — Télécommunications'
                       ELSE 'TETTIC — Transferts Internationaux'
                     END,
      'taux',        0.05,
      'assiette',    'ca_ht',
      'article',     'CGI Art. 253',
      'periodicite', 'mensuel'
    ));
  END IF;

  -- ── Patente — Taxe Professionnelle annuelle ───────────────────────────────
  -- 4 tranches de CA × 5 groupes sectoriels  —  CGI Art. 302
  --
  --  Groupe  │ Secteurs               │ T1(≤5M)  T2(≤30M)  T3(≤100M)  T4(>100M)
  --  ────────┼────────────────────────┼────────────────────────────────────────
  --  G1      │ CO, HO, PH             │ 0.55%    0.60%     0.65%      0.70%
  --  G2      │ SE, ASS, BE, BTP       │ 0.75%    0.90%     1.05%      1.20%
  --  G3      │ IND, AGRI              │ 0.35%    0.40%     0.45%      0.50%
  --  G4      │ TEL                    │ 0.80%    1.00%     1.10%      1.30%
  --  G5      │ TI                     │ 0.50%    0.65%     0.75%      0.90%
  --  AUT     │ AUT                    │ 0.75%    0.90%     1.00%      1.00%

  IF p_ca_annuel > 0 THEN
    IF p_ca_annuel <= 5000000 THEN
      v_taux_pat := CASE p_secteur
        WHEN 'CO'   THEN 0.0055  WHEN 'HO'   THEN 0.0055  WHEN 'PH'   THEN 0.0055
        WHEN 'SE'   THEN 0.0075  WHEN 'ASS'  THEN 0.0075
        WHEN 'BE'   THEN 0.0075  WHEN 'BTP'  THEN 0.0075
        WHEN 'IND'  THEN 0.0035  WHEN 'AGRI' THEN 0.0035
        WHEN 'TEL'  THEN 0.0080
        WHEN 'TI'   THEN 0.0050
        ELSE 0.0075
      END;
    ELSIF p_ca_annuel <= 30000000 THEN
      v_taux_pat := CASE p_secteur
        WHEN 'CO'   THEN 0.0060  WHEN 'HO'   THEN 0.0060  WHEN 'PH'   THEN 0.0060
        WHEN 'SE'   THEN 0.0090  WHEN 'ASS'  THEN 0.0090
        WHEN 'BE'   THEN 0.0090  WHEN 'BTP'  THEN 0.0090
        WHEN 'IND'  THEN 0.0040  WHEN 'AGRI' THEN 0.0040
        WHEN 'TEL'  THEN 0.0100
        WHEN 'TI'   THEN 0.0065
        ELSE 0.0090
      END;
    ELSIF p_ca_annuel <= 100000000 THEN
      v_taux_pat := CASE p_secteur
        WHEN 'CO'   THEN 0.0065  WHEN 'HO'   THEN 0.0065  WHEN 'PH'   THEN 0.0065
        WHEN 'SE'   THEN 0.0105  WHEN 'ASS'  THEN 0.0105
        WHEN 'BE'   THEN 0.0105  WHEN 'BTP'  THEN 0.0105
        WHEN 'IND'  THEN 0.0045  WHEN 'AGRI' THEN 0.0045
        WHEN 'TEL'  THEN 0.0110
        WHEN 'TI'   THEN 0.0075
        ELSE 0.0105
      END;
    ELSE
      v_taux_pat := CASE p_secteur
        WHEN 'CO'   THEN 0.0070  WHEN 'HO'   THEN 0.0070  WHEN 'PH'   THEN 0.0070
        WHEN 'SE'   THEN 0.0120  WHEN 'ASS'  THEN 0.0120
        WHEN 'BE'   THEN 0.0120  WHEN 'BTP'  THEN 0.0120
        WHEN 'IND'  THEN 0.0050  WHEN 'AGRI' THEN 0.0050
        WHEN 'TEL'  THEN 0.0130
        WHEN 'TI'   THEN 0.0090
        ELSE 0.0100
      END;
    END IF;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'code',             'PATENTE',
      'label',            'Taxe Professionnelle (Patente)',
      'taux',             v_taux_pat,
      'assiette',         'ca_annuel',
      'article',          'CGI Art. 302',
      'periodicite',      'annuel',
      'montant_estime',   ROUND(p_ca_annuel * v_taux_pat)
    ));
  END IF;

  RETURN v_result;
END;
$$;

-- ─── 2. Trigger : recalcul automatique de set_impots ──────────────────────

CREATE OR REPLACE FUNCTION public.trg_recalc_set_impots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recalculer uniquement si les champs fiscaux ont changé
  IF (
    OLD.regime_fiscal      IS DISTINCT FROM NEW.regime_fiscal      OR
    OLD.secteur_activite   IS DISTINCT FROM NEW.secteur_activite   OR
    OLD.assujetti_tva      IS DISTINCT FROM NEW.assujetti_tva      OR
    OLD.ca_annuel_estime   IS DISTINCT FROM NEW.ca_annuel_estime
  ) THEN
    NEW.set_impots := public.generate_set_impots(
      COALESCE(NEW.regime_fiscal,    'IS'::public.regime_fiscal_enum),
      COALESCE(NEW.secteur_activite, 'SE'::public.secteur_activite_enum),
      COALESCE(NEW.ca_annuel_estime, 0),
      COALESCE(NEW.assujetti_tva,    false)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_societes_recalc_set_impots ON public.societes;
CREATE TRIGGER trg_societes_recalc_set_impots
  BEFORE UPDATE ON public.societes
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_set_impots();

-- ─── 3. Backfill : calculer set_impots pour les sociétés existantes ────────

UPDATE public.societes
SET set_impots = public.generate_set_impots(
  COALESCE(regime_fiscal,    'IS'::public.regime_fiscal_enum),
  COALESCE(secteur_activite, 'SE'::public.secteur_activite_enum),
  COALESCE(ca_annuel_estime, 0),
  COALESCE(assujetti_tva,    false)
)
WHERE set_impots = '[]'::jsonb OR set_impots IS NULL;
