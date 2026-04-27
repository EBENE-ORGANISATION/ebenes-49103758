-- Création de la société "modèle" pour les défauts globaux
INSERT INTO public.societes (nom, slug, plan, statut)
VALUES ('Défauts globaux (modèle)', '_modele', 'enterprise', 'active')
ON CONFLICT DO NOTHING;

-- societe_config est créée automatiquement par le trigger handle_new_societe

-- Fonction utilitaire pour identifier la société modèle
CREATE OR REPLACE FUNCTION public.is_modele_societe(_societe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.societes
    WHERE id = _societe_id AND slug = '_modele'
  )
$$;