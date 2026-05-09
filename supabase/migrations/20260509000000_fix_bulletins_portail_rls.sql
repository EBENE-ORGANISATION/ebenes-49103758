-- ============================================================
-- Correction RLS : bulletins_paie + portail_messages
-- Problème : les policies utilisaient un subquery user_societes brut
-- → les super-admins (non présents dans user_societes) obtenaient
--   une violation 42501 lors de la génération/modification de bulletins.
-- Fix : utiliser les helpers is_admin_general() + has_societe_access()
-- conformément au pattern établi dans les autres tables métier.
-- ============================================================

-- ─── bulletins_paie ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "employe_read_bulletins"  ON bulletins_paie;
DROP POLICY IF EXISTS "admin_read_bulletins"    ON bulletins_paie;
DROP POLICY IF EXISTS "admin_insert_bulletins"  ON bulletins_paie;
DROP POLICY IF EXISTS "admin_update_bulletins"  ON bulletins_paie;
DROP POLICY IF EXISTS "admin_delete_bulletins"  ON bulletins_paie;

-- L'employé voit uniquement ses propres bulletins
CREATE POLICY "bulletins_employe_select" ON bulletins_paie
  FOR SELECT
  USING (employe_user_id = auth.uid());

-- Admin/GRH de la société + super-admin voient tous les bulletins
CREATE POLICY "bulletins_admin_select" ON bulletins_paie
  FOR SELECT
  USING (
    is_admin_general(auth.uid())
    OR has_societe_access(auth.uid(), societe_id)
  );

-- Admin/GRH de la société + super-admin créent des bulletins
CREATE POLICY "bulletins_admin_insert" ON bulletins_paie
  FOR INSERT
  WITH CHECK (
    is_admin_general(auth.uid())
    OR has_societe_access(auth.uid(), societe_id)
  );

-- Admin/GRH de la société + super-admin modifient le statut
CREATE POLICY "bulletins_admin_update" ON bulletins_paie
  FOR UPDATE
  USING (
    is_admin_general(auth.uid())
    OR has_societe_access(auth.uid(), societe_id)
  )
  WITH CHECK (
    is_admin_general(auth.uid())
    OR has_societe_access(auth.uid(), societe_id)
  );

-- Seuls super-admin ou admin de la société peuvent supprimer (brouillons)
CREATE POLICY "bulletins_admin_delete" ON bulletins_paie
  FOR DELETE
  USING (
    is_admin_general(auth.uid())
    OR (has_societe_access(auth.uid(), societe_id) AND is_admin(auth.uid()))
  );

-- ─── portail_messages ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "employe_own_messages_select" ON portail_messages;
DROP POLICY IF EXISTS "employe_own_messages_insert" ON portail_messages;
DROP POLICY IF EXISTS "employe_own_messages_update" ON portail_messages;
DROP POLICY IF EXISTS "admin_messages_select"        ON portail_messages;
DROP POLICY IF EXISTS "admin_messages_insert"        ON portail_messages;
DROP POLICY IF EXISTS "admin_messages_update"        ON portail_messages;

-- Employé : voit et envoie uniquement ses propres messages
CREATE POLICY "portail_employe_select" ON portail_messages
  FOR SELECT
  USING (employe_user_id = auth.uid());

CREATE POLICY "portail_employe_insert" ON portail_messages
  FOR INSERT
  WITH CHECK (employe_user_id = auth.uid() AND auteur = 'employe');

CREATE POLICY "portail_employe_update" ON portail_messages
  FOR UPDATE
  USING (employe_user_id = auth.uid())
  WITH CHECK (employe_user_id = auth.uid());

-- Admin/GRH + super-admin voient et envoient les messages de la société
CREATE POLICY "portail_admin_select" ON portail_messages
  FOR SELECT
  USING (
    is_admin_general(auth.uid())
    OR has_societe_access(auth.uid(), societe_id)
  );

CREATE POLICY "portail_admin_insert" ON portail_messages
  FOR INSERT
  WITH CHECK (
    auteur = 'admin'
    AND (
      is_admin_general(auth.uid())
      OR has_societe_access(auth.uid(), societe_id)
    )
  );

CREATE POLICY "portail_admin_update" ON portail_messages
  FOR UPDATE
  USING (
    is_admin_general(auth.uid())
    OR has_societe_access(auth.uid(), societe_id)
  );
