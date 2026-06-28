// ============================================================================
// drive-backup — Sauvegarde / restauration via Supabase Storage
// ----------------------------------------------------------------------------
// Remplace l'ancien connecteur Google Drive de Lovable. Stocke les snapshots
// JSON dans un bucket privé `backups`, dans un dossier propre à chaque
// utilisateur (<user_id>/backup-<timestamp>.json).
// Contrat inchangé (côté frontend src/lib/googleDrive.ts) :
//   - POST  { snapshot }                       → { ok, file }
//   - GET   ?action=list                       → { ok, files: [...] }
//   - GET   ?action=download&fileId=<path>     → { ok, data }
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "backups";
const MAX_LIST = 20;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Authentifier l'utilisateur via son JWT ────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ ok: false, error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    // ── Client service_role pour les opérations Storage ───────────────────
    const admin = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // S'assurer que le bucket existe (idempotent)
    await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});

    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? (req.method === "POST" ? "backup" : "list");

    // ── LISTE des sauvegardes de l'utilisateur ────────────────────────────
    if (action === "list") {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .list(userId, { limit: MAX_LIST, sortBy: { column: "created_at", order: "desc" } });
      if (error) return json({ ok: false, error: error.message }, 500);
      const files = (data ?? [])
        .filter((f) => f.name.endsWith(".json"))
        .map((f) => ({
          id: `${userId}/${f.name}`,
          name: f.name,
          modifiedTime: f.updated_at ?? f.created_at ?? new Date().toISOString(),
          size: f.metadata?.size != null ? String(f.metadata.size) : undefined,
        }));
      return json({ ok: true, files });
    }

    // ── TÉLÉCHARGEMENT d'une sauvegarde ───────────────────────────────────
    if (action === "download") {
      const fileId = url.searchParams.get("fileId");
      if (!fileId) return json({ ok: false, error: "fileId manquant" }, 400);
      // Sécurité : un utilisateur ne peut télécharger que ses propres fichiers
      if (!fileId.startsWith(`${userId}/`)) {
        return json({ ok: false, error: "Accès refusé" }, 403);
      }
      const { data, error } = await admin.storage.from(BUCKET).download(fileId);
      if (error || !data) return json({ ok: false, error: error?.message ?? "Introuvable" }, 404);
      const text = await data.text();
      let snapshot: unknown;
      try {
        snapshot = JSON.parse(text);
      } catch {
        return json({ ok: false, error: "Snapshot illisible" }, 500);
      }
      return json({ ok: true, data: snapshot });
    }

    // ── BACKUP (POST { snapshot }) ────────────────────────────────────────
    if (action === "backup") {
      const body = await req.json().catch(() => ({}));
      const snapshot = body?.snapshot;
      if (!snapshot || typeof snapshot !== "object") {
        return json({ ok: false, error: "snapshot manquant" }, 400);
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const name = `backup-${stamp}.json`;
      const path = `${userId}/${name}`;
      const payload = JSON.stringify(snapshot);
      const { error } = await admin.storage
        .from(BUCKET)
        .upload(path, new Blob([payload], { type: "application/json" }), {
          contentType: "application/json",
          upsert: false,
        });
      if (error) return json({ ok: false, error: error.message }, 500);

      // Purge : ne garder que les 20 dernières sauvegardes
      const { data: existing } = await admin.storage
        .from(BUCKET)
        .list(userId, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      const toDelete = (existing ?? [])
        .filter((f) => f.name.endsWith(".json"))
        .slice(MAX_LIST)
        .map((f) => `${userId}/${f.name}`);
      if (toDelete.length > 0) {
        await admin.storage.from(BUCKET).remove(toDelete).catch(() => {});
      }

      return json({
        ok: true,
        file: {
          id: path,
          name,
          modifiedTime: new Date().toISOString(),
          size: String(payload.length),
        },
      });
    }

    return json({ ok: false, error: `Action inconnue : ${action}` }, 400);
  } catch (e) {
    console.error("[drive-backup] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
