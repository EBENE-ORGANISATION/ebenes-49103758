-- Enum des modules de l'application
DO $$ BEGIN
  CREATE TYPE public.app_module AS ENUM (
    'dashboard',
    'compta',
    'factures',
    'stock',
    'immobilisations',
    'fiscalite',
    'parametres_sociaux',
    'grh'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enum des niveaux d'accès
DO $$ BEGIN
  CREATE TYPE public.access_level AS ENUM ('none', 'read', 'write', 'validate');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table de surcharges
CREATE TABLE IF NOT EXISTS public.permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  module public.app_module NOT NULL,
  level public.access_level NOT NULL,
  granted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);

ALTER TABLE public.permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own overrides"
  ON public.permission_overrides FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins insert overrides"
  ON public.permission_overrides FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins update overrides"
  ON public.permission_overrides FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins delete overrides"
  ON public.permission_overrides FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_permission_overrides_updated
BEFORE UPDATE ON public.permission_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
