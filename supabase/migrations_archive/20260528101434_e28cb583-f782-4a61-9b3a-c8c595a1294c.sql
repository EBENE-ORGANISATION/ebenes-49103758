ALTER TABLE public.societe_config
  ALTER COLUMN module_stock SET DEFAULT false,
  ALTER COLUMN module_grh SET DEFAULT false,
  ALTER COLUMN module_fiscalite SET DEFAULT false,
  ALTER COLUMN module_immobilisations SET DEFAULT false,
  ALTER COLUMN module_ia SET DEFAULT false,
  ALTER COLUMN module_multi_societes SET DEFAULT false;