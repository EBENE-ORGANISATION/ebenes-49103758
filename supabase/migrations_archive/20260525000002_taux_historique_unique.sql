-- P2 : taux_historique — contrainte UNIQUE (societe_id, date_effet)
-- Garantit qu'il ne peut y avoir qu'un seul jeu de taux par date d'entrée en vigueur
-- et par société. Nécessaire pour l'upsert depuis le front-end.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE c.conname = 'taux_historique_societe_date_key'
       AND t.relname = 'taux_historique'
       AND n.nspname = 'public'
  ) THEN
    ALTER TABLE public.taux_historique
      ADD CONSTRAINT taux_historique_societe_date_key
      UNIQUE (societe_id, date_effet);
  END IF;
END$$;
