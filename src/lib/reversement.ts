// Reversement des cotisations sociales et de l'IRPP retenus sur les salaires —
// module pur. Chaque organisme donne une dépense (431 CNSS, 433 AMU, 447
// IRPP au débit, Banque ou Caisse au crédit) qui suit le circuit habituel :
// saisie, validation par le chef comptable, écriture.
import type { Transaction } from "@/types/ebene";
import type { CompteTresorerie } from "@/lib/ecrituresTresorerie";
import type { DettesPaie } from "@/lib/alertes";

export const COMPTES_REVERSEMENT = ["431", "433", "447"] as const;

const LIBELLES: Record<keyof DettesPaie, [string, string]> = {
  cnss: ["431", "CNSS"],
  amu: ["433", "AMU"],
  irpp: ["447", "IRPP retenu à la source"],
};

/** Dépenses de reversement des montants dus (une par organisme). */
export const transactionsReversement = (
  dues: DettesPaie,
  tresorerie: CompteTresorerie,
  date: string,
): Omit<Transaction, "id">[] =>
  (Object.keys(LIBELLES) as (keyof DettesPaie)[])
    .filter((k) => dues[k] > 0)
    .map((k) => ({
      date,
      desc: `Reversement ${LIBELLES[k][1]}`,
      type: "d" as const,
      m: -Math.round(dues[k]),
      source: "manuelle" as const,
      compte: LIBELLES[k][0],
      tresorerie,
      activiteId: null,
    }));

/** Reversement saisi mais pas encore validé (évite de reverser deux fois). */
export const reversementEnAttente = (transactions: Pick<Transaction, "compte" | "statut" | "type">[]): boolean =>
  transactions.some(
    (t) => t.type === "d" && !!t.compte && (COMPTES_REVERSEMENT as readonly string[]).includes(t.compte)
      && t.statut !== "valide" && t.statut !== "rejete",
  );
