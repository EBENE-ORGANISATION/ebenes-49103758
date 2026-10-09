// Emprunts : échéancier à annuités constantes, capital restant dû, ventilation
// par échéance et garanties (notes 1 et 16A de la liasse) — module pur.
import type { DonneesMensuelles, EcritureComptable } from "@/types/ebene";
import type { Saisie } from "./xlsxPatch";

export type Periodicite = "mensuelle" | "trimestrielle" | "semestrielle" | "annuelle";
export type Garantie = "hypotheque" | "nantissement" | "gage" | "caution" | "autre";

export interface Emprunt {
  id: number;
  preteur: string;
  objet?: string | null;
  montant: number;
  /** Taux annuel en %. */
  tauxAnnuel: number;
  dureeMois: number;
  periodicite: Periodicite;
  /** Date de déblocage (AAAA-MM-JJ). */
  dateDeblocage: string;
  compte: string;
  tresorerie: "521" | "571";
  garantie?: Garantie | null;
  montantGaranti?: number | null;
  activiteId?: string | null;
}

export interface Echeance {
  numero: number;
  date: string;
  capital: number;
  interets: number;
  annuite: number;
  /** Capital restant dû après cette échéance. */
  restant: number;
}

export const PAS_MOIS: Record<Periodicite, number> = { mensuelle: 1, trimestrielle: 3, semestrielle: 6, annuelle: 12 };

export const LIBELLE_GARANTIE: Record<Garantie, string> = {
  hypotheque: "Hypothèque",
  nantissement: "Nantissement",
  gage: "Gage",
  caution: "Caution",
  autre: "Autre sûreté",
};

/** Date ISO décalée de `mois` mois (jour ramené au dernier jour du mois si besoin). */
export const ajouterMois = (iso: string, mois: number): string => {
  const [a, m, j] = iso.split("-").map(Number);
  const total = a * 12 + (m - 1) + mois;
  const annee = Math.floor(total / 12);
  const moisN = (total % 12) + 1;
  const dernier = new Date(Date.UTC(annee, moisN, 0)).getUTCDate();
  return `${annee}-${String(moisN).padStart(2, "0")}-${String(Math.min(j, dernier)).padStart(2, "0")}`;
};

/** Échéancier à annuités constantes (arrondi au franc, la dernière échéance solde le capital). */
export const echeancier = (e: Emprunt): Echeance[] => {
  const pas = PAS_MOIS[e.periodicite];
  const n = Math.max(1, Math.round(e.dureeMois / pas));
  const i = (e.tauxAnnuel / 100) * (pas / 12);
  const annuite = i ? (e.montant * i) / (1 - Math.pow(1 + i, -n)) : e.montant / n;
  const out: Echeance[] = [];
  let restant = Math.round(e.montant);
  for (let k = 1; k <= n; k++) {
    const interets = Math.round(restant * i);
    const capital = k === n ? restant : Math.min(restant, Math.round(annuite) - interets);
    restant -= capital;
    out.push({ numero: k, date: ajouterMois(e.dateDeblocage, k * pas), capital, interets, annuite: capital + interets, restant });
  }
  return out;
};

/** Capital restant dû à une date (échéances dont la date est ≤ à celle-ci considérées payées). */
export const capitalRestantDu = (e: Emprunt, date: string): number => {
  if (e.dateDeblocage > date) return 0;
  return echeancier(e).reduce((r, x) => (x.date <= date ? r - x.capital : r), Math.round(e.montant));
};

export interface Ventilation { unAn: number; unADeuxAns: number; plusDeDeuxAns: number }

/** Capital restant dû à la clôture, réparti selon la date d'échéance. */
export const ventilationEcheances = (e: Emprunt, dateCloture: string): Ventilation => {
  const v: Ventilation = { unAn: 0, unADeuxAns: 0, plusDeDeuxAns: 0 };
  if (e.dateDeblocage > dateCloture) return v;
  const un = ajouterMois(dateCloture, 12);
  const deux = ajouterMois(dateCloture, 24);
  for (const x of echeancier(e)) {
    if (x.date <= dateCloture) continue;
    if (x.date <= un) v.unAn += x.capital;
    else if (x.date <= deux) v.unADeuxAns += x.capital;
    else v.plusDeDeuxAns += x.capital;
  }
  return v;
};

/** Prochaine échéance non encore enregistrée (numéros déjà payés fournis). */
export const prochaineEcheance = (e: Emprunt, payees: number[]): Echeance | null =>
  echeancier(e).find((x) => !payees.includes(x.numero)) ?? null;

const SURETES_REELLES: Garantie[] = ["hypotheque", "nantissement", "gage", "autre"];

/**
 * Notes 16A (ventilation par échéance des emprunts bancaires) et 1 (dettes
 * garanties). `solde162` : solde comptable des emprunts bancaires à la clôture ;
 * l'écart éventuel avec les échéanciers est porté à « un an au plus ».
 * `totalDettes` : total des dettes financières (ligne 20), les autres dettes
 * étant considérées à un an au plus.
 */
export const saisiesEmprunts = (emprunts: Emprunt[], annee: number, solde162: number, totalDettes = solde162): Saisie[] => {
  const cloture = `${annee}-12-31`;
  const v: Ventilation = { unAn: 0, unADeuxAns: 0, plusDeDeuxAns: 0 };
  const garanties = { hypotheque: 0, nantissement: 0, gage: 0 };
  let brutGaranti = 0;
  const lignesCommentaire: string[] = [];
  for (const e of emprunts) {
    const restant = capitalRestantDu(e, cloture);
    if (e.dateDeblocage <= cloture) {
      const ve = ventilationEcheances(e, cloture);
      v.unAn += ve.unAn;
      v.unADeuxAns += ve.unADeuxAns;
      v.plusDeDeuxAns += ve.plusDeDeuxAns;
      lignesCommentaire.push(
        `${e.preteur} : ${Math.round(e.montant).toLocaleString("fr-FR")} F débloqués le ${e.dateDeblocage.split("-").reverse().join("/")}, ` +
        `${e.tauxAnnuel} %, ${e.dureeMois} mois${e.garantie ? `, ${LIBELLE_GARANTIE[e.garantie].toLowerCase()}` : ""}` +
        ` ; restant dû ${restant.toLocaleString("fr-FR")} F`,
      );
    }
    if (restant > 0 && e.garantie && SURETES_REELLES.includes(e.garantie)) {
      brutGaranti += restant;
      const garanti = Math.min(restant, Math.round(e.montantGaranti ?? restant));
      const cle = e.garantie === "hypotheque" || e.garantie === "nantissement" ? e.garantie : "gage";
      garanties[cle] += garanti;
    }
  }
  const out: Saisie[] = [];
  const solde = Math.round(solde162);
  const ecart = solde - (v.unAn + v.unADeuxAns + v.plusDeDeuxAns);
  if (emprunts.length) {
    const unAn = Math.max(0, v.unAn + ecart);
    out.push(
      { feuille: "NOTE 16A", cellule: "F11", valeur: unAn },
      { feuille: "NOTE 16A", cellule: "G11", valeur: v.unADeuxAns },
      { feuille: "NOTE 16A", cellule: "H11", valeur: v.plusDeDeuxAns },
      { feuille: "NOTE 16A", cellule: "F20", valeur: Math.round(totalDettes) - solde + unAn },
      { feuille: "NOTE 16A", cellule: "G20", valeur: v.unADeuxAns },
      { feuille: "NOTE 16A", cellule: "H20", valeur: v.plusDeDeuxAns },
    );
    if (lignesCommentaire.length) out.push({ feuille: "NOTE 16A", cellule: "B43", valeur: lignesCommentaire.join(" — ") });
  }
  if (brutGaranti) {
    const total = garanties.hypotheque + garanties.nantissement + garanties.gage;
    for (const ligne of [14, 16, 33]) {
      out.push(
        { feuille: "NOTE 1", cellule: `G${ligne}`, valeur: brutGaranti },
        { feuille: "NOTE 1", cellule: `H${ligne}`, valeur: garanties.hypotheque },
        { feuille: "NOTE 1", cellule: `I${ligne}`, valeur: garanties.nantissement },
        { feuille: "NOTE 1", cellule: `J${ligne}`, valeur: garanties.gage },
      );
    }
    // Engagements donnés : sûretés consenties
    out.push({ feuille: "NOTE 1", cellule: "I39", valeur: total }, { feuille: "NOTE 1", cellule: "I43", valeur: total });
  }
  return out;
};

// ── Écritures : déblocage (EMP-<id>-0) et échéances (EMP-<id>-<n>) ──────────

type EcritureGeneree = Omit<EcritureComptable, "id">;

export const pieceEmprunt = (id: number, numero: number) => `EMP-${id}-${numero}`;

const ecriture = (e: Emprunt, numero: number, date: string, libelle: string, lignes: [string, string, number, number][]): EcritureGeneree => {
  const [annee, mois] = date.split("-").map(Number);
  return {
    journal: e.tresorerie === "571" ? "CA" : "BQ",
    numeroPiece: pieceEmprunt(e.id, numero),
    libelle,
    lignes: lignes.filter(([, , d, c]) => d || c).map(([compte, intitule, debit, credit], i) => ({ id: i + 1, compte, intitule, debit, credit })),
    statut: "brouillon",
    activiteId: e.activiteId ?? null,
    date,
    annee,
    mois,
  };
};

const INTITULE_TRESORERIE = { "521": "Banques", "571": "Caisse" } as const;

/** Déblocage des fonds : trésorerie au débit, emprunt au crédit. */
export const ecritureDeblocage = (e: Emprunt): EcritureGeneree =>
  ecriture(e, 0, e.dateDeblocage, `Déblocage emprunt ${e.preteur}`, [
    [e.tresorerie, INTITULE_TRESORERIE[e.tresorerie], Math.round(e.montant), 0],
    [e.compte, "Emprunts et dettes auprès des établissements de crédit", 0, Math.round(e.montant)],
  ]);

/** Échéance : capital (emprunt) et intérêts (6711) au débit, trésorerie au crédit. */
export const ecritureEcheance = (e: Emprunt, x: Echeance, date = x.date): EcritureGeneree =>
  ecriture(e, x.numero, date, `Échéance ${x.numero} emprunt ${e.preteur}`, [
    [e.compte, "Emprunts et dettes auprès des établissements de crédit", x.capital, 0],
    ["6711", "Intérêts des emprunts", x.interets, 0],
    [e.tresorerie, INTITULE_TRESORERIE[e.tresorerie], 0, x.annuite],
  ]);

/** Numéros des pièces d'un emprunt déjà passées en comptabilité (0 = déblocage). */
export const piecesComptabilisees = (donnees: DonneesMensuelles, id: number): number[] => {
  const prefixe = `EMP-${id}-`;
  const out: number[] = [];
  for (const m of Object.values(donnees)) {
    for (const x of m?.ecritures ?? []) {
      if (x.numeroPiece?.startsWith(prefixe)) out.push(Number(x.numeroPiece.slice(prefixe.length)));
    }
  }
  return out;
};
