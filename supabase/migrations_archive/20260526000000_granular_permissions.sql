-- Migration : Permissions granulaires — sous-modules par module parent
-- Ajoute 24 sous-modules à la contrainte CHECK sur permission_overrides.module
-- Total autorisé : 8 parents + 24 enfants = 32 valeurs

DO $$
DECLARE
  _constraint_name text;
BEGIN
  -- Supprimer l'ancien CHECK sur module (quel que soit son nom)
  SELECT conname INTO _constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.permission_overrides'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%module%'
  LIMIT 1;

  IF _constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.permission_overrides DROP CONSTRAINT %I',
      _constraint_name
    );
  END IF;
END $$;

-- Ajouter le nouveau CHECK avec tous les modules (parents + sous-modules)
ALTER TABLE public.permission_overrides
  ADD CONSTRAINT permission_overrides_module_check
  CHECK (module IN (
    -- Modules parents (8)
    'dashboard',
    'compta',
    'factures',
    'stock',
    'immobilisations',
    'fiscalite',
    'parametres_sociaux',
    'grh',
    -- Sous-modules compta (4)
    'saisie_ecritures',
    'validation_ecritures',
    'journaux',
    'rapports_compta',
    -- Sous-modules factures (3)
    'devis',
    'factures_vente',
    'factures_achat',
    -- Sous-modules stock (3)
    'articles',
    'mouvements_stock',
    'inventaire',
    -- Sous-modules immobilisations (2)
    'fiches_immo',
    'cessions_immo',
    -- Sous-modules fiscalite (5)
    'tva',
    'is_impot',
    'imf',
    'patente',
    'parafiscaux',
    -- Sous-modules parametres_sociaux (2)
    'grilles_salaire',
    'baremes_cnss',
    -- Sous-modules grh (5)
    'employes',
    'bulletins',
    'conges_absences',
    'sanctions',
    'paie_virements'
  ));

COMMENT ON CONSTRAINT permission_overrides_module_check ON public.permission_overrides IS
  '32 modules valides : 8 parents + 24 sous-modules (mis à jour 2026-05-26)';
