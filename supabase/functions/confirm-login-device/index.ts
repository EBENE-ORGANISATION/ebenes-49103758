import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function htmlPage(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:40px 20px;color:#1a1a1a}
  .card{max-width:480px;margin:40px auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,.06);text-align:center}
  h1{margin:0 0 12px;font-size:22px}p{color:#555;line-height:1.5}
  a{display:inline-block;margin-top:24px;background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold}</style>
  </head><body><div class="card">${body}</div></body></html>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const redirect = url.searchParams.get("redirect") ?? "/";

  if (!token) {
    return new Response(htmlPage("Lien invalide", `<h1>Lien invalide</h1><p>Aucun token fourni.</p>`), { headers: { "Content-Type": "text/html" }, status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: row, error } = await admin
    .from("device_sessions")
    .select("id, status, token_expires_at")
    .eq("confirmation_token", token)
    .maybeSingle();

  if (error || !row) {
    return new Response(htmlPage("Lien invalide", `<h1>Lien invalide ou expiré</h1><p>Ce lien de confirmation n'est pas valide.</p>`), { headers: { "Content-Type": "text/html" }, status: 404 });
  }

  if (row.status === "active") {
    return new Response(htmlPage("Déjà confirmé", `<h1>✅ Déjà confirmé</h1><p>Cet appareil est déjà autorisé. Vous pouvez vous reconnecter.</p><a href="${redirect}">Retour à l'application</a>`), { headers: { "Content-Type": "text/html" } });
  }

  if (!row.token_expires_at || new Date(row.token_expires_at) < new Date()) {
    await admin.from("device_sessions").update({ status: "expired" }).eq("id", row.id);
    return new Response(htmlPage("Expiré", `<h1>Lien expiré</h1><p>Veuillez vous reconnecter pour recevoir un nouveau lien.</p><a href="${redirect}">Retour</a>`), { headers: { "Content-Type": "text/html" }, status: 410 });
  }

  await admin.from("device_sessions").update({
    status: "active",
    confirmation_token: null,
    token_expires_at: null,
    last_seen_at: new Date().toISOString(),
  }).eq("id", row.id);

  const target = `${redirect}${redirect.includes("?") ? "&" : "?"}device_confirmed=1`;
  return new Response(htmlPage("Confirmé", `<h1>✅ Connexion confirmée</h1><p>Vous pouvez maintenant retourner sur l'appareil d'origine et vous reconnecter.</p><a href="${target}">Ouvrir l'application</a>`), { headers: { "Content-Type": "text/html" } });
});