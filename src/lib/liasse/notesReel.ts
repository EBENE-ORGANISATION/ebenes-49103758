// Notes annexes de la liasse du système normal — module pur.
// Chaque note est décrite par une table : feuille, colonnes, comptes de chaque
// ligne. Un compte va dans la ligne dont le préfixe est le plus long.
import type { DonneesMensuelles } from "@/types/ebene";
import type { Saisie } from "./xlsxPatch";
import { mouvementsExercice, soldesCloture } from "./etatsLiasse";

type Soldes = Map<string, number>;

interface LigneNote {
  ligne: number;
  prefixes?: string[];
  /** Total d'autres lignes (calculé après elles). */
  somme?: number[];
  /** Différence : première ligne − les suivantes. */
  difference?: number[];
}

interface NoteSoldes {
  feuille: string;
  /** Soldes de bilan (cumulés) ou de gestion (exercice). */
  base: "bilan" | "gestion";
  /** Sens du montant affiché : débiteur (actif, charges) ou créditeur (passif, produits). */
  sens: "debit" | "credit";
  /** Comptes de tiers : seuls les comptes dont le solde est dans le sens de la note. */
  filtrerSigne?: boolean;
  colN: string;
  colN1: string;
  colPct?: string;
  colAbs?: string;
  /** Colonne « à un an au plus » : faute d'échéancier, tout le solde y est porté. */
  colCourt?: string;
  lignes: LigneNote[];
}

const NOTES_SOLDES: NoteSoldes[] = [
  { feuille: "NOTE 6", base: "bilan", sens: "debit", colN: "F", colN1: "H", colPct: "J", lignes: [
    { ligne: 10, prefixes: ["31"] }, { ligne: 11, prefixes: ["32"] }, { ligne: 12, prefixes: ["33"] },
    { ligne: 13, prefixes: ["34"] }, { ligne: 14, prefixes: ["35"] }, { ligne: 15, prefixes: ["36"] },
    { ligne: 16, prefixes: ["37"] }, { ligne: 17, prefixes: ["38"] },
    { ligne: 18, somme: [10, 11, 12, 13, 14, 15, 16, 17] },
  ] },
  { feuille: "NOTE 6", base: "bilan", sens: "credit", colN: "F", colN1: "H", colPct: "J", lignes: [{ ligne: 20, prefixes: ["39"] }] },
  { feuille: "NOTE 7", base: "bilan", sens: "debit", filtrerSigne: true, colN: "E", colN1: "F", colPct: "G", colCourt: "H", lignes: [
    { ligne: 10, prefixes: ["411"] }, { ligne: 11, prefixes: ["412"] }, { ligne: 16, prefixes: ["416"] },
    { ligne: 17, prefixes: ["418"] }, { ligne: 18, somme: [10, 11, 16, 17] },
  ] },
  { feuille: "NOTE 7", base: "bilan", sens: "credit", colN: "E", colN1: "F", colPct: "G", lignes: [
    { ligne: 20, prefixes: ["491"] },
  ] },
  { feuille: "NOTE 7", base: "bilan", sens: "credit", filtrerSigne: true, colN: "E", colN1: "F", colPct: "G", lignes: [
    { ligne: 24, prefixes: ["419"] },
  ] },
  { feuille: "NOTE 11", base: "bilan", sens: "debit", filtrerSigne: true, colN: "E", colN1: "F", colPct: "G", lignes: [
    { ligne: 10, prefixes: ["521"] }, { ligne: 11, prefixes: ["522"] }, { ligne: 12, prefixes: ["523"] },
    { ligne: 13, prefixes: ["52"] }, { ligne: 14, prefixes: ["526"] }, { ligne: 15, prefixes: ["53"] },
    { ligne: 16, prefixes: ["54", "55"] }, { ligne: 19, prefixes: ["57"] }, { ligne: 20, prefixes: ["572"] },
    { ligne: 21, prefixes: ["58"] }, { ligne: 22, somme: [10, 11, 12, 13, 14, 15, 16, 19, 20, 21] },
  ] },
  { feuille: "NOTE 11", base: "bilan", sens: "credit", colN: "E", colN1: "F", colPct: "G", lignes: [{ ligne: 23, prefixes: ["59"] }] },
  { feuille: "Note 17", base: "bilan", sens: "credit", filtrerSigne: true, colN: "B", colN1: "C", colPct: "D", colCourt: "E", lignes: [
    { ligne: 9, prefixes: ["401", "40"] }, { ligne: 10, prefixes: ["402"] }, { ligne: 12, prefixes: ["408"] },
    { ligne: 14, somme: [9, 10, 12] },
  ] },
  { feuille: "Note 17", base: "bilan", sens: "debit", filtrerSigne: true, colN: "B", colN1: "C", colPct: "D", lignes: [
    { ligne: 15, prefixes: ["409"] }, { ligne: 18, somme: [15] },
  ] },
  { feuille: "note 18", base: "bilan", sens: "credit", filtrerSigne: true, colN: "B", colN1: "C", colAbs: "D", colPct: "E", colCourt: "F", lignes: [
    { ligne: 9, prefixes: ["421"] }, { ligne: 10, prefixes: ["422"] }, { ligne: 11, prefixes: ["42"] },
    { ligne: 12, prefixes: ["431"] }, { ligne: 13, prefixes: ["432"] }, { ligne: 14, prefixes: ["43"] },
    { ligne: 15, somme: [9, 10, 11, 12, 13, 14] },
    { ligne: 17, prefixes: ["441"] }, { ligne: 18, prefixes: ["442"] }, { ligne: 19, prefixes: ["443", "444"] },
    { ligne: 20, prefixes: ["447"] }, { ligne: 21, prefixes: ["44"] },
    { ligne: 22, somme: [17, 18, 19, 20, 21] }, { ligne: 23, somme: [15, 22] },
  ] },
  // ── Produits et charges ──
  { feuille: "NOTE 21", base: "gestion", sens: "credit", colN: "E", colN1: "F", colPct: "G", lignes: [
    { ligne: 11, prefixes: ["701"] }, { ligne: 15, somme: [11] },
    { ligne: 17, prefixes: ["702", "703", "704"] }, { ligne: 21, somme: [17] },
    { ligne: 23, prefixes: ["705", "706"] }, { ligne: 27, somme: [23] },
    { ligne: 29, prefixes: ["707"] }, { ligne: 31, somme: [15, 21, 27, 29] },
    { ligne: 33, prefixes: ["72"] }, { ligne: 34, prefixes: ["71"] }, { ligne: 35, prefixes: ["75"] },
    { ligne: 36, somme: [33, 34, 35] }, { ligne: 37, somme: [31, 36] },
  ] },
  { feuille: "NOTE 22", base: "gestion", sens: "debit", colN: "C", colN1: "D", colPct: "E", lignes: [
    { ligne: 10, prefixes: ["601"] }, { ligne: 13, somme: [10] },
    { ligne: 14, prefixes: ["602"] }, { ligne: 17, somme: [14] },
    { ligne: 18, prefixes: ["604", "6041"] }, { ligne: 19, prefixes: ["6042"] }, { ligne: 20, prefixes: ["6043"] },
    { ligne: 21, prefixes: ["6044"] }, { ligne: 22, prefixes: ["6051"] }, { ligne: 23, prefixes: ["6052"] },
    { ligne: 24, prefixes: ["6053", "605"] }, { ligne: 25, prefixes: ["6054"] }, { ligne: 26, prefixes: ["6055", "6047"] },
    { ligne: 27, prefixes: ["6056"] }, { ligne: 28, prefixes: ["6057"] }, { ligne: 29, prefixes: ["608"] },
    { ligne: 30, prefixes: ["6058"] }, { ligne: 31, prefixes: ["6019", "6029", "6049", "6059", "6089"] },
    { ligne: 32, somme: [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31] },
  ] },
  { feuille: "NOTE 23 24", base: "gestion", sens: "debit", colN: "E", colN1: "F", colPct: "G", lignes: [
    { ligne: 10, prefixes: ["612"] }, { ligne: 11, prefixes: ["613"] }, { ligne: 12, prefixes: ["614"] },
    { ligne: 13, prefixes: ["616"] }, { ligne: 14, prefixes: ["61"] }, { ligne: 15, somme: [10, 11, 12, 13, 14] },
    { ligne: 34, prefixes: ["621"] }, { ligne: 35, prefixes: ["622"] }, { ligne: 36, prefixes: ["623"] },
    { ligne: 37, prefixes: ["624"] }, { ligne: 38, prefixes: ["625"] }, { ligne: 39, prefixes: ["626"] },
    { ligne: 40, prefixes: ["627"] }, { ligne: 41, prefixes: ["628"] }, { ligne: 42, prefixes: ["631"] },
    { ligne: 43, prefixes: ["632"] }, { ligne: 44, prefixes: ["633"] }, { ligne: 45, prefixes: ["634"] },
    { ligne: 46, prefixes: ["637"] }, { ligne: 47, prefixes: ["62", "63"] },
    { ligne: 49, somme: [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47] },
  ] },
  { feuille: "NOTE 25", base: "gestion", sens: "debit", colN: "E", colN1: "F", colPct: "G", lignes: [
    { ligne: 10, prefixes: ["641"] }, { ligne: 11, prefixes: ["645"] }, { ligne: 12, prefixes: ["646"] },
    { ligne: 13, prefixes: ["647"] }, { ligne: 14, prefixes: ["64"] }, { ligne: 15, somme: [10, 11, 12, 13, 14] },
  ] },
  { feuille: "NOTE 26", base: "gestion", sens: "debit", colN: "E", colN1: "F", colPct: "G", lignes: [
    { ligne: 10, prefixes: ["651"] }, { ligne: 12, prefixes: ["652"] }, { ligne: 13, prefixes: ["654"] },
    { ligne: 14, prefixes: ["6581"] }, { ligne: 15, prefixes: ["6582", "6583"] }, { ligne: 16, prefixes: ["65"] },
    { ligne: 17, prefixes: ["659"] }, { ligne: 18, somme: [10, 12, 13, 14, 15, 16, 17] },
  ] },
  { feuille: "NOTE 27A", base: "gestion", sens: "debit", colN: "D", colN1: "E", colPct: "F", lignes: [
    { ligne: 10, prefixes: ["661"] }, { ligne: 11, prefixes: ["662"] }, { ligne: 12, prefixes: ["664"] },
    { ligne: 13, prefixes: ["666"] }, { ligne: 14, prefixes: ["667"] }, { ligne: 15, prefixes: ["66"] },
    { ligne: 17, somme: [10, 11, 12, 13, 14, 15] },
  ] },
  { feuille: "NOTE 29", base: "gestion", sens: "debit", colN: "E", colN1: "F", colPct: "G", lignes: [
    { ligne: 10, prefixes: ["6711", "671"] }, { ligne: 11, prefixes: ["672"] }, { ligne: 12, prefixes: ["673"] },
    { ligne: 13, prefixes: ["67"] }, { ligne: 14, prefixes: ["675"] }, { ligne: 15, prefixes: ["676"] },
    { ligne: 16, prefixes: ["677"] }, { ligne: 17, prefixes: ["678"] }, { ligne: 18, prefixes: ["679"] },
    { ligne: 19, prefixes: ["697"] }, { ligne: 20, somme: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] },
  ] },
  { feuille: "NOTE 29", base: "gestion", sens: "credit", colN: "E", colN1: "F", colPct: "G", lignes: [
    { ligne: 22, prefixes: ["771"] }, { ligne: 23, prefixes: ["772"] }, { ligne: 24, prefixes: ["773"] },
    { ligne: 25, prefixes: ["774"] }, { ligne: 26, prefixes: ["776"] }, { ligne: 27, prefixes: ["777"] },
    { ligne: 28, prefixes: ["778", "77"] }, { ligne: 29, prefixes: ["797"] },
    { ligne: 30, somme: [22, 23, 24, 25, 26, 27, 28, 29] },
  ] },
];

/** Montant de chaque ligne (préfixe le plus long, sens et filtre de signe de la note). */
const montantsLignes = (soldes: Soldes, note: NoteSoldes): Map<number, number> => {
  const out = new Map<number, number>();
  const lignesComptes = note.lignes.filter((l) => l.prefixes);
  for (const l of note.lignes) out.set(l.ligne, 0);
  soldes.forEach((v, compte) => {
    let meilleure: LigneNote | null = null;
    let longueur = 0;
    for (const l of lignesComptes) {
      for (const p of l.prefixes!) {
        if (compte.startsWith(p) && p.length > longueur) { meilleure = l; longueur = p.length; }
      }
    }
    if (!meilleure) return;
    const montant = note.sens === "debit" ? v : -v;
    if (note.filtrerSigne && montant <= 0) return;
    out.set(meilleure.ligne, (out.get(meilleure.ligne) ?? 0) + montant);
  });
  for (const l of note.lignes) {
    if (l.somme) out.set(l.ligne, l.somme.reduce((t, r) => t + (out.get(r) ?? 0), 0));
    if (l.difference) out.set(l.ligne, (out.get(l.difference[0]) ?? 0) - l.difference.slice(1).reduce((t, r) => t + (out.get(r) ?? 0), 0));
  }
  for (const [k, v] of out) out.set(k, Math.round(v));
  return out;
};

const pourcentage = (n: number, n1: number): number | null => (n1 ? Math.round(((n - n1) / Math.abs(n1)) * 1000) / 10 : null);

/** Notes de soldes (stocks, clients, trésorerie, fournisseurs, dettes, produits, charges). */
export const saisiesNotesSoldes = (donnees: DonneesMensuelles, annee: number): Saisie[] => {
  const cN = soldesCloture(donnees, annee);
  const cN1 = soldesCloture(donnees, annee - 1);
  const out: Saisie[] = [];
  for (const note of NOTES_SOLDES) {
    const mN = montantsLignes(note.base === "bilan" ? cN.bilan : cN.gestion, note);
    const mN1 = montantsLignes(note.base === "bilan" ? cN1.bilan : cN1.gestion, note);
    for (const l of note.lignes) {
      const n = mN.get(l.ligne) ?? 0;
      const n1 = mN1.get(l.ligne) ?? 0;
      out.push({ feuille: note.feuille, cellule: `${note.colN}${l.ligne}`, valeur: n });
      out.push({ feuille: note.feuille, cellule: `${note.colN1}${l.ligne}`, valeur: n1 });
      if (note.colAbs) out.push({ feuille: note.feuille, cellule: `${note.colAbs}${l.ligne}`, valeur: n - n1 });
      const pct = pourcentage(n, n1);
      if (note.colPct && pct !== null) out.push({ feuille: note.feuille, cellule: `${note.colPct}${l.ligne}`, valeur: pct });
      if (note.colCourt) out.push({ feuille: note.feuille, cellule: `${note.colCourt}${l.ligne}`, valeur: n });
    }
  }
  // Totaux nets de dépréciations (stocks, clients)
  const net = (feuille: string, col: string, colN1: string, brut: number, dep: number, ligneNet: number) => {
    const get = (s: Saisie[], c: string) => (s.find((x) => x.feuille === feuille && x.cellule === c)?.valeur as number) ?? 0;
    out.push({ feuille, cellule: `${col}${ligneNet}`, valeur: get(out, `${col}${brut}`) - get(out, `${col}${dep}`) });
    out.push({ feuille, cellule: `${colN1}${ligneNet}`, valeur: get(out, `${colN1}${brut}`) - get(out, `${colN1}${dep}`) });
  };
  net("NOTE 6", "F", "H", 18, 20, 22);
  net("NOTE 7", "E", "F", 18, 20, 22);
  return out;
};

// ── Immobilisations : mouvements de l'exercice (notes 3A et 3C) ─────────────

interface LigneMouvement { ligne: number; prefixes?: string[]; somme?: number[] }

const NOTE_3A: LigneMouvement[] = [
  { ligne: 14, prefixes: ["211"] }, { ligne: 15, prefixes: ["212", "213", "214"] }, { ligne: 16, prefixes: ["215", "216"] },
  { ligne: 17, prefixes: ["21"] }, { ligne: 13, somme: [14, 15, 16, 17] },
  { ligne: 19, prefixes: ["22"] }, { ligne: 21, prefixes: ["231", "232", "233", "236", "237"] }, { ligne: 23, prefixes: ["23"] },
  { ligne: 24, prefixes: ["24"] }, { ligne: 25, prefixes: ["245"] }, { ligne: 26, prefixes: ["25"] },
  { ligne: 18, somme: [19, 21, 23, 24, 25, 26] },
  { ligne: 31, prefixes: ["26"] }, { ligne: 32, prefixes: ["27"] }, { ligne: 30, somme: [31, 32] },
  { ligne: 33, somme: [13, 18, 30] },
];

const NOTE_3C: LigneMouvement[] = [
  { ligne: 11, prefixes: ["2811"] }, { ligne: 12, prefixes: ["2812", "2813", "2814"] }, { ligne: 13, prefixes: ["2815", "2816"] },
  { ligne: 14, prefixes: ["281"] }, { ligne: 16, somme: [11, 12, 13, 14] },
  { ligne: 17, prefixes: ["282"] }, { ligne: 19, prefixes: ["2831", "2832", "2833", "2836", "2837"] }, { ligne: 21, prefixes: ["283"] },
  { ligne: 22, prefixes: ["284"] }, { ligne: 23, prefixes: ["2845"] }, { ligne: 25, somme: [17, 19, 21, 22, 23] },
  { ligne: 27, somme: [16, 25] },
];

/** Ouverture, augmentations, diminutions et clôture de chaque ligne. */
const mouvementsLignes = (
  lignes: LigneMouvement[],
  cloture: Soldes,
  mvt: ReturnType<typeof mouvementsExercice>,
  sens: "debit" | "credit",
) => {
  const out = new Map<number, { ouverture: number; plus: number; moins: number; cloture: number }>();
  const avecComptes = lignes.filter((l) => l.prefixes);
  const meilleure = (compte: string) => {
    let res: LigneMouvement | null = null;
    let lg = 0;
    for (const l of avecComptes) for (const p of l.prefixes!) if (compte.startsWith(p) && p.length > lg) { res = l; lg = p.length; }
    return res;
  };
  for (const l of lignes) out.set(l.ligne, { ouverture: 0, plus: 0, moins: 0, cloture: 0 });
  const comptes = new Set<string>(cloture.keys());
  const ajouter = (compte: string) => {
    const l = meilleure(compte);
    if (!l) return;
    const m = out.get(l.ligne)!;
    const clo = (cloture.get(compte) ?? 0) * (sens === "debit" ? 1 : -1);
    const plus = sens === "debit" ? mvt.debit([compte]) : mvt.credit([compte]);
    const moins = sens === "debit" ? mvt.credit([compte]) : mvt.debit([compte]);
    m.cloture += clo; m.plus += plus; m.moins += moins; m.ouverture += clo - plus + moins;
  };
  // Un compte n'est compté qu'une fois même si un préfixe plus court le contient
  for (const c of comptes) if ([...comptes].every((x) => x === c || !c.startsWith(x) || x.length >= c.length)) ajouter(c);
  for (const l of lignes) {
    if (!l.somme) continue;
    const m = out.get(l.ligne)!;
    for (const r of l.somme) {
      const s = out.get(r)!;
      m.ouverture += s.ouverture; m.plus += s.plus; m.moins += s.moins; m.cloture += s.cloture;
    }
  }
  return out;
};

/** Notes 3A (immobilisations brutes) et 3C (amortissements). */
export const saisiesNotesImmobilisations = (donnees: DonneesMensuelles, annee: number): Saisie[] => {
  const { bilan } = soldesCloture(donnees, annee);
  const mvt = mouvementsExercice(donnees, annee);
  const brutes = new Map([...bilan].filter(([c]) => c.startsWith("2") && !c.startsWith("28") && !c.startsWith("29")));
  const amort = new Map([...bilan].filter(([c]) => c.startsWith("28")));
  const out: Saisie[] = [];
  for (const [ligne, m] of mouvementsLignes(NOTE_3A, brutes, mvt, "debit")) {
    const f = "TABLEAU immo note 3A";
    out.push({ feuille: f, cellule: `B${ligne}`, valeur: Math.round(m.ouverture) });
    out.push({ feuille: f, cellule: `C${ligne}`, valeur: Math.round(m.plus) });
    out.push({ feuille: f, cellule: `F${ligne}`, valeur: Math.round(m.moins) });
    out.push({ feuille: f, cellule: `H${ligne}`, valeur: Math.round(m.cloture) });
  }
  for (const [ligne, m] of mouvementsLignes(NOTE_3C, amort, mvt, "credit")) {
    const f = "NOTE 3C AMORTISSEMENT";
    out.push({ feuille: f, cellule: `B${ligne}`, valeur: Math.round(m.ouverture) });
    out.push({ feuille: f, cellule: `C${ligne}`, valeur: Math.round(m.plus) });
    out.push({ feuille: f, cellule: `D${ligne}`, valeur: Math.round(m.moins) });
    out.push({ feuille: f, cellule: `E${ligne}`, valeur: Math.round(m.cloture) });
  }
  return out;
};
