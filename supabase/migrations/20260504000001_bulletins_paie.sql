-- ============================================================
-- Table bulletins_paie : bulletins de paie persistés avec workflow
-- BROUILLON → VALIDÉ → PAYÉ (intégration comptable à PAYÉ seulement)
-- ============================================================

CREATE TABLE IF NOT EXISTS bulletins_paie (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id        integer     NOT NULL,
  employe_nom       text        NOT NULL,
  employe_user_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  societe_id        uuid        NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  mois              smallint    NOT NULL CHECK (mois BETWEEN 1 AND 12),
  annee             smallint    NOT NULL,
  -- Gains
  salaire_base      numeric     NOT NULL DEFAULT 0,
  sursalaire        numeric     NOT NULL DEFAULT 0,
  prime_anciennete  numeric     NOT NULL DEFAULT 0,
  hs_montant        numeric     NOT NULL DEFAULT 0,
  primes_diverses   numeric     NOT NULL DEFAULT 0,
  indemnites        numeric     NOT NULL DEFAULT 0,
  brut              numeric     NOT NULL DEFAULT 0,
  -- Retenues salarié
  cnss_sal          numeric     NOT NULL DEFAULT 0,
  amu_sal           numeric     NOT NULL DEFAULT 0,
  irpp              numeric     NOT NULL DEFAULT 0,
  retenues_diverses numeric     NOT NULL DEFAULT 0,
  total_retenues    numeric     NOT NULL DEFAULT 0,
  net_a_payer       numeric     NOT NULL DEFAULT 0,
  -- Charges patronales (information)
  cnss_pat          numeric     NOT NULL DEFAULT 0,
  amu_pat           numeric     NOT NULL DEFAULT 0,
  cout_employeur    numeric     NOT NULL DEFAULT 0,
  -- Workflow
  statut            text        NOT NULL DEFAULT 'brouillon'
                    CHECK (statut IN ('brouillon', 'valide', 'paye')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  paid_at           timestamptz,
  -- Un seul bulletin par employé par mois/année
  UNIQUE (employe_id, societe_id, mois, annee)
);

CREATE INDEX IF NOT EXISTS bulletins_societe_periode_idx
  ON bulletins_paie (societe_id, annee DESC, mois DESC);

CREATE INDEX IF NOT EXISTS bulletins_employe_user_idx
  ON bulletins_paie (employe_user_id, societe_id);

ALTER TABLE bulletins_paie ENABLE ROW LEVEL SECURITY;

-- L'employé voit uniquement ses propres bulletins
CREATE POLICY "employe_read_bulletins" ON bulletins_paie
  FOR SELECT
  USING (employe_user_id = auth.uid());

-- L'admin/GRH voit tous les bulletins de sa société
CREATE POLICY "admin_read_bulletins" ON bulletins_paie
  FOR SELECT
  USING (
    societe_id IN (
      SELECT societe_id FROM user_societes WHERE user_id = auth.uid()
    )
  );

-- L'admin/GRH peut créer des bulletins
CREATE POLICY "admin_insert_bulletins" ON bulletins_paie
  FOR INSERT
  WITH CHECK (
    societe_id IN (
      SELECT societe_id FROM user_societes WHERE user_id = auth.uid()
    )
  );

-- L'admin/GRH peut modifier le statut (workflow)
CREATE POLICY "admin_update_bulletins" ON bulletins_paie
  FOR UPDATE
  USING (
    societe_id IN (
      SELECT societe_id FROM user_societes WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    societe_id IN (
      SELECT societe_id FROM user_societes WHERE user_id = auth.uid()
    )
  );

-- L'admin/GRH peut supprimer les bulletins brouillons
CREATE POLICY "admin_delete_bulletins" ON bulletins_paie
  FOR DELETE
  USING (
    societe_id IN (
      SELECT societe_id FROM user_societes WHERE user_id = auth.uid()
    )
  );
