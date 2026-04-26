import type {
  Article,
  DonneesMensuelles,
  Employe,
  Facture,
  MoisData,
} from "@/types/ebene";
import { moisKey } from "@/lib/ebene-utils";

export type AlerteSeverite = "info" | "warning" | "danger";
export type AlerteCategorie = "facture" | "fiscal" | "rh" | "stock";

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
}

const MS_PAR_JOUR = 1000 * 60 * 60 * 24;

const joursEntre = (a: Date, b: Date) =>
  Math.floor((b.getTime() - a.getTime()) / MS_PAR_JOUR);

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
    const dateISO = echeance.toISOString().split("T")[0];
    const sev: AlerteSeverite = jours <= 3 ? "danger" : "warning";

    alertes.push({
      id: `tva-${periodeKey}`,
      categorie: "fiscal",
      severite: sev,
      titre: `Échéance TVA dans ${jours} jour${jours > 1 ? "s" : ""}`,
      description: `Déclaration TVA — période ${periodeLabel} (échéance ${echeance.toLocaleDateString("fr-FR")})`,
      date: dateISO,
    });
    alertes.push({
      id: `cnss-${periodeKey}`,
      categorie: "fiscal",
      severite: sev,
      titre: `Échéance CNSS dans ${jours} jour${jours > 1 ? "s" : ""}`,
      description: `Cotisations CNSS — période ${periodeLabel} (échéance ${echeance.toLocaleDateString("fr-FR")})`,
      date: dateISO,
    });
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
