import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const BACKUP_FOLDER = "EBENE_BACKUPS";

function authHeaders() {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_DRIVE_API_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY non configuré");
  if (!GOOGLE_DRIVE_API_KEY) throw new Error("GOOGLE_DRIVE_API_KEY non configuré (connecteur Google Drive)");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
  };
}

async function gFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers || {}) },
  });
}

async function ensureFolderId(): Promise<string> {
  // Cherche un dossier nommé EBENE_BACKUPS, non supprimé, créé par cette app (drive.file)
  const q = encodeURIComponent(
    `name='${BACKUP_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const search = await gFetch(
    `/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=10`
  );
  if (!search.ok) {
    const t = await search.text();
    throw new Error(`Drive search folder failed [${search.status}]: ${t}`);
  }
  const sj = (await search.json()) as { files?: Array<{ id: string; name: string }> };
  if (sj.files && sj.files.length > 0) return sj.files[0].id;

  // Créer le dossier
  const create = await gFetch(`/drive/v3/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: BACKUP_FOLDER,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  if (!create.ok) {
    const t = await create.text();
    throw new Error(`Drive create folder failed [${create.status}]: ${t}`);
  }
  const cj = (await create.json()) as { id: string };
  return cj.id;
}

function todayName(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `EBENE_Backup_${yyyy}-${mm}-${dd}.json`;
}

async function findTodayFile(folderId: string, name: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${name}' and '${folderId}' in parents and trashed=false`);
  const r = await gFetch(`/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5`);
  if (!r.ok) return null;
  const j = (await r.json()) as { files?: Array<{ id: string }> };
  return j.files && j.files.length > 0 ? j.files[0].id : null;
}

async function uploadJson(payload: unknown, folderId: string, fileId: string | null) {
  const name = todayName();
  const json = JSON.stringify(payload);
  const boundary = "ebene_boundary_" + crypto.randomUUID();
  const meta = fileId
    ? { name, mimeType: "application/json" }
    : { name, mimeType: "application/json", parents: [folderId] };

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${json}\r\n` +
    `--${boundary}--`;

  const url = fileId
    ? `/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,name,modifiedTime`
    : `/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime`;

  const r = await gFetch(url, {
    method: fileId ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Drive upload failed [${r.status}]: ${t}`);
  }
  return (await r.json()) as { id: string; name: string; modifiedTime: string };
}

async function listBackups(folderId: string) {
  const q = encodeURIComponent(
    `'${folderId}' in parents and trashed=false and mimeType='application/json'`
  );
  const r = await gFetch(
    `/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=10&fields=files(id,name,modifiedTime,size)`
  );
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Drive list failed [${r.status}]: ${t}`);
  }
  const j = (await r.json()) as { files?: unknown[] };
  return j.files ?? [];
}

async function downloadFile(fileId: string) {
  const r = await gFetch(`/drive/v3/files/${fileId}?alt=media`);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Drive download failed [${r.status}]: ${t}`);
  }
  return await r.json();
}

async function requireAuthUser(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) throw new Error("Authentification requise");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new Error("Session invalide");
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuthUser(req);

    const url = new URL(req.url);
    // Action via querystring pour rester simple
    const action = url.searchParams.get("action") ?? "backup";

    if (action === "list") {
      const folderId = await ensureFolderId();
      const files = await listBackups(folderId);
      return new Response(JSON.stringify({ ok: true, files }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "download") {
      const fileId = url.searchParams.get("fileId");
      if (!fileId) throw new Error("fileId requis");
      const data = await downloadFile(fileId);
      return new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: backup (POST avec body { snapshot })
    if (req.method !== "POST") throw new Error("POST requis");
    const body = (await req.json()) as { snapshot?: unknown };
    if (!body?.snapshot || typeof body.snapshot !== "object") {
      throw new Error("snapshot manquant");
    }
    const folderId = await ensureFolderId();
    const existing = await findTodayFile(folderId, todayName());
    const file = await uploadJson(body.snapshot, folderId, existing);
    return new Response(JSON.stringify({ ok: true, file }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[drive-backup] error:", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});