-- Reprise (accord du 2026-10-08) : pour les opérations et factures payées
-- saisies avant l'enregistrement des comptes, on recopie depuis leurs
-- écritures existantes le compte de charge/produit, Banque/Caisse et la TVA.
-- Ne remplit que les champs vides ; aucune écriture ni montant n'est modifié.

-- Opérations de trésorerie : écriture TR-<id> (et AC-<id> pour un achat fournisseur)
WITH sources AS (
  SELECT t.id,
    (SELECT e.lignes FROM public.ecritures_comptables e
      WHERE e.societe_id = t.societe_id AND e.numero_piece = 'TR-' || t.id LIMIT 1) AS tr,
    (SELECT e.lignes FROM public.ecritures_comptables e
      WHERE e.societe_id = t.societe_id AND e.numero_piece = 'AC-' || t.id LIMIT 1) AS ac
  FROM public.transactions t
  WHERE t.compte IS NULL AND t.source NOT IN ('facture', 'salaires')
),
comptes AS (
  SELECT s.id,
    (SELECT l->>'compte' FROM jsonb_array_elements(s.tr) l
      WHERE left(l->>'compte', 2) IN ('52', '57') LIMIT 1) AS treso,
    COALESCE(
      (SELECT l->>'compte' FROM jsonb_array_elements(s.ac) l
        WHERE (l->>'debit')::numeric > 0 AND l->>'compte' NOT LIKE '445%' LIMIT 1),
      (SELECT l->>'compte' FROM jsonb_array_elements(s.tr) l
        WHERE left(l->>'compte', 2) NOT IN ('52', '57') AND l->>'compte' NOT LIKE '44%' LIMIT 1)
    ) AS compte,
    CASE
      WHEN s.ac IS NOT NULL THEN EXISTS (SELECT 1 FROM jsonb_array_elements(s.ac) l WHERE l->>'compte' LIKE '4452%')
      WHEN s.tr IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.tr) l WHERE l->>'compte' LIKE '4431%') THEN true
    END AS avec_tva
  FROM sources s
  WHERE s.tr IS NOT NULL
)
UPDATE public.transactions t
SET compte = c.compte,
    tresorerie = COALESCE(t.tresorerie, CASE WHEN left(c.treso, 2) = '57' THEN '571' WHEN c.treso IS NOT NULL THEN '521' END),
    avec_tva = COALESCE(t.avec_tva, c.avec_tva)
FROM comptes c
WHERE t.id = c.id AND c.compte IS NOT NULL;

-- Factures payées : journal de l'écriture d'encaissement (BQ → 521, CA → 571)
UPDATE public.factures f
SET compte_tresorerie = CASE e.journal WHEN 'CA' THEN '571' ELSE '521' END
FROM public.ecritures_comptables e
WHERE f.compte_tresorerie IS NULL
  AND f.statut = 'payee'
  AND e.facture_id = f.id
  AND e.societe_id = f.societe_id
  AND e.journal IN ('BQ', 'CA')
  AND e.numero_piece NOT LIKE 'AN-%';
