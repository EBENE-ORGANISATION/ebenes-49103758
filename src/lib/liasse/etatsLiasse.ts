// États financiers SYSCOHADA révisé (liasse) — calculs purs, testables.
// Bilan actif / passif, compte de résultat et tableau des flux de trésorerie,
// aux références officielles (AD…BZ, CA…DZ, TA…XI, ZA…ZH), exercices N et N-1.
//
// Bilan : soldes cumulés des comptes de bilan (classes 1 à 5) à la clôture.
// Si l'exercice porte des écritures d'à-nouveaux (journal AN), elles servent
// de point de départ ; sinon toutes les écritures depuis l'origine sont
// cumulées et les résultats des exercices antérieurs non affectés vont en
// report à nouveau.
import type { DonneesMensuelles, EcritureComptable } from "@/types/ebene";

type Soldes = Map<string, number>;

const ecrituresValidees = (donnees: DonneesMensuelles): (EcritureComptable & { _annee: number })[] =>
  Object.entries(donnees).flatMap(([k, m]) => {
    const annee = Number(k.split("-")[0]);
    return (m?.ecritures ?? [])
      .filter((e) => e.statut !== "brouillon")
      .map((e) => ({ ...e, _annee: e.annee ?? annee }));
  });

/** Écriture d'à-nouveaux (bilan d'ouverture) de l'exercice. */
export const pieceANouveaux = (annee: number) => `AN-${annee}`;
export const estANouveaux = (e: Pick<EcritureComptable, "journal" | "numeroPiece">, annee: number) =>
  e.journal === "AN" && e.numeroPiece === pieceANouveaux(annee);

const ajouter = (s: Soldes, compte: string, v: number) => s.set(compte, (s.get(compte) ?? 0) + v);

/** Soldes de clôture de l'exercice : bilan (cumulé) + gestion (exercice seul). */
export const soldesCloture = (donnees: DonneesMensuelles, annee: number): { bilan: Soldes; gestion: Soldes; reportImplicite: number } => {
  const toutes = ecrituresValidees(donnees);
  // À-nouveaux d'exercice : pièce « AN-<année> » (le stock d'ouverture INV-OUV n'en est pas)
  const avecANouveaux = toutes.some((e) => e._annee === annee && estANouveaux(e, annee));
  const bilan: Soldes = new Map();
  const gestion: Soldes = new Map();
  let reportImplicite = 0;
  for (const e of toutes) {
    if (e._annee > annee) continue;
    for (const l of e.lignes ?? []) {
      const v = (l.debit || 0) - (l.credit || 0);
      const classe = l.compte.charAt(0);
      if ("12345".includes(classe)) {
        if (!avecANouveaux || e._annee === annee) ajouter(bilan, l.compte, v);
      } else if (e._annee === annee) {
        ajouter(gestion, l.compte, v);
      } else if (!avecANouveaux) {
        reportImplicite -= v; // résultat des exercices antérieurs non affecté
      }
    }
  }
  return { bilan, gestion, reportImplicite };
};

/** Mouvements de l'exercice (hors à-nouveaux) : débits et crédits par compte. */
export const mouvementsExercice = (donnees: DonneesMensuelles, annee: number) => {
  const debits: Soldes = new Map();
  const credits: Soldes = new Map();
  for (const e of ecrituresValidees(donnees)) {
    if (e._annee !== annee || e.journal === "AN") continue;
    for (const l of e.lignes ?? []) {
      ajouter(debits, l.compte, l.debit || 0);
      ajouter(credits, l.compte, l.credit || 0);
    }
  }
  const somme = (m: Soldes, prefixes: string[], exclus: string[] = []) => {
    let t = 0;
    m.forEach((v, c) => { if (prefixes.some((p) => c.startsWith(p)) && !exclus.some((p) => c.startsWith(p))) t += v; });
    return t;
  };
  return { debit: (p: string[], x?: string[]) => somme(debits, p, x), credit: (p: string[], x?: string[]) => somme(credits, p, x) };
};

// ── Bilan ───────────────────────────────────────────────────────────────────

export interface LigneActif { brut: number; amort: number; net: number }
export type BilanActif = Record<string, LigneActif>;
export type BilanPassif = Record<string, number>;

const commence = (c: string, prefixes: string[]) => prefixes.some((p) => c.startsWith(p));

/** Rubrique d'actif (brut) d'un compte de classe 2. */
const rubriqueImmo = (c: string): string | null => {
  if (c.startsWith("211")) return "AE";
  if (commence(c, ["212", "213", "214"])) return "AF";
  if (commence(c, ["215", "216"])) return "AG";
  if (c.startsWith("21")) return "AH";
  if (c.startsWith("22")) return "AJ";
  if (commence(c, ["231", "232", "233", "236", "237"])) return "AK";
  if (c.startsWith("23")) return "AL";
  if (c.startsWith("245")) return "AN";
  if (c.startsWith("24")) return "AM";
  if (c.startsWith("25")) return "AP";
  if (c.startsWith("26")) return "AR";
  if (c.startsWith("27")) return "AS";
  return null;
};

/**
 * Bilan à partir des soldes de clôture : chaque compte va dans sa rubrique ;
 * les comptes de tiers et de trésorerie vont à l'actif s'ils sont débiteurs,
 * au passif s'ils sont créditeurs.
 */
export const bilan = (soldes: Soldes, resultatNet: number, reportImplicite = 0): { actif: BilanActif; passif: BilanPassif } => {
  const brut: Record<string, number> = {};
  const amort: Record<string, number> = {};
  const passif: Record<string, number> = {};
  const b = (ref: string, v: number) => { brut[ref] = (brut[ref] ?? 0) + v; };
  const a = (ref: string, v: number) => { amort[ref] = (amort[ref] ?? 0) + v; };
  const p = (ref: string, v: number) => { passif[ref] = (passif[ref] ?? 0) + v; };

  soldes.forEach((v, c) => {
    if (!v) return;
    const cr = -v; // montant créditeur
    switch (c.charAt(0)) {
      case "1":
        if (c.startsWith("109")) p("CB", cr);
        else if (commence(c, ["101", "102", "103", "104", "10"]) && !commence(c, ["105", "106"])) p("CA", cr);
        else if (c.startsWith("105")) p("CD", cr);
        else if (c.startsWith("106")) p("CE", cr);
        else if (commence(c, ["111", "112", "113"])) p("CF", cr);
        else if (c.startsWith("11")) p("CG", cr);
        else if (c.startsWith("12")) p("CH", cr);
        else if (c.startsWith("13")) p("CJ", cr);
        else if (c.startsWith("14")) p("CL", cr);
        else if (c.startsWith("15")) p("CM", cr);
        else if (c.startsWith("17")) p("DB", cr);
        else if (c.startsWith("19")) p("DC", cr);
        else p("DA", cr); // 16, 18
        break;
      case "2": {
        if (commence(c, ["28", "29"])) {
          const ref = rubriqueImmo(`2${c.slice(2)}`);
          if (ref) a(ref, cr);
        } else {
          const ref = rubriqueImmo(c);
          if (ref) b(ref, v);
        }
        break;
      }
      case "3":
        if (c.startsWith("39")) a("BB", cr); else b("BB", v);
        break;
      case "4":
        if (commence(c, ["491"])) a("BI", cr);
        else if (commence(c, ["490"])) a("BH", cr);
        else if (commence(c, ["492", "493", "494", "495", "496", "497"])) a("BJ", cr);
        else if (c.startsWith("498")) a("BA", cr);
        else if (c.startsWith("499")) p("DN", cr);
        else if (c.startsWith("478")) b("BU", v);
        else if (c.startsWith("479")) p("DV", cr);
        else if (commence(c, ["485", "488"])) { if (v > 0) b("BA", v); else p("DH", cr); }
        else if (commence(c, ["481", "482", "483", "484"])) { if (v < 0) p("DH", cr); else b("BA", v); }
        else if (c.startsWith("409")) { if (v > 0) b("BH", v); else p("DJ", cr); }
        else if (c.startsWith("40")) { if (v < 0) p("DJ", cr); else b("BH", v); }
        else if (c.startsWith("419")) { if (v < 0) p("DI", cr); else b("BI", v); }
        else if (c.startsWith("41")) { if (v > 0) b("BI", v); else p("DI", cr); }
        else if (commence(c, ["42", "43", "44"])) { if (v > 0) b("BJ", v); else p("DK", cr); }
        else { if (v > 0) b("BJ", v); else p("DM", cr); }
        break;
      case "5":
        if (c.startsWith("590")) a("BQ", cr);
        else if (c.startsWith("599")) p("DN", cr);
        else if (c.startsWith("59")) a("BS", cr);
        else if (c.startsWith("50")) b("BQ", v);
        else if (c.startsWith("51")) b("BR", v);
        else if (commence(c, ["564", "565"])) p("DQ", cr);
        else if (c.startsWith("56")) p("DR", cr);
        else if (v > 0) b("BS", v);
        else p("DR", cr);
        break;
    }
  });

  // Résultat de l'exercice (le compte 13 n'est alimenté qu'à l'affectation)
  p("CJ", resultatNet);
  if (reportImplicite) p("CH", reportImplicite);

  const ligne = (ref: string): LigneActif => {
    const br = Math.round(brut[ref] ?? 0);
    const am = Math.round(amort[ref] ?? 0);
    return { brut: br, amort: am, net: br - am };
  };
  const total = (refs: string[]): LigneActif => refs.map(ligne).reduce(
    (t, l) => ({ brut: t.brut + l.brut, amort: t.amort + l.amort, net: t.net + l.net }), { brut: 0, amort: 0, net: 0 });

  const actif: BilanActif = {};
  for (const r of ["AE", "AF", "AG", "AH", "AJ", "AK", "AL", "AM", "AN", "AP", "AR", "AS", "BA", "BB", "BH", "BI", "BJ", "BQ", "BR", "BS", "BU"]) actif[r] = ligne(r);
  actif.AD = total(["AE", "AF", "AG", "AH"]);
  actif.AI = total(["AJ", "AK", "AL", "AM", "AN"]);
  actif.AQ = total(["AR", "AS"]);
  actif.AZ = total(["AE", "AF", "AG", "AH", "AJ", "AK", "AL", "AM", "AN", "AP", "AR", "AS"]);
  actif.BG = total(["BH", "BI", "BJ"]);
  actif.BK = total(["BA", "BB", "BH", "BI", "BJ"]);
  actif.BT = total(["BQ", "BR", "BS"]);
  const sum = (refs: string[]) => refs.reduce((t, r) => ({ brut: t.brut + actif[r].brut, amort: t.amort + actif[r].amort, net: t.net + actif[r].net }), { brut: 0, amort: 0, net: 0 });
  actif.BZ = sum(["AZ", "BK", "BT", "BU"]);

  const P: BilanPassif = {};
  for (const r of ["CA", "CB", "CD", "CE", "CF", "CG", "CH", "CJ", "CL", "CM", "DA", "DB", "DC", "DH", "DI", "DJ", "DK", "DM", "DN", "DQ", "DR", "DV"]) P[r] = Math.round(passif[r] ?? 0);
  // L'apporteur de capital non appelé est en moins des capitaux propres
  P.CB = -Math.abs(P.CB);
  P.CP = P.CA + P.CB + P.CD + P.CE + P.CF + P.CG + P.CH + P.CJ + P.CL + P.CM;
  P.DD = P.DA + P.DB + P.DC;
  P.DF = P.CP + P.DD;
  P.DP = P.DH + P.DI + P.DJ + P.DK + P.DM + P.DN;
  P.DT = P.DQ + P.DR;
  P.DZ = P.DF + P.DP + P.DT + P.DV;
  return { actif, passif: P };
};

// ── Compte de résultat ──────────────────────────────────────────────────────

/** Compte de résultat aux références officielles ; produits en +, charges en −. */
export const compteResultatLiasse = (soldes: Soldes): Record<string, number> => {
  const s = (prefixes: string[], exclus: string[] = []) => {
    let t = 0;
    soldes.forEach((v, c) => { if (commence(c, prefixes) && !commence(c, exclus)) t += v; });
    return t;
  };
  const produit = (p: string[], x?: string[]) => Math.round(-s(p, x));
  const charge = (p: string[], x?: string[]) => Math.round(-s(p, x)); // charge débitrice → négative
  const r: Record<string, number> = {
    TA: produit(["701"]), RA: charge(["601"]), RB: charge(["6031"]),
    TB: produit(["702", "703", "704"]), TC: produit(["705", "706"]), TD: produit(["707"]),
    TE: produit(["73"]), TF: produit(["72"]), TG: produit(["71"]), TH: produit(["75"]), TI: produit(["781"]),
    RC: charge(["602"]), RD: charge(["6032"]), RE: charge(["604", "605", "608"]), RF: charge(["6033"]),
    RG: charge(["61"]), RH: charge(["62", "63"]), RI: charge(["64"]), RJ: charge(["65"]),
    RK: charge(["66"]),
    TJ: produit(["791", "798", "799"]), RL: charge(["681", "691"]),
    TK: produit(["77"]), TL: produit(["797"]), TM: produit(["787"]), RM: charge(["67"]), RN: charge(["697", "687"]),
    TN: produit(["82"]), TO: produit(["84", "86", "88"]), RO: charge(["81"]), RP: charge(["83", "85"]),
    RQ: charge(["87"]), RS: charge(["89"]),
  };
  r.XA = r.TA + r.RA + r.RB;
  r.XB = r.TA + r.TB + r.TC + r.TD;
  r.XC = r.XB + r.RA + r.RB + r.TE + r.TF + r.TG + r.TH + r.TI + r.RC + r.RD + r.RE + r.RF + r.RG + r.RH + r.RI + r.RJ;
  r.XD = r.XC + r.RK;
  r.XE = r.XD + r.TJ + r.RL;
  r.XF = r.TK + r.TL + r.TM + r.RM + r.RN;
  r.XG = r.XE + r.XF;
  r.XH = r.TN + r.TO + r.RO + r.RP;
  r.XI = r.XG + r.XH + r.RQ + r.RS;
  return r;
};

// ── Tableau des flux de trésorerie (méthode indirecte) ──────────────────────

export const tableauFlux = (
  n: { actif: BilanActif; passif: BilanPassif; cr: Record<string, number> },
  n1: { actif: BilanActif; passif: BilanPassif },
  mvt: ReturnType<typeof mouvementsExercice>,
): Record<string, number> => {
  const tresorerie = (x: { actif: BilanActif; passif: BilanPassif }) => x.actif.BT.net - x.passif.DT;
  const cr = n.cr;
  const r: Record<string, number> = {};
  r.ZA = tresorerie(n1);
  // CAFG = résultat net + dotations − reprises − produits de cession + valeur comptable des cessions
  r.FA = cr.XI - cr.RL - cr.RN - cr.TJ - cr.TL - cr.TN - cr.RO;
  r.FB = -(n.actif.BA.net - n1.actif.BA.net);
  r.FC = -(n.actif.BB.net - n1.actif.BB.net);
  r.FD = -(n.actif.BG.net - n1.actif.BG.net);
  r.FE = (n.passif.DI + n.passif.DJ + n.passif.DK + n.passif.DM + n.passif.DN)
    - (n1.passif.DI + n1.passif.DJ + n1.passif.DK + n1.passif.DM + n1.passif.DN);
  r.ZB = r.FA + r.FB + r.FC + r.FD + r.FE;
  r.FF = -Math.round(mvt.debit(["21"]));
  r.FG = -Math.round(mvt.debit(["22", "23", "24", "25"]));
  r.FH = -Math.round(mvt.debit(["26", "27"]));
  r.FI = cr.TN;
  r.FJ = 0;
  r.ZC = r.FF + r.FG + r.FH + r.FI + r.FJ;
  r.FK = Math.round(mvt.credit(["101", "102", "103", "104"]));
  r.FL = Math.round(mvt.credit(["14"]));
  r.FM = -Math.round(mvt.debit(["10"], ["109"]));
  r.FN = -Math.round(mvt.debit(["465"]));
  r.ZD = r.FK + r.FL + r.FM + r.FN;
  r.FO = Math.round(mvt.credit(["16"]));
  r.FP = Math.round(mvt.credit(["17", "18"]));
  r.FQ = -Math.round(mvt.debit(["16", "17"]));
  r.ZE = r.FO + r.FP + r.FQ;
  r.ZF = r.ZB + r.ZC + r.ZD + r.ZE;
  r.ZG = r.ZF;
  r.ZH = r.ZA + r.ZG;
  return r;
};

// ── Ensemble ────────────────────────────────────────────────────────────────

export interface EtatsFinanciersLiasse {
  annee: number;
  n: { actif: BilanActif; passif: BilanPassif; cr: Record<string, number> };
  n1: { actif: BilanActif; passif: BilanPassif; cr: Record<string, number> };
  tft: Record<string, number>;
  tftN1: Record<string, number>;
  /** Écart du TFT : trésorerie calculée (ZH) − trésorerie du bilan (doit valoir 0). */
  ecartTresorerie: number;
}

const exercice = (donnees: DonneesMensuelles, annee: number) => {
  const { bilan: sb, gestion, reportImplicite } = soldesCloture(donnees, annee);
  const cr = compteResultatLiasse(gestion);
  return { ...bilan(sb, cr.XI, reportImplicite), cr };
};

export const etatsFinanciersLiasse = (donnees: DonneesMensuelles, annee: number): EtatsFinanciersLiasse => {
  const n = exercice(donnees, annee);
  const n1 = exercice(donnees, annee - 1);
  const n2 = exercice(donnees, annee - 2);
  const tft = tableauFlux(n, n1, mouvementsExercice(donnees, annee));
  const tftN1 = tableauFlux(n1, n2, mouvementsExercice(donnees, annee - 1));
  return { annee, n, n1, tft, tftN1, ecartTresorerie: tft.ZH - (n.actif.BT.net - n.passif.DT) };
};
