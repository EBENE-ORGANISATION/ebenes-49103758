
-- Étape 1 : changer le type de colonne de enum vers text
-- (seule permission_overrides utilise app_module, aucun impact ailleurs)
ALTER TABLE public.permission_overrides
  ALTER COLUMN module TYPE text;

-- Étape 2 : migration exacte fournie par l'utilisateur
DO $$
DECLARE
  _constraint_name text;
BEGIN
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

ALTER TABLE public.permission_overrides
  ADD CONSTRAINT permission_overrides_module_check
  CHECK (module IN (
    'dashboard',
    'compta',
    'factures',
    'stock',
    'immobilisations',
    'fiscalite',
    'parametres_sociaux',
    'grh',
    'saisie_ecritures',
    'validation_ecritures',
    'journaux',
    'rapports_compta',
    'devis',
    'factures_vente',
    'factures_achat',
    'articles',
    'mouvements_stock',
    'inventaire',
    'fiches_immo',
    'cessions_immo',
    'tva',
    'is_impot',
    'imf',
    'patente',
    'parafiscaux',
    'grilles_salaire',
    'baremes_cnss',
    'employes',
    'bulletins',
    'conges_absences',
    'sanctions',
    'paie_virements'
  ));

COMMENT ON CONSTRAINT permission_overrides_module_check ON public.permission_overrides IS
  '32 modules valides : 8 parents + 24 sous-modules (mis à jour 2026-05-26)';
