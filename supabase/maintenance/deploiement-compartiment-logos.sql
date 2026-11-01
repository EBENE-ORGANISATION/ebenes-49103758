-- Déploiement de la migration 20261102090000 (compartiment des logos de société),
-- avec inscription dans l'historique, en une seule transaction. À lancer une fois.
-- Généré depuis supabase/migrations ; ne pas modifier à la main.
BEGIN;
DO $g$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261101131000') THEN
    RAISE EXCEPTION 'La migration audit_noms_cabinet n est pas inscrite : arrêt.';
  END IF;
END $g$;
-- Compartiment des logos de société. Les règles d'écriture existent depuis la
-- baseline, mais pas le compartiment : tout envoi de logo échouait, et le logo
-- d'EBENE SERVICES pointait encore vers l'ancien projet (bloqué par la CSP).
-- Public en lecture (adresse publique dans l'en-tête et les documents),
-- images matricielles seulement (pas de SVG, qui peut porter du script), 2 Mo.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('logos-societes', 'logos-societes', true, 2097152,
        ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- L'envoi se fait avec upsert, qui demande aussi la lecture de l'objet :
-- même périmètre que la modification.
DROP POLICY IF EXISTS "Logos: select by admin" ON "storage"."objects";
CREATE POLICY "Logos: select by admin" ON "storage"."objects"
  FOR SELECT TO "authenticated"
  USING (("bucket_id" = 'logos-societes'::text) AND ("public"."is_admin_general"("auth"."uid"()) OR ("public"."is_admin"("auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_societes" "us"
  WHERE (("us"."user_id" = "auth"."uid"()) AND (("us"."societe_id")::text = ("storage"."foldername"("objects"."name"))[1])))))));
INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES ('20261102090000', 'compartiment_logos', ARRAY[$migration_sql$
-- Compartiment des logos de société. Les règles d'écriture existent depuis la
-- baseline, mais pas le compartiment : tout envoi de logo échouait, et le logo
-- d'EBENE SERVICES pointait encore vers l'ancien projet (bloqué par la CSP).
-- Public en lecture (adresse publique dans l'en-tête et les documents),
-- images matricielles seulement (pas de SVG, qui peut porter du script), 2 Mo.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('logos-societes', 'logos-societes', true, 2097152,
        ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- L'envoi se fait avec upsert, qui demande aussi la lecture de l'objet :
-- même périmètre que la modification.
DROP POLICY IF EXISTS "Logos: select by admin" ON "storage"."objects";
CREATE POLICY "Logos: select by admin" ON "storage"."objects"
  FOR SELECT TO "authenticated"
  USING (("bucket_id" = 'logos-societes'::text) AND ("public"."is_admin_general"("auth"."uid"()) OR ("public"."is_admin"("auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_societes" "us"
  WHERE (("us"."user_id" = "auth"."uid"()) AND (("us"."societe_id")::text = ("storage"."foldername"("objects"."name"))[1])))))));
$migration_sql$])
ON CONFLICT (version) DO NOTHING;
COMMIT;
SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'logos-societes';
