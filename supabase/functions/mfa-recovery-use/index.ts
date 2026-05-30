import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Utilise un code de récupération pour DÉSENROLER tous les facteurs TOTP
 * de l'utilisateur. Après succès, l'utilisateur est en AAL1 et sera redirigé
 * vers MfaEnrollRequiredGate pour ré-enrôler un nouveau TOTP.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Session invalide" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const raw = String(body?.code ?? "").trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(raw)) {
      return new Response(JSON.stringify({ error: "Format de code invalide" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const normalized = raw.includes("-") ? raw : `${raw.slice(0, 4)}-${raw.slice(4)}`;
    const hash = await sha256Hex(normalized);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Trouve un code non utilisé qui correspond
    const { data: match } = await admin
      .from("mfa_recovery_codes")
      .select("id")
      .eq("user_id", userId)
      .eq("code_hash", hash)
      .is("used_at", null)
      .maybeSingle();

    if (!match) {
      return new Response(JSON.stringify({ error: "Code invalide ou déjà utilisé" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Marque comme utilisé
    await admin.from("mfa_recovery_codes").update({ used_at: new Date().toISOString() }).eq("id", match.id);

    // Désenrôle TOUS les facteurs TOTP de l'utilisateur (admin API)
    const { data: factorsData } = await admin.auth.admin.mfa.listFactors({ userId });
    const factors = factorsData?.factors ?? [];
    for (const f of factors) {
      try {
        await admin.auth.admin.mfa.deleteFactor({ userId, id: f.id });
      } catch (e) {
        console.error("deleteFactor failed", f.id, e);
      }
    }

    // Audit
    try {
      await admin.from("audit_log").insert({
        user_id: userId,
        action: "MFA_RECOVERY_USED",
        table_name: "mfa_recovery_codes",
        record_id: match.id,
      });
    } catch { /* audit best-effort */ }

    return new Response(JSON.stringify({ ok: true, factors_removed: factors.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mfa-recovery-use error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});