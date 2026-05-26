import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = "EBN Services <noreply@ebnservicess.com>";
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const joursEntre = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY);

type Alerte = { id: string; categorie: string; severite: "danger" | "warning" | "info"; titre: string; description: string };

async function computeAlertesForSociete(admin: any, societeId: string): Promise<Alerte[]> {
  const alertes: Alerte[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // 1. Factures impayées > 30j
  const { data: factures } = await admin
    .from("factures")
    .select("id, numero, client, date, statut, total_ttc")
    .eq("societe_id", societeId)
    .eq("statut", "en_attente");
  (factures ?? []).forEach((f: any) => {
    const d = new Date(f.date);
    if (isNaN(d.getTime())) return;
    const age = joursEntre(d, now);
    if (age > 30) {
      alertes.push({
        id: `facture-${f.id}`,
        categorie: "facture",
        severite: age > 60 ? "danger" : "warning",
        titre: `Facture ${f.numero} impayée`,
        description: `${f.client} — ${age} jours de retard (${Number(f.total_ttc).toLocaleString("fr-FR")} F CFA)`,
      });
    }
  });

  // 2. Échéances fiscales TVA/CNSS dans 7 jours (15 du mois)
  for (let offset = 0; offset <= 1; offset++) {
    const ech = new Date(now.getFullYear(), now.getMonth() + offset, 15);
    const j = joursEntre(now, ech);
    if (j < 0 || j > 7) continue;
    const ref = new Date(ech.getFullYear(), ech.getMonth() - 1, 1);
    const periode = ref.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const sev = j <= 3 ? "danger" : "warning";
    alertes.push({ id: `tva-${ref.getFullYear()}-${ref.getMonth() + 1}`, categorie: "fiscal", severite: sev as any, titre: `Échéance TVA dans ${j} j`, description: `Période ${periode}` });
    alertes.push({ id: `cnss-${ref.getFullYear()}-${ref.getMonth() + 1}`, categorie: "fiscal", severite: sev as any, titre: `Échéance CNSS dans ${j} j`, description: `Période ${periode}` });
  }

  // 3. CDD se terminant dans 30j
  const { data: emps } = await admin
    .from("employes")
    .select("nom, type_contrat, date_fin_contrat")
    .eq("societe_id", societeId)
    .eq("type_contrat", "cdd")
    .not("date_fin_contrat", "is", null);
  (emps ?? []).forEach((e: any) => {
    const fin = new Date(e.date_fin_contrat);
    if (isNaN(fin.getTime())) return;
    const j = joursEntre(now, fin);
    if (j < 0 || j > 30) return;
    alertes.push({
      id: `cdd-${e.nom}-${e.date_fin_contrat}`,
      categorie: "rh",
      severite: j <= 7 ? "danger" : "warning",
      titre: `Fin CDD ${e.nom} dans ${j} j`,
      description: `Contrat se terminant le ${fin.toLocaleDateString("fr-FR")}`,
    });
  });

  // 4. Stock sous seuil
  const { data: articles } = await admin
    .from("articles")
    .select("id, designation, stock, seuil_alerte, unite")
    .eq("societe_id", societeId);
  (articles ?? []).forEach((a: any) => {
    if (a.seuil_alerte > 0 && a.stock <= a.seuil_alerte) {
      alertes.push({
        id: `stock-${a.id}`,
        categorie: "stock",
        severite: a.stock === 0 ? "danger" : "warning",
        titre: `Stock bas : ${a.designation}`,
        description: `Stock actuel : ${a.stock} ${a.unite} (seuil : ${a.seuil_alerte})`,
      });
    }
  });

  return alertes;
}

function renderHtml(societeNom: string, alertes: Alerte[]): string {
  const colorBySev: Record<string, string> = { danger: "#C0392B", warning: "#E67E22", info: "#2980B9" };
  const items = alertes
    .map(
      (a) => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:${colorBySev[a.severite]};font-weight:bold;text-transform:uppercase;font-size:11px;">${a.severite}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">
          <div style="font-weight:bold;">${a.titre}</div>
          <div style="color:#666;font-size:13px;">${a.description}</div>
        </td>
      </tr>`
    )
    .join("");
  return `
    <div style="font-family:Arial,sans-serif;color:#1F3864;max-width:640px;margin:0 auto;padding:20px;">
      <h2 style="color:#1F3864;">Alertes du jour — ${societeNom}</h2>
      <p>${alertes.length} alerte${alertes.length > 1 ? "s" : ""} active${alertes.length > 1 ? "s" : ""} ce matin.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">${items}</table>
      <p style="color:#888;font-size:12px;margin-top:24px;">Digest quotidien automatique — EBN Services</p>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Internal-secret check: must be called by DB trigger / cron, not the public
    const provided = req.headers.get("x-internal-secret") ?? "";
    const { data: secretRow } = await admin
      .schema("vault" as any)
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", "internal_webhook_secret")
      .maybeSingle();
    const expected = (secretRow as any)?.decrypted_secret ?? "";
    if (!expected || provided !== expected) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: societes } = await admin.from("societes").select("id, nom").eq("statut", "active");
    let totalSent = 0;

    for (const s of societes ?? []) {
      const alertes = await computeAlertesForSociete(admin, s.id);
      if (alertes.length === 0) continue;

      const { data: us } = await admin.from("user_societes").select("user_id").eq("societe_id", s.id);
      const userIds = (us ?? []).map((u: any) => u.user_id);
      if (userIds.length === 0) continue;

      const { data: roles } = await admin
        .from("user_roles")
        .select("user_id")
        .in("user_id", userIds)
        .in("role", ["admin", "chef_compta", "chef_grh"]);
      const targetIds = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
      if (targetIds.length === 0) continue;

      const { data: profiles } = await admin.from("profiles").select("email").in("user_id", targetIds);
      const recipients = (profiles ?? []).map((p: any) => p.email).filter(Boolean);
      if (recipients.length === 0) continue;

      const html = renderHtml(s.nom, alertes);
      const subject = `[${s.nom}] ${alertes.length} alerte${alertes.length > 1 ? "s" : ""} du jour`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: recipients, subject, html }),
      });
      if (res.ok) totalSent += recipients.length;
      else console.error("Resend error for", s.nom, res.status, await res.text());
    }

    return new Response(JSON.stringify({ ok: true, totalSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notification-alertes error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});