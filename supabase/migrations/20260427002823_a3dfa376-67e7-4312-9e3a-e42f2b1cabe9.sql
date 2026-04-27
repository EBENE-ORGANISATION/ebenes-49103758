-- ============================================================
-- 1. Table societes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.societes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  nif TEXT NOT NULL DEFAULT '',
  rccm TEXT NOT NULL DEFAULT '',
  adresse TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.societes ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_societes_updated_at
BEFORE UPDATE ON public.societes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. Table user_societes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_societes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE (user_id, societe_id)
);

CREATE INDEX IF NOT EXISTS idx_user_societes_user ON public.user_societes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_societes_societe ON public.user_societes(societe_id);

ALTER TABLE public.user_societes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. Fonctions de sécurité
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin_general(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin_general'::app_role)
$$;

CREATE OR REPLACE FUNCTION public.has_societe_access(_user_id UUID, _societe_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_general(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.user_societes
        WHERE user_id = _user_id AND societe_id = _societe_id
      )
$$;

CREATE OR REPLACE FUNCTION public.app_state_societe_id(_key TEXT)
RETURNS UUID
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_uuid TEXT;
BEGIN
  IF _key LIKE 's:%' THEN
    v_uuid := split_part(_key, ':', 2);
    BEGIN
      RETURN v_uuid::uuid;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
  END IF;
  RETURN NULL;
END;
$$;

-- ============================================================
-- 4. RLS societes
-- ============================================================
CREATE POLICY "Users view their societes"
ON public.societes FOR SELECT TO authenticated
USING (
  public.is_admin_general(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_societes
    WHERE societe_id = societes.id AND user_id = auth.uid()
  )
);

CREATE POLICY "Admin general inserts societes"
ON public.societes FOR INSERT TO authenticated
WITH CHECK (public.is_admin_general(auth.uid()));

CREATE POLICY "Admin general updates societes"
ON public.societes FOR UPDATE TO authenticated
USING (public.is_admin_general(auth.uid()))
WITH CHECK (public.is_admin_general(auth.uid()));

CREATE POLICY "Admin general deletes societes"
ON public.societes FOR DELETE TO authenticated
USING (public.is_admin_general(auth.uid()));

-- ============================================================
-- 5. RLS user_societes
-- ============================================================
CREATE POLICY "Users view their links"
ON public.user_societes FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_admin_general(auth.uid()));

CREATE POLICY "Admin general manages links - insert"
ON public.user_societes FOR INSERT TO authenticated
WITH CHECK (public.is_admin_general(auth.uid()));

CREATE POLICY "Admin general manages links - update"
ON public.user_societes FOR UPDATE TO authenticated
USING (public.is_admin_general(auth.uid()))
WITH CHECK (public.is_admin_general(auth.uid()));

CREATE POLICY "Admin general manages links - delete"
ON public.user_societes FOR DELETE TO authenticated
USING (public.is_admin_general(auth.uid()));

-- ============================================================
-- 6. RLS app_state (multi-société)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view app_state" ON public.app_state;
DROP POLICY IF EXISTS "Service members can insert app_state" ON public.app_state;
DROP POLICY IF EXISTS "Service members can update app_state" ON public.app_state;
DROP POLICY IF EXISTS "Chefs and admin can delete app_state" ON public.app_state;

CREATE POLICY "View app_state by societe"
ON public.app_state FOR SELECT TO authenticated
USING (
  public.app_state_societe_id(key) IS NULL
  OR public.has_societe_access(auth.uid(), public.app_state_societe_id(key))
);

CREATE POLICY "Insert app_state by societe"
ON public.app_state FOR INSERT TO authenticated
WITH CHECK (
  (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_admin_general(auth.uid())
    OR in_service_compta(auth.uid())
    OR in_service_grh(auth.uid())
    OR has_role(auth.uid(), 'comptable'::app_role)
    OR has_role(auth.uid(), 'rh'::app_role)
    OR has_role(auth.uid(), 'saisie'::app_role)
  )
  AND (
    public.app_state_societe_id(key) IS NULL
    OR public.has_societe_access(auth.uid(), public.app_state_societe_id(key))
  )
);

CREATE POLICY "Update app_state by societe"
ON public.app_state FOR UPDATE TO authenticated
USING (
  public.app_state_societe_id(key) IS NULL
  OR public.has_societe_access(auth.uid(), public.app_state_societe_id(key))
)
WITH CHECK (
  public.app_state_societe_id(key) IS NULL
  OR public.has_societe_access(auth.uid(), public.app_state_societe_id(key))
);

CREATE POLICY "Delete app_state by societe"
ON public.app_state FOR DELETE TO authenticated
USING (
  is_admin_general(auth.uid())
  OR (
    (
      public.app_state_societe_id(key) IS NULL
      OR public.has_societe_access(auth.uid(), public.app_state_societe_id(key))
    )
    AND (is_admin(auth.uid()) OR is_chef_compta(auth.uid()) OR is_chef_grh(auth.uid()))
  )
);

-- ============================================================
-- 7. Migration : société principale + liaisons + promotion admins
-- ============================================================
DO $$
DECLARE
  v_societe_id UUID;
  v_user RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.societes) THEN
    INSERT INTO public.societes (nom, nif, rccm, adresse)
    VALUES ('Société principale', '', '', '')
    RETURNING id INTO v_societe_id;
  ELSE
    SELECT id INTO v_societe_id FROM public.societes ORDER BY created_at LIMIT 1;
  END IF;

  FOR v_user IN SELECT DISTINCT user_id FROM public.profiles LOOP
    INSERT INTO public.user_societes (user_id, societe_id)
    VALUES (v_user.user_id, v_societe_id)
    ON CONFLICT (user_id, societe_id) DO NOTHING;
  END LOOP;

  INSERT INTO public.user_roles (user_id, role)
  SELECT DISTINCT user_id, 'admin_general'::app_role
  FROM public.user_roles
  WHERE role = 'admin'::app_role
  ON CONFLICT DO NOTHING;
END $$;