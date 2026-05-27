import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PUBLIC_SITE_URL = Deno.env.get("PUBLIC_SITE_URL") ?? "https://ebnservicess.com";

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Session invalide" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { device_id } = await req.json();
    if (!device_id || typeof device_id !== "string") {
      return new Response(JSON.stringify({ error: "device_id requis" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const userAgent = req.headers.get("user-agent") ?? "";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

    // Existing active session for this device? Renew last_seen.
    const { data: existing } = await admin
      .from("device_sessions")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("device_id", device_id)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      await admin.from("device_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", existing.id);
      return new Response(JSON.stringify({ allowed: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Other active sessions on different devices?
    const { count } = await admin
      .from("device_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active")
      .neq("device_id", device_id)
      .gt("last_seen_at", fiveMinAgo);

    if (!count || count === 0) {
      // Allow immediately, mark active
      await admin.from("device_sessions").insert({
        user_id: user.id,
        device_id,
        status: "active",
        user_agent: userAgent,
        ip,
        last_seen_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ allowed: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Need confirmation: create pending row + send email
    const token = randomToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Clean previous pending entries for this device
    await admin.from("device_sessions").delete()
      .eq("user_id", user.id).eq("device_id", device_id).eq("status", "pending");

    await admin.from("device_sessions").insert({
      user_id: user.id,
      device_id,
      status: "pending",
      confirmation_token: token,
      token_expires_at: expiresAt,
      user_agent: userAgent,
      ip,
    });

    const confirmUrl = `${SUPABASE_URL}/functions/v1/confirm-login-device?token=${token}&redirect=${encodeURIComponent(PUBLIC_SITE_URL)}`;

    // Envoi via Lovable Emails (domaine vérifié notify.ebnservicess.com)
    const sendResp = await admin.functions.invoke("send-transactional-email", {
      body: {
        templateName: "device-confirmation",
        recipientEmail: user.email,
        idempotencyKey: `device-${token}`,
        templateData: { confirmUrl, userAgent: userAgent || "inconnu", ip: ip || "inconnue" },
      },
    });
    if (sendResp.error) {
      console.error("send-transactional-email error:", sendResp.error);
      return new Response(JSON.stringify({ error: "Échec d'envoi d'email" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ allowed: false, email: user.email }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});