-- Resserre les policies bulletins_paie : seuls admins, super-admins,
-- membres du service GRH (et délégués actifs via cross_service_grants 'grh')
-- peuvent générer / modifier / supprimer des bulletins.

DROP POLICY IF EXISTS "bulletins_admin_insert" ON bulletins_paie;
DROP POLICY IF EXISTS "bulletins_admin_update" ON bulletins_paie;
DROP POLICY IF EXISTS "bulletins_admin_delete" ON bulletins_paie;

CREATE POLICY "bulletins_admin_insert" ON bulletins_paie
  FOR INSERT
  WITH CHECK (
    (is_admin_general(auth.uid()) OR has_societe_access(auth.uid(), societe_id))
    AND (
      is_admin_general(auth.uid())
      OR is_admin(auth.uid())
      OR in_service_grh(auth.uid())
    )
  );

CREATE POLICY "bulletins_admin_update" ON bulletins_paie
  FOR UPDATE
  USING (
    (is_admin_general(auth.uid()) OR has_societe_access(auth.uid(), societe_id))
    AND (
      is_admin_general(auth.uid())
      OR is_admin(auth.uid())
      OR in_service_grh(auth.uid())
    )
  )
  WITH CHECK (
    (is_admin_general(auth.uid()) OR has_societe_access(auth.uid(), societe_id))
    AND (
      is_admin_general(auth.uid())
      OR is_admin(auth.uid())
      OR in_service_grh(auth.uid())
    )
  );

CREATE POLICY "bulletins_admin_delete" ON bulletins_paie
  FOR DELETE
  USING (
    is_admin_general(auth.uid())
    OR (has_societe_access(auth.uid(), societe_id) AND is_admin(auth.uid()))
  );