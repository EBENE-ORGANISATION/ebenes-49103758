import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = "EBN Services <noreply@ebnservicess.com>";

const escapeHtml = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

type Payload = {
  type: string;
  record: Record<string, unknown>;
  societe_id: string;
};

const TYPE_LABELS: Record<string, string> = {
  transaction: "transaction",
  facture: "facture",
  employe: "employé",
  prime: "prime",
  absence: "absence",
  heures_sup: "heures supplémentaires",
  sanction: "sanction",
};

const describeAmount = (type: string, r: Record<string, any>): string => {
  if (type === "transaction") return `${Number(r.montant ?? 0).toLocaleString("fr-FR")} F CFA — ${escapeHtml(r.description)}`;
  if (type === "facture") return `Facture ${escapeHtml(r.numero)} — ${escapeHtml(r.client)} — ${Number(r.total_ttc ?? 0).toLocaleString("fr-FR")} F CFA`;
  if (type === "employe") return `${escapeHtml(r.nom)} (${escapeHtml(r.poste)})`;
  if (type === "prime") return `${escapeHtml(r.libelle ?? "Prime")} — ${Number(r.montant ?? 0).toLocaleString("fr-FR")} F CFA`;
  if (type === "absence") return `Absence du ${escapeHtml(r.date_debut)} au ${escapeHtml(r.date_fin)} (${Number(r.jours ?? 0)} j)`;
  if (type === "heures_sup") return `Heures sup mois ${escapeHtml(r.mois)}/${escapeHtml(r.annee)}`;
  if (type === "sanction") return `${escapeHtml(r.type ?? "Sanction")} — ${escapeHtml(r.motif)}`;
  return "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Internal-secret check: only DB triggers / cron may call this
    const provided = req.headers.get("x-internal-secret") ?? "";
    const { data: expected } = await admin.rpc("get_internal_webhook_secret");
    if (!expected || provided !== expected) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as Payload;
    const { type, record, societe_id } = payload;
    if (!type || !societe_id) {
      return new Response(JSON.stringify({ error: "invalid payload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Récupère la société
    const { data: societe } = await admin.from("societes").select("nom").eq("id", societe_id).maybeSingle();
    const societeNom = societe?.nom ?? "Votre société";

    // Destinataires : utilisateurs ayant accès à la société + rôle admin / chef_compta / chef_grh
    const { data: userSocietes } = await admin
      .from("user_societes")
      .select("user_id")
      .eq("societe_id", societe_id);

    const userIds = (userSocietes ?? []).map((u: any) => u.user_id);
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: roles } = await admin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds)
      .in("role", ["admin", "chef_compta", "chef_grh"]);

    const targetIds = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (targetIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: profiles } = await admin
      .from("profiles")
      .select("email, nom")
      .in("user_id", targetIds);

    const recipients = (profiles ?? []).map((p: any) => p.email).filter(Boolean);
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const typeLabel = TYPE_LABELS[type] ?? type;
    const detail = describeAmount(type, record as any);
    const subject = `[${societeNom}] Validation requise — ${typeLabel}`;
    const safeSociete = escapeHtml(societeNom);
    const safeTypeLabel = escapeHtml(typeLabel);
    const html = `
      <div style="font-family:Arial,sans-serif;color:#1F3864;max-width:560px;margin:0 auto;padding:20px;">
        <h2 style="color:#1F3864;">Nouvelle ${safeTypeLabel} en attente de validation</h2>
        <p><strong>Société :</strong> ${safeSociete}</p>
        <p><strong>Détail :</strong> ${detail}</p>
        <p>Connectez-vous à l'application pour valider ou rejeter cet élément.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
        <p style="color:#888;font-size:12px;">Notification automatique — EBN Services</p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: recipients, subject, html }),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Resend error", res.status, txt);
      return new Response(JSON.stringify({ error: "resend_failed", detail: txt }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, sent: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notification-validation error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});