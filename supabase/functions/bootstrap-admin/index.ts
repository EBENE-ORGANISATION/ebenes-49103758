import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, password, nom } = await req.json();
    if (!email || !password) return json({ error: "Email et mot de passe requis" }, 400);
    if (String(password).length < 8) return json({ error: "Mot de passe trop court (min 8)" }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Vérifie qu'aucun admin n'existe déjà
    const { count, error: countErr } = await admin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");
    if (countErr) return json({ error: countErr.message }, 500);
    if ((count ?? 0) > 0) {
      return json({ error: "Un administrateur existe déjà. Demandez-lui de créer votre compte." }, 403);
    }

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nom: nom || "Administrateur" },
    });
    if (error) return json({ error: error.message }, 400);

    const uid = created.user!.id;
    await admin.from("user_roles").insert({ user_id: uid, role: "admin" });
    if (nom) await admin.from("profiles").update({ nom }).eq("user_id", uid);

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}