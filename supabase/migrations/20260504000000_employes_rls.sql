-- ============================================================
-- Table employes : référentiel RH avec RLS par societe_id
-- ============================================================

CREATE TABLE IF NOT EXISTS employes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id   uuid        NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  local_id     integer,
  nom          text        NOT NULL,
  poste        text,
  matricule    text,
  email        text,
  telephone    text,
  salaire_base numeric,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS employes_user_societe_idx
  ON employes (user_id, societe_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS employes_societe_idx
  ON employes (societe_id);

ALTER TABLE employes ENABLE ROW LEVEL SECURITY;

-- L'employé voit uniquement sa propre fiche (user_id = auth.uid())
CREATE POLICY "employe_read_own" ON employes
  FOR SELECT
  USING (user_id = auth.uid());

-- L'admin/chef-GRH voit tous les employés de sa société
CREATE POLICY "admin_read_employes" ON employes
  FOR SELECT
  USING (
    societe_id IN (
      SELECT societe_id FROM user_societes WHERE user_id = auth.uid()
    )
  );

-- L'admin peut créer des fiches dans ses sociétés
CREATE POLICY "admin_insert_employes" ON employes
  FOR INSERT
  WITH CHECK (
    societe_id IN (
      SELECT societe_id FROM user_societes WHERE user_id = auth.uid()
    )
  );

-- L'admin peut modifier les fiches de ses sociétés
CREATE POLICY "admin_update_employes" ON employes
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

-- ============================================================
-- Table device_otps : codes OTP pour vérification nouvel appareil
-- TTL = 10 minutes, usage unique
-- ============================================================

CREATE TABLE IF NOT EXISTS device_otps (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash   text        NOT NULL,
  device_fp   text,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used        boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_otps_user_idx
  ON device_otps (user_id, expires_at DESC);

ALTER TABLE device_otps ENABLE ROW LEVEL SECURITY;

-- L'employé peut créer et lire ses propres OTP
CREATE POLICY "device_otp_select" ON device_otps
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "device_otp_insert" ON device_otps
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "device_otp_update" ON device_otps
  FOR UPDATE USING (user_id = auth.uid());
