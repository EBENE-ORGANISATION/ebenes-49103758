-- Mise à jour de la config visuelle d'EBENE SERVICES uniquement
UPDATE public.societe_config
SET
  couleur_primaire = '#3D0000',
  couleur_secondaire = '#000000',
  couleur_accent = '#89604A',
  police = 'Poppins',
  logo_url = 'https://nmeyylvltlvvcvbhvxpz.supabase.co/storage/v1/object/public/logos-societes/b5fab405-e82e-402e-ac92-682926f60056/logo.png',
  updated_at = now()
WHERE societe_id = 'b5fab405-e82e-402e-ac92-682926f60056';

-- Idem côté table societes (couleurs et logo affichés dans certains composants)
UPDATE public.societes
SET
  couleur_primaire = '#3D0000',
  couleur_secondaire = '#89604A',
  logo_url = 'https://nmeyylvltlvvcvbhvxpz.supabase.co/storage/v1/object/public/logos-societes/b5fab405-e82e-402e-ac92-682926f60056/logo.png',
  slogan = COALESCE(NULLIF(slogan, ''), 'Commerce Général'),
  updated_at = now()
WHERE id = 'b5fab405-e82e-402e-ac92-682926f60056';