-- Décision du 2026-10-09 : un employé peut être partagé entre plusieurs
-- activités. `repartition` = [{ "activiteId": uuid, "part": % }] (total 100) ;
-- vide : l'employé relève entièrement de `activite_id`.
ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS repartition jsonb NOT NULL DEFAULT '[]'::jsonb;
