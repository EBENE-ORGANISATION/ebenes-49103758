
-- Étape 1 : supprimer tout CHECK sur module (il bloque le changement de type)
DO $$
DECLARE
  _constraint_name text;
BEGIN
  FOR _constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.permission_overrides'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%module%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.permission_overrides DROP CONSTRAINT %I',
      _constraint_name
    );
  END LOOP;
END $$;

-- Étape 2 : changer le type de colonne de enum vers text
ALTER TABLE public.permission_overrides
  ALTER COLUMN module TYPE text USING module::text;

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
