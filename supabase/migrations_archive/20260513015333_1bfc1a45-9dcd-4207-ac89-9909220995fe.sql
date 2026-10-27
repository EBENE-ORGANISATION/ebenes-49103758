-- ═══ Audit par société + Services + Corbeille ═══
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS societe_id  UUID REFERENCES societes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_log_societe_id ON audit_log (societe_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_super_admin" ON audit_log;
CREATE POLICY "audit_log_super_admin" ON audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_general', 'admin')
    )
  );

DROP POLICY IF EXISTS "audit_log_admin_societe" ON audit_log;
CREATE POLICY "audit_log_admin_societe" ON audit_log
  FOR SELECT USING (
    societe_id IS NULL OR
    has_societe_access(auth.uid(), societe_id)
  );

DROP POLICY IF EXISTS "audit_log_insert" ON audit_log;
CREATE POLICY "audit_log_insert" ON audit_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Services
CREATE TABLE IF NOT EXISTS services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  UUID NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  nom         TEXT NOT NULL,
  description TEXT,
  couleur     TEXT DEFAULT '#6366f1',
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_services_societe_id ON services (societe_id);

CREATE TABLE IF NOT EXISTS service_membres (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('chef', 'membre')),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_service_membres_service_id ON service_membres (service_id);
CREATE INDEX IF NOT EXISTS idx_service_membres_user_id    ON service_membres (user_id);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "services_select" ON services;
CREATE POLICY "services_select" ON services
  FOR SELECT USING (has_societe_access(auth.uid(), societe_id));

DROP POLICY IF EXISTS "services_write_admin" ON services;
CREATE POLICY "services_write_admin" ON services
  FOR ALL USING (
    is_admin(auth.uid()) OR is_admin_general(auth.uid())
  );

ALTER TABLE service_membres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_membres_select" ON service_membres;
CREATE POLICY "service_membres_select" ON service_membres
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM services s
      WHERE s.id = service_membres.service_id
        AND has_societe_access(auth.uid(), s.societe_id)
    )
  );

DROP POLICY IF EXISTS "service_membres_write_admin" ON service_membres;
CREATE POLICY "service_membres_write_admin" ON service_membres
  FOR ALL USING (
    is_admin(auth.uid()) OR is_admin_general(auth.uid())
  );

DROP TRIGGER IF EXISTS tg_services_updated_at ON services;
CREATE TRIGGER tg_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Corbeille (soft delete)
ALTER TABLE employes     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_employes_deleted_at     ON employes (deleted_at)     WHERE deleted_at IS NULL;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON transactions (deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE factures     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_factures_deleted_at     ON factures (deleted_at)     WHERE deleted_at IS NULL;

ALTER TABLE devis        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_devis_deleted_at        ON devis (deleted_at)        WHERE deleted_at IS NULL;

ALTER TABLE articles     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- ═══ Déductions fiscales IRPP ═══
ALTER TABLE employes
  ADD COLUMN IF NOT EXISTS interet_pret_immobilier NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assurance_vie           NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS retraite_complementaire NUMERIC(12,2) DEFAULT NULL;