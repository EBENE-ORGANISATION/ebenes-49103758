-- Fonction utilitaire : est-ce un chef de service ?
CREATE OR REPLACE FUNCTION public.is_chef(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('chef_compta'::app_role, 'chef_grh'::app_role)
  )
$$;

-- Fonction : utilisateur appartient au service compta (chef ou membre, ou admin)
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
  )
$$;

-- Fonction : utilisateur appartient au service GRH (chef ou membre, ou admin)
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
  )
$$;

-- Mise à jour des policies RLS sur app_state
DROP POLICY IF EXISTS "Roles can insert app_state" ON public.app_state;
DROP POLICY IF EXISTS "Roles can update app_state" ON public.app_state;
DROP POLICY IF EXISTS "Privileged roles can delete app_state" ON public.app_state;

CREATE POLICY "Service members can insert app_state"
ON public.app_state FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.in_service_compta(auth.uid())
  OR public.in_service_grh(auth.uid())
  -- compatibilité ascendante avec anciens rôles
  OR public.has_role(auth.uid(), 'comptable'::app_role)
  OR public.has_role(auth.uid(), 'rh'::app_role)
  OR public.has_role(auth.uid(), 'saisie'::app_role)
);

CREATE POLICY "Service members can update app_state"
ON public.app_state FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.in_service_compta(auth.uid())
  OR public.in_service_grh(auth.uid())
  OR public.has_role(auth.uid(), 'comptable'::app_role)
  OR public.has_role(auth.uid(), 'rh'::app_role)
  OR public.has_role(auth.uid(), 'saisie'::app_role)
);

CREATE POLICY "Chefs and admin can delete app_state"
ON public.app_state FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'chef_compta'::app_role)
  OR public.has_role(auth.uid(), 'chef_grh'::app_role)
);