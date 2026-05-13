-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 20260513000001 — Déductions fiscales IRPP sur la fiche employé
-- ─────────────────────────────────────────────────────────────────────────────
-- Trois déductions optionnelles du CGI togolais (art. IRPP) :
--  VI.  Intérêt prêt immobilier  (montant mensuel réel)
--  VII. Assurance-vie            (prime mensuelle, plafond légal)
--  VIII.Retraite complémentaire  (cotisation mensuelle, plafond = 6 % du RNT)

ALTER TABLE employes
  ADD COLUMN IF NOT EXISTS interet_pret_immobilier  NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assurance_vie             NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS retraite_complementaire   NUMERIC(12,2) DEFAULT NULL;

COMMENT ON COLUMN employes.interet_pret_immobilier IS
  'VI — Intérêt mensuel de prêt immobilier déductible de l''IRPP (FCFA/mois)';
COMMENT ON COLUMN employes.assurance_vie IS
  'VII — Prime mensuelle d''assurance-vie, plafond légal = (200 000 + 30 000 × enfants≤6) ÷ 12 FCFA/mois';
COMMENT ON COLUMN employes.retraite_complementaire IS
  'VIII — Cotisation mensuelle de retraite complémentaire, plafond = 6 % du RNT mensuel';
