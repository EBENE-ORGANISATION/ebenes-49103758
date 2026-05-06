-- ============================================================
-- Migration 1 : bulletins_paie
-- ============================================================
CREATE TABLE IF NOT EXISTS bulletins_paie (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id        integer     NOT NULL,
  employe_nom       text        NOT NULL,
  employe_user_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  societe_id        uuid        NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  mois              smallint    NOT NULL CHECK (mois BETWEEN 1 AND 12),
  annee             smallint    NOT NULL,
  salaire_base      numeric     NOT NULL DEFAULT 0,
  sursalaire        numeric     NOT NULL DEFAULT 0,
  prime_anciennete  numeric     NOT NULL DEFAULT 0,
  hs_montant        numeric     NOT NULL DEFAULT 0,
  primes_diverses   numeric     NOT NULL DEFAULT 0,
  indemnites        numeric     NOT NULL DEFAULT 0,
  brut              numeric     NOT NULL DEFAULT 0,
  cnss_sal          numeric     NOT NULL DEFAULT 0,
  amu_sal           numeric     NOT NULL DEFAULT 0,
  irpp              numeric     NOT NULL DEFAULT 0,
  retenues_diverses numeric     NOT NULL DEFAULT 0,
  total_retenues    numeric     NOT NULL DEFAULT 0,
  net_a_payer       numeric     NOT NULL DEFAULT 0,
  cnss_pat          numeric     NOT NULL DEFAULT 0,
  amu_pat           numeric     NOT NULL DEFAULT 0,
  cout_employeur    numeric     NOT NULL DEFAULT 0,
  statut            text        NOT NULL DEFAULT 'brouillon'
                    CHECK (statut IN ('brouillon', 'valide', 'paye')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  paid_at           timestamptz,
  UNIQUE (employe_id, societe_id, mois, annee)
);

CREATE INDEX IF NOT EXISTS bulletins_societe_periode_idx
  ON bulletins_paie (societe_id, annee DESC, mois DESC);
CREATE INDEX IF NOT EXISTS bulletins_employe_user_idx
  ON bulletins_paie (employe_user_id, societe_id);

ALTER TABLE bulletins_paie ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employe_read_bulletins" ON bulletins_paie;
CREATE POLICY "employe_read_bulletins" ON bulletins_paie
  FOR SELECT USING (employe_user_id = auth.uid());

DROP POLICY IF EXISTS "admin_read_bulletins" ON bulletins_paie;
CREATE POLICY "admin_read_bulletins" ON bulletins_paie
  FOR SELECT USING (
    societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_insert_bulletins" ON bulletins_paie;
CREATE POLICY "admin_insert_bulletins" ON bulletins_paie
  FOR INSERT WITH CHECK (
    societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_update_bulletins" ON bulletins_paie;
CREATE POLICY "admin_update_bulletins" ON bulletins_paie
  FOR UPDATE
  USING (societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid()))
  WITH CHECK (societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "admin_delete_bulletins" ON bulletins_paie;
CREATE POLICY "admin_delete_bulletins" ON bulletins_paie
  FOR DELETE USING (
    societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid())
  );

-- ============================================================
-- Migration 2 : portail_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS portail_messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id       uuid        NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  employe_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contenu          text        NOT NULL CHECK (char_length(contenu) > 0),
  auteur           text        NOT NULL CHECK (auteur IN ('admin', 'employe')),
  lu               boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portail_messages_employe_idx
  ON portail_messages (employe_user_id, societe_id, created_at DESC);

ALTER TABLE portail_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employe_own_messages_select" ON portail_messages;
CREATE POLICY "employe_own_messages_select" ON portail_messages
  FOR SELECT USING (employe_user_id = auth.uid());

DROP POLICY IF EXISTS "employe_own_messages_insert" ON portail_messages;
CREATE POLICY "employe_own_messages_insert" ON portail_messages
  FOR INSERT WITH CHECK (employe_user_id = auth.uid() AND auteur = 'employe');

DROP POLICY IF EXISTS "employe_own_messages_update" ON portail_messages;
CREATE POLICY "employe_own_messages_update" ON portail_messages
  FOR UPDATE
  USING (employe_user_id = auth.uid())
  WITH CHECK (employe_user_id = auth.uid());

DROP POLICY IF EXISTS "admin_messages_select" ON portail_messages;
CREATE POLICY "admin_messages_select" ON portail_messages
  FOR SELECT USING (
    societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_messages_insert" ON portail_messages;
CREATE POLICY "admin_messages_insert" ON portail_messages
  FOR INSERT WITH CHECK (
    auteur = 'admin'
    AND societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_messages_update" ON portail_messages;
CREATE POLICY "admin_messages_update" ON portail_messages
  FOR UPDATE USING (
    societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid())
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'app_state'
      AND policyname = 'employe_no_direct_app_state'
  ) THEN
    CREATE POLICY "employe_no_direct_app_state" ON app_state
      FOR ALL
      USING (
        NOT EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_id = auth.uid() AND role = 'employe'
        )
      );
  END IF;
END $$;

-- ============================================================
-- Migration 3 : device_otps (employes existe déjà avec bigint id, on skip)
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

DROP POLICY IF EXISTS "device_otp_select" ON device_otps;
CREATE POLICY "device_otp_select" ON device_otps
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "device_otp_insert" ON device_otps;
CREATE POLICY "device_otp_insert" ON device_otps
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "device_otp_update" ON device_otps;
CREATE POLICY "device_otp_update" ON device_otps
  FOR UPDATE USING (user_id = auth.uid());