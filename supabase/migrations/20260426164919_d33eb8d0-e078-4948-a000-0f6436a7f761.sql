-- 1. Table des autorisations cross-service temporaires
CREATE TABLE IF NOT EXISTS public.cross_service_grants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('compta', 'grh')),
  level TEXT NOT NULL DEFAULT 'chef' CHECK (level IN ('membre', 'chef')),
  granted_by UUID,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Validation : expires_at doit être dans le futur à la création (via trigger, pas CHECK)
CREATE OR REPLACE FUNCTION public.validate_grant_expiration()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'expires_at doit être dans le futur';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_grant_expiration_trigger ON public.cross_service_grants;
CREATE TRIGGER validate_grant_expiration_trigger
  BEFORE INSERT OR UPDATE ON public.cross_service_grants
  FOR EACH ROW EXECUTE FUNCTION public.validate_grant_expiration();

-- Index pour les lookups rapides
CREATE INDEX IF NOT EXISTS idx_cross_grants_user_active
  ON public.cross_service_grants(user_id, service, expires_at);

-- 2. RLS
ALTER TABLE public.cross_service_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage grants - all"
  ON public.cross_service_grants FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can view own grants"
  ON public.cross_service_grants FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Fonction utilitaire : vérifie une autorisation active
CREATE OR REPLACE FUNCTION public.has_active_grant(_user_id uuid, _service text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cross_service_grants
    WHERE user_id = _user_id
      AND service = _service
      AND expires_at > now()
  )
$$;

CREATE OR REPLACE FUNCTION public.has_active_chef_grant(_user_id uuid, _service text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cross_service_grants
    WHERE user_id = _user_id
      AND service = _service
      AND level = 'chef'
      AND expires_at > now()
  )
$$;

-- 4. Mettre à jour les fonctions de service pour inclure les grants actifs
CREATE OR REPLACE FUNCTION public.in_service_compta(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'chef_compta'::app_role, 'membre_compta'::app_role)
  ) OR public.has_active_grant(_user_id, 'compta')
$$;

CREATE OR REPLACE FUNCTION public.in_service_grh(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'chef_grh'::app_role, 'membre_grh'::app_role)
  ) OR public.has_active_grant(_user_id, 'grh')
$$;

-- 5. Fonctions chef-spécifiques (pour la suppression cross-service)
CREATE OR REPLACE FUNCTION public.is_chef_compta(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
      OR public.has_role(_user_id, 'chef_compta'::app_role)
      OR public.has_active_chef_grant(_user_id, 'compta')
$$;

CREATE OR REPLACE FUNCTION public.is_chef_grh(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
      OR public.has_role(_user_id, 'chef_grh'::app_role)
      OR public.has_active_chef_grant(_user_id, 'grh')
$$;

-- 6. Mettre à jour la policy DELETE de app_state pour utiliser les nouvelles fonctions
DROP POLICY IF EXISTS "Chefs and admin can delete app_state" ON public.app_state;
CREATE POLICY "Chefs and admin can delete app_state"
  ON public.app_state FOR DELETE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.is_chef_compta(auth.uid())
    OR public.is_chef_grh(auth.uid())
  );