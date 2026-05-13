-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 20260513000000 — Audit par société | Services | Corbeille (soft delete)
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. JOURNAL D'AUDIT — Filtre par société + description lisible
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS societe_id  UUID REFERENCES societes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_log_societe_id ON audit_log (societe_id);

-- RLS : chaque utilisateur ne voit que les logs de ses sociétés accessibles
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Super-admin : tout voir
DROP POLICY IF EXISTS "audit_log_super_admin" ON audit_log;
CREATE POLICY "audit_log_super_admin" ON audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin_general', 'super_admin')
    )
  );

-- Admin de société : ses propres sociétés uniquement
DROP POLICY IF EXISTS "audit_log_admin_societe" ON audit_log;
CREATE POLICY "audit_log_admin_societe" ON audit_log
  FOR SELECT USING (
    societe_id IS NULL OR
    has_societe_access(societe_id, auth.uid())
  );

-- Tout utilisateur peut insérer (logAction est appelé côté client)
DROP POLICY IF EXISTS "audit_log_insert" ON audit_log;
CREATE POLICY "audit_log_insert" ON audit_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. GESTION DES SERVICES (départements organisationnels)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Table des services d'une société
CREATE TABLE IF NOT EXISTS services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  UUID NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  nom         TEXT NOT NULL,
  description TEXT,
  couleur     TEXT DEFAULT '#6366f1',   -- couleur de badge UI
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_services_societe_id ON services (societe_id);

-- Membres d'un service (chef ou membre)
CREATE TABLE IF NOT EXISTS service_membres (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('chef', 'membre')),   -- chef ou membre
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id, user_id)   -- un utilisateur = un rôle par service
);

CREATE INDEX IF NOT EXISTS idx_service_membres_service_id ON service_membres (service_id);
CREATE INDEX IF NOT EXISTS idx_service_membres_user_id    ON service_membres (user_id);

-- RLS services
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "services_select" ON services;
CREATE POLICY "services_select" ON services
  FOR SELECT USING (has_societe_access(societe_id, auth.uid()));

DROP POLICY IF EXISTS "services_write_admin" ON services;
CREATE POLICY "services_write_admin" ON services
  FOR ALL USING (
    is_admin(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin_general'
    )
  );

-- RLS service_membres
ALTER TABLE service_membres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_membres_select" ON service_membres;
CREATE POLICY "service_membres_select" ON service_membres
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM services s
      WHERE s.id = service_membres.service_id
        AND has_societe_access(s.societe_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "service_membres_write_admin" ON service_membres;
CREATE POLICY "service_membres_write_admin" ON service_membres
  FOR ALL USING (
    is_admin(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin_general'
    )
  );

-- Trigger updated_at pour services
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS tg_services_updated_at ON services;
CREATE TRIGGER tg_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. CORBEILLE — Soft delete sur les tables principales
-- ═══════════════════════════════════════════════════════════════════════════════

-- Employés
ALTER TABLE employes
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_employes_deleted_at ON employes (deleted_at)
  WHERE deleted_at IS NULL;

-- Transactions comptables
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON transactions (deleted_at)
  WHERE deleted_at IS NULL;

-- Factures
ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_factures_deleted_at ON factures (deleted_at)
  WHERE deleted_at IS NULL;

-- Devis
ALTER TABLE devis
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_devis_deleted_at ON devis (deleted_at)
  WHERE deleted_at IS NULL;

-- Articles stock
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Commentaire de documentation
COMMENT ON COLUMN employes.deleted_at     IS 'NULL = actif ; non-NULL = dans la corbeille (soft delete)';
COMMENT ON COLUMN transactions.deleted_at IS 'NULL = actif ; non-NULL = dans la corbeille (soft delete)';
COMMENT ON COLUMN factures.deleted_at     IS 'NULL = actif ; non-NULL = dans la corbeille (soft delete)';
COMMENT ON COLUMN devis.deleted_at        IS 'NULL = actif ; non-NULL = dans la corbeille (soft delete)';
COMMENT ON COLUMN articles.deleted_at     IS 'NULL = actif ; non-NULL = dans la corbeille (soft delete)';
