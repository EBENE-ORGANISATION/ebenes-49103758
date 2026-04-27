-- 1. Ajout des colonnes branding sur societes
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS telephone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS site_web TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS couleur_primaire TEXT NOT NULL DEFAULT '#4C51BF',
  ADD COLUMN IF NOT EXISTS couleur_secondaire TEXT NOT NULL DEFAULT '#C05656',
  ADD COLUMN IF NOT EXISTS slogan TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mention_legale_pied TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS representant TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fonction_representant TEXT NOT NULL DEFAULT '';

-- 2. Bucket Storage pour les logos (public en lecture)
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos-societes', 'logos-societes', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Policies storage : lecture publique, écriture admin général
DROP POLICY IF EXISTS "Public read logos-societes" ON storage.objects;
CREATE POLICY "Public read logos-societes"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos-societes');

DROP POLICY IF EXISTS "Admin general inserts logos" ON storage.objects;
CREATE POLICY "Admin general inserts logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'logos-societes' AND public.is_admin_general(auth.uid()));

DROP POLICY IF EXISTS "Admin general updates logos" ON storage.objects;
CREATE POLICY "Admin general updates logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'logos-societes' AND public.is_admin_general(auth.uid()));

DROP POLICY IF EXISTS "Admin general deletes logos" ON storage.objects;
CREATE POLICY "Admin general deletes logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'logos-societes' AND public.is_admin_general(auth.uid()));

-- 4. Pré-remplissage de la société principale avec les infos EBENE
UPDATE public.societes
SET
  nom = 'EBENE SERVICES',
  nif = '1 002 088 759',
  email = COALESCE(NULLIF(email, ''), 'ebnservicess@gmail.com'),
  representant = COALESCE(NULLIF(representant, ''), 'BITHO SIMBAYA'),
  fonction_representant = COALESCE(NULLIF(fonction_representant, ''), 'Directeur'),
  mention_legale_pied = COALESCE(NULLIF(mention_legale_pied, ''),
    'Comptabilité tenue selon le référentiel SYSCOHADA révisé (Acte uniforme OHADA).')
WHERE nom IN ('Société principale', 'Societe principale');