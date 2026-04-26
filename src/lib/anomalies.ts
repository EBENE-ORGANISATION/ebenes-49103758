import type { DonneesMensuelles, Facture, Transaction } from "@/types/ebene";

/**
 * Catégorie d'anomalie détectée. Sert à différencier les badges/tooltips.
 */
export type AnomalieType =
  | "doublon_numero"
  | "montant_anormal"
  | "doublon_fournisseur_date";

export interface Anomalie {
  type: AnomalieType;
  message: string;
}

/** Map id → anomalies (factures et transactions partagent l'espace via préfixe). */
export interface AnomaliesMap {
  factures: Map<number, Anomalie[]>;
  transactions: Map<number, Anomalie[]>;
}

const emptyMap = (): AnomaliesMap => ({
  factures: new Map(),
  transactions: new Map(),
});

const push = (m: Map<number, Anomalie[]>, id: number, a: Anomalie) => {
  const arr = m.get(id) || [];
  arr.push(a);
  m.set(id, arr);
};

/**
 * Détecte les anomalies sur l'ensemble des factures + transactions de l'année.
 * Règles :
 *  1. Numéros de facture en doublon
 *  2. Montant > 3× la moyenne mensuelle de la catégorie (recettes / dépenses)
 *  3. Même fournisseur avec ≥ 2 dépenses à la même date
 */
export const detectAnomalies = (donnees: DonneesMensuelles): AnomaliesMap => {
  const out = emptyMap();

  // Aplatir l'année
  const factures: Facture[] = [];
  const transactions: Transaction[] = [];
  Object.values(donnees).forEach((mois) => {
    (mois?.factures || []).forEach((f) => factures.push(f));
    (mois?.transactions || []).forEach((t) => transactions.push(t));
  });

  // ─── 1) Doublons de numéro de facture ───────────────────────────────
  const parNumero = new Map<string, Facture[]>();
  factures.forEach((f) => {
    const key = (f.numero || "").trim().toUpperCase();
    if (!key) return;
    const arr = parNumero.get(key) || [];
    arr.push(f);
    parNumero.set(key, arr);
  });
  parNumero.forEach((arr, num) => {
    if (arr.length > 1) {
      arr.forEach((f) =>
        push(out.factures, f.id, {
          type: "doublon_numero",
          message: `Numéro ${num} utilisé ${arr.length} fois`,
        })
      );
    }
  });

  // ─── 2) Montant anormal (> 3× moyenne mensuelle de la catégorie) ────
  // Catégorie = "recette" | "depense" (sur transactions). On agrège par mois.
  const moisCategories = new Map<string, { rec: number[]; dep: number[] }>();
  Object.entries(donnees).forEach(([key, mois]) => {
    const bucket = { rec: [] as number[], dep: [] as number[] };
    (mois?.transactions || []).forEach((t) => {
      const m = Math.abs(t.m);
      if (t.type === "r") bucket.rec.push(m);
      else bucket.dep.push(m);
    });
    moisCategories.set(key, bucket);
  });

  const moyenne = (xs: number[]) =>
    xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

  // Moyennes globales sur l'année par catégorie (somme des montants / nb mois ayant des éléments)
  const allRec: number[] = [];
  const allDep: number[] = [];
  moisCategories.forEach((b) => {
    if (b.rec.length) allRec.push(moyenne(b.rec));
    if (b.dep.length) allDep.push(moyenne(b.dep));
  });
  const moyenneRec = moyenne(allRec);
  const moyenneDep = moyenne(allDep);

  transactions.forEach((t) => {
    const m = Math.abs(t.m);
    const ref = t.type === "r" ? moyenneRec : moyenneDep;
    if (ref > 0 && m > ref * 3) {
      push(out.transactions, t.id, {
        type: "montant_anormal",
        message: `Montant ${m.toLocaleString("fr-FR")} F > 3× la moyenne mensuelle (${Math.round(
          ref
        ).toLocaleString("fr-FR")} F)`,
      });
    }
  });

  // Idem pour factures (toutes assimilées à des recettes)
  if (moyenneRec > 0) {
    factures.forEach((f) => {
      if (f.totalTtc > moyenneRec * 3) {
        push(out.factures, f.id, {
          type: "montant_anormal",
          message: `Montant ${f.totalTtc.toLocaleString(
            "fr-FR"
          )} F > 3× la moyenne mensuelle des recettes (${Math.round(
            moyenneRec
          ).toLocaleString("fr-FR")} F)`,
        });
      }
    });
  }

  // ─── 3) Même fournisseur, deux dépenses à la même date ──────────────
  const parFournisseurDate = new Map<string, Transaction[]>();
  transactions
    .filter((t) => t.type === "d" && t.fournisseur && t.date)
    .forEach((t) => {
      const key = `${(t.fournisseur || "").trim().toLowerCase()}|${t.date}`;
      const arr = parFournisseurDate.get(key) || [];
      arr.push(t);
      parFournisseurDate.set(key, arr);
    });
  parFournisseurDate.forEach((arr) => {
    if (arr.length > 1) {
      arr.forEach((t) =>
        push(out.transactions, t.id, {
          type: "doublon_fournisseur_date",
          message: `${arr.length} dépenses « ${t.fournisseur} » à la même date (${t.date})`,
        })
      );
    }
  });

  return out;
};
