import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Le retour se fait toujours vers le site : l'adresse passée dans le lien n'est pas reprise
// telle quelle (elle finissait dans la page sans contrôle).
const SITE = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://ebnservicess.com").replace(/\/+$/, "");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Supabase sert le HTML des fonctions en texte brut : la page de confirmation
// est donc dans l'application (#/confirmer-appareil), qui appelle cette fonction
// en POST quand l'utilisateur clique sur « Confirmer ». Une simple ouverture du
// lien (GET, y compris par un antivirus de messagerie) ne confirme rien.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method === "GET") {
    // Anciens liens (e-mails déjà envoyés) : renvoi vers la page de l'application
    const token = new URL(req.url).searchParams.get("token") ?? "";
    return new Response(null, {
      status: 302,
      headers: { Location: `${SITE}/#/confirmer-appareil?token=${encodeURIComponent(token)}` },
    });
  }
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  let token = "";
  try {
    token = String((await req.json())?.token ?? "");
  } catch { /* corps invalide */ }
  if (!token) return json({ error: "Code de confirmation manquant." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: row, error } = await admin
    .from("device_sessions")
    .select("id, status, token_expires_at")
    .eq("confirmation_token", token)
    .maybeSingle();
  if (error || !row) return json({ error: "Ce lien n'est pas valable ou a déjà servi. Reconnectez-vous pour en recevoir un nouveau." }, 404);

  if (!row.token_expires_at || new Date(row.token_expires_at) < new Date()) {
    await admin.from("device_sessions").update({ status: "expired" }).eq("id", row.id);
    return json({ error: "Ce lien a expiré (15 minutes). Reconnectez-vous pour en recevoir un nouveau." }, 410);
  }

  await admin.from("device_sessions").update({
    status: "active",
    confirmation_token: null,
    token_expires_at: null,
    last_seen_at: new Date().toISOString(),
  }).eq("id", row.id);
  return json({ ok: true });
});
