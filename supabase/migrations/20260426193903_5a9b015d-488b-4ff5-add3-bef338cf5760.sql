-- Ajout d'une colonne `service` informative sur user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS service TEXT
  CHECK (service IS NULL OR service IN ('compta', 'grh', 'transverse'));

COMMENT ON COLUMN public.user_roles.service IS
  'Service informatif rattaché au rôle (compta/grh/transverse). La logique de permissions reste basée sur l''enum app_role.';

-- Backfill basé sur l'enum existant
UPDATE public.user_roles
SET service = CASE
  WHEN role IN ('chef_compta', 'membre_compta', 'comptable') THEN 'compta'
  WHEN role IN ('chef_grh', 'membre_grh', 'rh') THEN 'grh'
  WHEN role = 'admin' THEN 'transverse'
  ELSE service
END
WHERE service IS NULL;