-- 1) Flag "built-in" pour distinguer les services système (GRH, Comptabilité)
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS built_in boolean NOT NULL DEFAULT false;

-- 2) FK service_membres.user_id -> profiles.user_id pour permettre l'embed PostgREST
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_membres_user_id_profiles_fkey'
  ) THEN
    ALTER TABLE public.service_membres
      ADD CONSTRAINT service_membres_user_id_profiles_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3) Empêcher la suppression des services built-in
CREATE OR REPLACE FUNCTION public.prevent_builtin_service_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.built_in THEN
    RAISE EXCEPTION 'Le service « % » est intégré et ne peut pas être supprimé.', OLD.nom;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tg_services_prevent_builtin_delete ON public.services;
CREATE TRIGGER tg_services_prevent_builtin_delete
BEFORE DELETE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.prevent_builtin_service_delete();

-- 4) Seed des deux services par défaut pour toutes les sociétés existantes
INSERT INTO public.services (societe_id, nom, description, couleur, built_in)
SELECT s.id, 'Comptabilité', 'Service intégré — gestion comptable et financière', '#0ea5e9', true
FROM public.societes s
WHERE NOT EXISTS (
  SELECT 1 FROM public.services x
  WHERE x.societe_id = s.id AND x.nom = 'Comptabilité' AND x.built_in = true
);

INSERT INTO public.services (societe_id, nom, description, couleur, built_in)
SELECT s.id, 'GRH', 'Service intégré — gestion des ressources humaines', '#8b5cf6', true
FROM public.societes s
WHERE NOT EXISTS (
  SELECT 1 FROM public.services x
  WHERE x.societe_id = s.id AND x.nom = 'GRH' AND x.built_in = true
);

-- 5) Mise à jour de handle_new_societe pour seed automatique des nouveaux sociétés
CREATE OR REPLACE FUNCTION public.handle_new_societe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.societe_config (societe_id)
  VALUES (NEW.id)
  ON CONFLICT (societe_id) DO NOTHING;

  INSERT INTO public.services (societe_id, nom, description, couleur, built_in)
  VALUES
    (NEW.id, 'Comptabilité', 'Service intégré — gestion comptable et financière', '#0ea5e9', true),
    (NEW.id, 'GRH', 'Service intégré — gestion des ressources humaines', '#8b5cf6', true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;