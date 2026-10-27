-- Compléments du schéma de référence : ce que pg_dump --schema=public ne contient pas.
-- Relevé en lecture seule sur la production le 2026-10-27.
-- Idempotent : sans effet sur une base qui a déjà ces objets.
--
-- Volontairement absents (à refaire à la main sur une nouvelle base, voir
-- docs/supabase-baseline.md) :
--   * le secret du coffre internal_webhook_secret (valeur secrète) ;
--   * la tâche cron notification-alertes-daily (elle visait un ancien projet).

-- Extensions. pgcrypto, uuid-ossp, pg_stat_statements et supabase_vault sont
-- déjà installées sur tout projet Supabase ; pg_net et pg_cron non.
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Création du profil à l'inscription.
DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users";
CREATE TRIGGER "on_auth_user_created"
  AFTER INSERT ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();

-- Storage : compartiment des sauvegardes (privé).
INSERT INTO "storage"."buckets" ("id", "name", "public")
VALUES ('backups', 'backups', false)
ON CONFLICT ("id") DO NOTHING;

-- Storage : règles des logos de société. Le compartiment logos-societes
-- n'existe pas en production à cette date ; les règles, si.
DROP POLICY IF EXISTS "Logos: insert by admin" ON "storage"."objects";
CREATE POLICY "Logos: insert by admin" ON "storage"."objects"
  FOR INSERT TO "authenticated"
  WITH CHECK (("bucket_id" = 'logos-societes'::text) AND ("public"."is_admin_general"("auth"."uid"()) OR ("public"."is_admin"("auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_societes" "us"
  WHERE (("us"."user_id" = "auth"."uid"()) AND (("us"."societe_id")::text = ("storage"."foldername"("objects"."name"))[1])))))));

DROP POLICY IF EXISTS "Logos: update by admin" ON "storage"."objects";
CREATE POLICY "Logos: update by admin" ON "storage"."objects"
  FOR UPDATE TO "authenticated"
  USING (("bucket_id" = 'logos-societes'::text) AND ("public"."is_admin_general"("auth"."uid"()) OR ("public"."is_admin"("auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_societes" "us"
  WHERE (("us"."user_id" = "auth"."uid"()) AND (("us"."societe_id")::text = ("storage"."foldername"("objects"."name"))[1])))))));

DROP POLICY IF EXISTS "Logos: delete by admin" ON "storage"."objects";
CREATE POLICY "Logos: delete by admin" ON "storage"."objects"
  FOR DELETE TO "authenticated"
  USING (("bucket_id" = 'logos-societes'::text) AND ("public"."is_admin_general"("auth"."uid"()) OR ("public"."is_admin"("auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_societes" "us"
  WHERE (("us"."user_id" = "auth"."uid"()) AND (("us"."societe_id")::text = ("storage"."foldername"("objects"."name"))[1])))))));

-- Temps réel : diffusion des changements de app_state.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'app_state'
  ) THEN
    ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."app_state";
  END IF;
END $$;
