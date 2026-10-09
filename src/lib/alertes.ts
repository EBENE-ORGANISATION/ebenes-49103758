import type {
  Activite,
  Article,
  DonneesMensuelles,
  Employe,
  Facture,
  MoisData,
} from "@/types/ebene";
import { moisKey, isoLocal, formatMontant, formatSolde } from "@/lib/ebene-utils";
import { soldeCaisse } from "@/lib/ecrituresTresorerie";
import { supabase } from "@/integrations/supabase/client";

export type AlerteSeverite = "info" | "warning" | "danger";
export type AlerteCategorie = "facture" | "fiscal" | "rh" | "stock" | "tresorerie";

export interface Alerte {
  id: string;
  categorie: AlerteCategorie;
  severite: AlerteSeverite;
  titre: string;
  description: string;
  date?: string;
}

export interface AlertesStoreInput {
  donneesMensuelles: DonneesMensuelles;
  employes: Employe[];
  articles: Article[];
  /** Activités : caisses des annexes (sous-comptes de 571). */
  activites?: Activite[];
}

const MS_PAR_JOUR = 1000 * 60 * 60 * 24;

const joursEntre = (a: Date, b: Date) =>
  Math.floor((b.getTime() - a.getTime()) / MS_PAR_JOUR);

/** Cotisations et IRPP retenus sur les salaires et non encore reversés. */
export interface DettesPaie {
  cnss: number; // 431
  amu: number;  // 433
  irpp: number; // 447
}

/**
 * Montants dus aux organismes : solde créditeur des comptes 431, 433 et 447.
 * Avec `avant`, seules les retenues comptabilisées avant cette date sont
 * comptées (les reversements, eux, sont tous déduits) : c'est ce qui aurait
 * déjà dû être reversé.
 */
export const dettesPaie = (donnees: DonneesMensuelles, avant?: string): DettesPaie => {
  const credit: DettesPaie = { cnss: 0, amu: 0, irpp: 0 };
  const debit: DettesPaie = { cnss: 0, amu: 0, irpp: 0 };
  const cle = (compte: string): keyof DettesPaie | null =>
    compte.startsWith("431") ? "cnss" : compte.startsWith("433") ? "amu" : compte.startsWith("447") ? "irpp" : null;
  for (const m of Object.values(donnees || {})) {
    for (const e of m?.ecritures || []) {
      if (e.statut === "brouillon") continue;
      for (const l of e.lignes || []) {
        const k = cle(l.compte);
        if (!k) continue;
        debit[k] += l.debit;
        if (!avant || (e.date ?? "") < avant) credit[k] += l.credit;
      }
    }
  }
  const du = (k: keyof DettesPaie) => Math.max(0, Math.round(credit[k] - debit[k]));
  return { cnss: du("cnss"), amu: du("amu"), irpp: du("irpp") };
};

const detailDettes = (d: DettesPaie) =>
  [
    d.cnss > 0 && `CNSS (431) ${formatMontant(d.cnss)}`,
    d.amu > 0 && `AMU (433) ${formatMontant(d.amu)}`,
    d.irpp > 0 && `IRPP (447) ${formatMontant(d.irpp)}`,
  ].filter(Boolean).join(" • ");

/**
 * Détecte les alertes actives à partir du store.
 * Détecte :
 *  - Factures impayées de plus de 30 jours
 *  - Échéances fiscales (TVA, CNSS) dans les 7 jours
 *  - Contrats CDD se terminant dans les 30 jours
 *  - Articles dont le stock est sous le seuil d'alerte
 */
export const getAlertes = (store: AlertesStoreInput): Alerte[] => {
  const alertes: Alerte[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // ─── 1. Factures impayées > 30 jours ──────────────────────────────────────
  Object.values(store.donneesMensuelles || {}).forEach((m: MoisData) => {
    (m?.factures || []).forEach((f: Facture) => {
      if (f.statut !== "en_attente") return;
      const d = new Date(f.date);
      if (isNaN(d.getTime())) return;
      const age = joursEntre(d, now);
      if (age > 30) {
        alertes.push({
          id: `facture-${f.id}`,
          categorie: "facture",
          severite: age > 60 ? "danger" : "warning",
          titre: `Facture ${f.numero} impayée`,
          description: `${f.client} — ${age} jours de retard (${f.totalTtc.toLocaleString("fr-FR")} F CFA)`,
          date: f.date,
        });
      }
    });
  });

  // ─── 2. Échéances fiscales TVA / CNSS dans les 7 jours ────────────────────
  // Convention : TVA et CNSS dues le 15 du mois suivant la période.
  // On regarde les 2 prochaines échéances et on alerte si ≤ 7 jours.
  for (let offset = 0; offset <= 1; offset++) {
    const echeance = new Date(now.getFullYear(), now.getMonth() + offset, 15);
    const jours = joursEntre(now, echeance);
    if (jours < 0 || jours > 7) continue;

    // période de référence = mois précédent l'échéance
    const ref = new Date(echeance.getFullYear(), echeance.getMonth() - 1, 1);
    const periodeKey = moisKey(ref.getFullYear(), ref.getMonth() + 1);
    const periodeLabel = ref.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
    const dateISO = isoLocal(echeance);
    const sev: AlerteSeverite = jours <= 3 ? "danger" : "warning";

    alertes.push({
      id: `tva-${periodeKey}`,
      categorie: "fiscal",
      severite: sev,
      titre: `Échéance TVA dans ${jours} jour${jours > 1 ? "s" : ""}`,
      description: `Déclaration TVA — période ${periodeLabel} (échéance ${echeance.toLocaleDateString("fr-FR")})`,
      date: dateISO,
    });
    // Retenues de la période (avant le 1er du mois de l'échéance) encore dues
    const dues = dettesPaie(store.donneesMensuelles, isoLocal(new Date(echeance.getFullYear(), echeance.getMonth(), 1)));
    const total = dues.cnss + dues.amu + dues.irpp;
    alertes.push({
      id: `cnss-${periodeKey}`,
      categorie: "fiscal",
      severite: sev,
      titre: `Reversement cotisations et IRPP dans ${jours} jour${jours > 1 ? "s" : ""}`,
      description: total > 0
        ? `Période ${periodeLabel}, à reverser avant le ${echeance.toLocaleDateString("fr-FR")} : ${detailDettes(dues)}`
        : `Cotisations CNSS / AMU et IRPP — période ${periodeLabel} (échéance ${echeance.toLocaleDateString("fr-FR")})`,
      date: dateISO,
    });
  }

  // Retard : retenues des mois précédents toujours dues après le 15
  if (now.getDate() > 15) {
    const debutMois = isoLocal(new Date(now.getFullYear(), now.getMonth(), 1));
    const enRetard = dettesPaie(store.donneesMensuelles, debutMois);
    if (enRetard.cnss + enRetard.amu + enRetard.irpp > 0) {
      alertes.push({
        id: `reversement-retard-${moisKey(now.getFullYear(), now.getMonth() + 1)}`,
        categorie: "fiscal",
        severite: "danger",
        titre: "Cotisations et IRPP non reversés",
        description: `Échéance du 15 dépassée : ${detailDettes(enRetard)}`,
      });
    }
  }

  // ─── Caisse négative ──────────────────────────────────────────────────────
  const annexes = (store.activites ?? []).filter((a) => a.compteCaisse);
  const compteDe = (id: string | null | undefined) => annexes.find((a) => a.id === id)?.compteCaisse ?? "571";
  const comptesAnnexes = annexes.map((a) => a.compteCaisse!);
  const caissesASurveiller = [
    { compte: "571", nom: "Caisse" },
    ...annexes.map((a) => ({ compte: a.compteCaisse!, nom: `Caisse ${a.nom}` })),
  ];
  for (const c of caissesASurveiller) {
  const caisse = soldeCaisse(store.donneesMensuelles, isoLocal(now), { compte: c.compte, compteDe, comptesAnnexes });
  if (caisse < 0) {
    alertes.push({
      id: `caisse-negative-${c.compte}-${isoLocal(now)}`,
      categorie: "tresorerie",
      severite: "danger",
      titre: `${c.nom} négative`,
      description: `Solde de la caisse : ${formatSolde(caisse)}. Une caisse ne peut pas être négative : vérifiez les dépenses réglées en caisse (Banque au lieu de Caisse ?) ou enregistrez l'approvisionnement de la caisse.`,
    });
  }
  }

  // ─── 3. CDD se terminant dans les 30 jours ────────────────────────────────
  (store.employes || []).forEach((e) => {
    if (e.typeContrat !== "cdd" || !e.dateFinContrat) return;
    const fin = new Date(e.dateFinContrat);
    if (isNaN(fin.getTime())) return;
    const jours = joursEntre(now, fin);
    if (jours < 0 || jours > 30) return;
    alertes.push({
      id: `cdd-${e.id}`,
      categorie: "rh",
      severite: jours <= 7 ? "danger" : "warning",
      titre: `Fin CDD ${e.nom} dans ${jours} jour${jours > 1 ? "s" : ""}`,
      description: `Contrat à durée déterminée arrivant à terme le ${fin.toLocaleDateString("fr-FR")}`,
      date: e.dateFinContrat,
    });
  });

  // ─── 4. Articles sous seuil d'alerte ──────────────────────────────────────
  (store.articles || []).forEach((a) => {
    if (a.seuilAlerte > 0 && a.stock <= a.seuilAlerte) {
      alertes.push({
        id: `stock-${a.id}`,
        categorie: "stock",
        severite: a.stock === 0 ? "danger" : "warning",
        titre: `Stock bas : ${a.designation}`,
        description: `Stock actuel : ${a.stock} ${a.unite} (seuil : ${a.seuilAlerte})`,
      });
    }
  });

  // Tri : danger d'abord, puis warning, puis info
  const ordre: Record<AlerteSeverite, number> = { danger: 0, warning: 1, info: 2 };
  return alertes.sort((a, b) => ordre[a.severite] - ordre[b.severite]);
};

/**
 * Marque une alerte comme lue/ignorée pour l'utilisateur courant.
 * Stocke dans la table `alertes_lues`.
 */
export const markAlertRead = async (
  alerteId: string,
  societeId: string
): Promise<{ ok: boolean; error?: string }> => {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return { ok: false, error: "not_authenticated" };
    const { error } = await supabase
      .from("alertes_lues")
      .insert({ user_id: userId, societe_id: societeId, alerte_id: alerteId });
    if (error && !error.message.includes("duplicate")) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: String(e) };
  }
};

/**
 * Récupère les IDs des alertes déjà ignorées par l'utilisateur courant.
 */
export const getDismissedAlertIds = async (
  societeId: string
): Promise<Set<string>> => {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return new Set();
    const { data, error } = await supabase
      .from("alertes_lues")
      .select("alerte_id")
      .eq("user_id", userId)
      .eq("societe_id", societeId);
    if (error) return new Set();
    return new Set((data ?? []).map((r: { alerte_id: string }) => r.alerte_id));
  } catch {
    return new Set();
  }
};
