-- ============================================================
-- Portail Employé : table de messagerie admin ↔ employé
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

-- L'employé voit tous ses messages et envoie uniquement les siens
CREATE POLICY "employe_own_messages_select" ON portail_messages
  FOR SELECT
  USING (employe_user_id = auth.uid());

CREATE POLICY "employe_own_messages_insert" ON portail_messages
  FOR INSERT
  WITH CHECK (employe_user_id = auth.uid() AND auteur = 'employe');

CREATE POLICY "employe_own_messages_update" ON portail_messages
  FOR UPDATE
  USING (employe_user_id = auth.uid())
  WITH CHECK (employe_user_id = auth.uid());

-- L'admin voit et envoie les messages de sa société
CREATE POLICY "admin_messages_select" ON portail_messages
  FOR SELECT
  USING (
    societe_id IN (
      SELECT societe_id FROM user_societes WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "admin_messages_insert" ON portail_messages
  FOR INSERT
  WITH CHECK (
    auteur = 'admin'
    AND societe_id IN (
      SELECT societe_id FROM user_societes WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "admin_messages_update" ON portail_messages
  FOR UPDATE
  USING (
    societe_id IN (
      SELECT societe_id FROM user_societes WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- RLS sur la table app_state : l'employé ne peut pas lire les
-- données des autres (il n'a accès qu'à son propre user_id).
-- Cette policy complète la sécurité multi-tenant existante.
-- ============================================================

-- Note : les données employés sont dans app_state (JSONB).
-- La policy ci-dessous bloque l'accès direct à app_state pour
-- les comptes au rôle 'employe' (ils passent uniquement par
-- portail_messages et les fonctions Edge dédiées).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'app_state'
      AND policyname = 'employe_no_direct_app_state'
  ) THEN
    CREATE POLICY "employe_no_direct_app_state" ON app_state
      FOR ALL
      USING (
        NOT EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_id = auth.uid()
            AND role = 'employe'
        )
      );
  END IF;
END $$;
