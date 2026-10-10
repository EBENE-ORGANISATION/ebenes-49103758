// Notes de synthèse et états complémentaires de la liasse du système normal —
// module pur : cessions (3D), provisions (28), cinq derniers exercices (31),
// indicateurs (34), loyers (page 63), analyse des ventes (P73) et des achats
// (P71), TVA (P79) et fiche récapitulative des notes (FR 4).
import type { DonneesMensuelles, Immobilisation } from "@/types/ebene";
import { cumulADate } from "@/lib/cessionImmo";
import type { Saisie } from "./xlsxPatch";
import { etatsFinanciersLiasse, mouvementsExercice, soldesCloture, type EtatsFinanciersLiasse } from "./etatsLiasse";
import type { Salarie } from "./etatsComplementaires";

type Soldes = Map<string, number>;

const commence = (c: string, prefixes: string[]) => prefixes.some((p) => c.startsWith(p));

/** Somme des soldes (débit − crédit) des comptes commençant par l'un des préfixes. */
const somme = (soldes: Soldes, prefixes: string[], exclus: string[] = []) => {
  let t = 0;
  soldes.forEach((v, c) => { if (commence(c, prefixes) && !commence(c, exclus)) t += v; });
  return t;
};

const pct = (n: number, n1: number): number | null => (n1 ? Math.round(((n - n1) / Math.abs(n1)) * 1000) / 10 : null);

// ── Note 3D : plus et moins-values de cession ───────────────────────────────

const LIGNES_3D: { ligne: number; prefixes: string[] }[] = [
  { ligne: 10, prefixes: ["211"] }, { ligne: 11, prefixes: ["212", "213", "214"] }, { ligne: 12, prefixes: ["215", "216"] },
  { ligne: 13, prefixes: ["21"] }, { ligne: 15, prefixes: ["22"] }, { ligne: 16, prefixes: ["231", "232", "233", "236", "237", "239"] },
  { ligne: 17, prefixes: ["23"] }, { ligne: 18, prefixes: ["24"] }, { ligne: 19, prefixes: ["245"] },
  { ligne: 21, prefixes: ["26"] }, { ligne: 22, prefixes: ["27"] },
];
const SOUS_TOTAUX_3D: [number, number[]][] = [[14, [10, 11, 12, 13]], [20, [15, 16, 17, 18, 19]], [23, [21, 22]], [24, [14, 20, 23]]];

/** Immobilisations cédées pendant l'exercice : brut, amortissements, VNC, prix, plus ou moins-value. */
export const saisiesNote3D = (immobilisations: Immobilisation[], annee: number): Saisie[] => {
  const lignes = new Map<number, [number, number, number, number, number]>();
  for (const i of immobilisations) {
    if (!i.dateCession || i.dateCession.slice(0, 4) !== String(annee)) continue;
    const compte = i.comptesSYSCOHADA?.actif ?? "2";
    let cible: number | null = null;
    let lg = 0;
    for (const l of LIGNES_3D) for (const p of l.prefixes) if (compte.startsWith(p) && p.length > lg) { cible = l.ligne; lg = p.length; }
    if (cible === null) continue;
    const amort = Math.min(i.valeurOrigine, cumulADate(i, i.dateCession));
    const vnc = i.valeurOrigine - amort;
    const prix = i.valeurCession ?? 0;
    const t = lignes.get(cible) ?? [0, 0, 0, 0, 0];
    lignes.set(cible, [t[0] + i.valeurOrigine, t[1] + amort, t[2] + vnc, t[3] + prix, t[4] + prix - vnc]);
  }
  if (!lignes.size) return [];
  for (const [ligne, parts] of SOUS_TOTAUX_3D) {
    const t: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    for (const p of parts) { const v = lignes.get(p); if (v) v.forEach((x, k) => { t[k] += x; }); }
    lignes.set(ligne, t);
  }
  const cols = ["D", "E", "F", "G", "H"];
  return [...lignes].flatMap(([ligne, v]) => v.map((x, k) => ({ feuille: "NOTE 3D", cellule: `${cols[k]}${ligne}`, valeur: Math.round(x) })));
};

// ── Note 28 : provisions et dépréciations ───────────────────────────────────

type NatureProvision = "exploitation" | "financiere" | "hao";
const LIGNES_28: { ligne: number; prefixes: string[]; nature: (compte: string) => NatureProvision }[] = [
  { ligne: 12, prefixes: ["15"], nature: () => "hao" },
  { ligne: 13, prefixes: ["19"], nature: () => "exploitation" },
  { ligne: 14, prefixes: ["29"], nature: (c) => (commence(c, ["296", "297"]) ? "financiere" : "exploitation") },
  { ligne: 16, prefixes: ["39"], nature: () => "exploitation" },
  { ligne: 17, prefixes: ["498"], nature: () => "hao" },
  { ligne: 18, prefixes: ["490"], nature: () => "exploitation" },
  { ligne: 19, prefixes: ["491"], nature: () => "exploitation" },
  { ligne: 20, prefixes: ["492", "493", "494", "495", "496", "497"], nature: () => "exploitation" },
  { ligne: 21, prefixes: ["590"], nature: () => "financiere" },
  { ligne: 22, prefixes: ["591"], nature: () => "financiere" },
  { ligne: 23, prefixes: ["592", "593", "594"], nature: () => "financiere" },
  { ligne: 24, prefixes: ["499"], nature: () => "exploitation" },
  { ligne: 25, prefixes: ["599"], nature: () => "financiere" },
];

/** Débits et crédits de l'exercice par compte exact (hors à-nouveaux et brouillons). */
const mouvementsParCompte = (donnees: DonneesMensuelles, annee: number) => {
  const out = new Map<string, { debit: number; credit: number }>();
  for (const [k, m] of Object.entries(donnees)) {
    for (const e of m?.ecritures ?? []) {
      if (e.statut === "brouillon" || e.journal === "AN" || (e.annee ?? Number(k.split("-")[0])) !== annee) continue;
      for (const l of e.lignes ?? []) {
        const t = out.get(l.compte) ?? { debit: 0, credit: 0 };
        t.debit += l.debit || 0; t.credit += l.credit || 0;
        out.set(l.compte, t);
      }
    }
  }
  return out;
};

/** Ouverture, dotations et reprises par nature, clôture (montants créditeurs). */
export const saisiesNote28 = (donnees: DonneesMensuelles, annee: number): Saisie[] => {
  const ouverture = soldesCloture(donnees, annee - 1).bilan;
  const cloture = soldesCloture(donnees, annee).bilan;
  const mvt = mouvementsParCompte(donnees, annee);
  const comptes = new Set([...ouverture.keys(), ...cloture.keys(), ...mvt.keys()]);
  const colDot: Record<NatureProvision, string> = { exploitation: "C", financiere: "D", hao: "E" };
  const colRep: Record<NatureProvision, string> = { exploitation: "F", financiere: "G", hao: "H" };
  const valeurs = new Map<string, number>();
  const ajouter = (cellule: string, v: number) => valeurs.set(cellule, (valeurs.get(cellule) ?? 0) + v);
  for (const c of comptes) {
    // Ligne du préfixe le plus long
    let l: (typeof LIGNES_28)[number] | null = null;
    let lg = 0;
    for (const x of LIGNES_28) for (const p of x.prefixes) if (c.startsWith(p) && p.length > lg) { l = x; lg = p.length; }
    if (!l) continue;
    const n = l.nature(c);
    ajouter(`B${l.ligne}`, -(ouverture.get(c) ?? 0));
    ajouter(`${colDot[n]}${l.ligne}`, mvt.get(c)?.credit ?? 0);
    ajouter(`${colRep[n]}${l.ligne}`, mvt.get(c)?.debit ?? 0);
    ajouter(`I${l.ligne}`, -(cloture.get(c) ?? 0));
  }
  if (![...valeurs.values()].some((v) => Math.round(v))) return [];
  const cols = ["B", "C", "D", "E", "F", "G", "H", "I"];
  const total = (ligne: number, parts: number[]) => {
    for (const col of cols) valeurs.set(`${col}${ligne}`, parts.reduce((t, p) => t + (valeurs.get(`${col}${p}`) ?? 0), 0));
  };
  total(15, [12, 13, 14]);
  total(26, [16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);
  total(27, [15, 26]);
  return [...valeurs].map(([cellule, v]) => ({ feuille: "NOTE 28", cellule, valeur: Math.round(v) }));
};

// ── Note 31 : résultats des cinq derniers exercices ─────────────────────────

/** Colonnes G (N) à K (N-4) ; un exercice sans écriture reste vide. */
export const saisiesNote31 = (donnees: DonneesMensuelles, annee: number, personnel: Salarie[]): Saisie[] => {
  const cols = ["G", "H", "I", "J", "K"];
  const out: Saisie[] = [];
  cols.forEach((col, k) => {
    const a = annee - k;
    const { bilan: sb, gestion } = soldesCloture(donnees, a);
    if (!gestion.size) return;
    const e = etatsFinanciersLiasse(donnees, a).n;
    const cr = e.cr;
    const set = (ligne: number, v: number) => out.push({ feuille: "NOTE 31", cellule: `${col}${ligne}`, valeur: Math.round(v) });
    set(15, -somme(sb, ["101", "102", "103", "104"]));
    set(22, cr.XB);
    set(23, cr.XG - cr.RL - cr.RN - cr.TJ - cr.TL);
    set(24, -cr.RQ);
    set(25, -cr.RS);
    set(26, cr.XI);
    if (k === 0 && personnel.length) set(31, personnel.length);
    set(33, somme(gestion, ["661", "662", "663"]));
    set(34, somme(gestion, ["664", "668"]));
    set(35, somme(gestion, ["667"]));
  });
  return out;
};

// ── Note 34 : fiche de synthèse des indicateurs (en milliers de francs) ─────

export const saisiesNote34 = (donnees: DonneesMensuelles, annee: number): Saisie[] => {
  const indicateurs = (a: number) => {
    const etats = etatsFinanciersLiasse(donnees, a);
    const { gestion } = soldesCloture(donnees, a);
    const mvt = mouvementsExercice(donnees, a);
    const { n } = etats;
    const cr = n.cr;
    const produit = (p: string[], x: string[] = []) => -somme(gestion, p, x);
    const charge = (p: string[], x: string[] = []) => somme(gestion, p, x);
    const v: Record<number, number> = {
      11: cr.XB, 12: cr.XA, 13: cr.XC, 14: cr.XD, 15: cr.XE, 16: cr.XF, 17: cr.XG, 18: cr.XH, 19: cr.XI,
      21: cr.XD, 22: charge(["654"]), 23: produit(["754"]),
    };
    v[24] = v[21] + v[22] - v[23];
    v[26] = v[24];
    v[27] = produit(["77"], ["776"]);
    v[28] = produit(["776"]);
    v[29] = produit(["787"]);
    v[30] = produit(["84", "86", "88"], ["848"]);
    v[31] = produit(["848"]);
    v[32] = charge(["67"], ["676"]);
    v[33] = charge(["676"]);
    v[34] = charge(["87"]);
    v[35] = charge(["89"]);
    v[36] = v[26] + v[27] + v[28] + v[29] + v[30] + v[31] - v[32] - v[33] - v[34] - v[35];
    v[37] = mvt.debit(["465"]);
    v[38] = v[36] - v[37];
    const cp = n.passif.CP;
    const dettesFin = n.passif.DD;
    v[43] = cp;
    v[44] = dettesFin;
    v[45] = cp + dettesFin;
    v[46] = n.actif.AZ.net;
    v[47] = v[45] - v[46];
    v[48] = n.actif.BK.net - n.actif.BA.net;
    v[49] = n.passif.DP - n.passif.DH;
    v[50] = v[48] - v[49];
    v[51] = n.actif.BA.net;
    v[52] = n.passif.DH;
    v[53] = v[51] - v[52];
    v[54] = v[50] + v[53];
    v[56] = v[47] - v[54];
    v[57] = n.actif.BT.net - n.passif.DT;
    v[59] = etats.tft.ZB;
    v[60] = etats.tft.ZC;
    v[61] = etats.tft.ZD + etats.tft.ZE;
    v[62] = etats.tft.ZG;
    v[64] = dettesFin + n.passif.DT;
    v[65] = n.actif.BT.net;
    v[66] = v[64] - v[65];
    // Ratios en pourcentage (non convertis en milliers)
    const ratios: Record<number, number | null> = {
      40: v[45] ? Math.round((cr.XE / v[45]) * 1000) / 10 : null,
      41: cp ? Math.round((cr.XI / cp) * 1000) / 10 : null,
    };
    return { v, ratios, vide: !gestion.size };
  };
  const N = indicateurs(annee);
  if (N.vide) return [];
  const N1 = indicateurs(annee - 1);
  const milliers = (x: number) => Math.round(x / 1000);
  const out: Saisie[] = [];
  for (const [ligne, x] of Object.entries(N.v)) {
    const l = Number(ligne);
    const n = milliers(x);
    const n1 = N1.vide ? null : milliers(N1.v[l] ?? 0);
    out.push({ feuille: "NOTE 34", cellule: `G${l}`, valeur: n });
    if (n1 !== null) {
      out.push({ feuille: "NOTE 34", cellule: `H${l}`, valeur: n1 });
      const p = pct(n, n1);
      if (p !== null) out.push({ feuille: "NOTE 34", cellule: `I${l}`, valeur: p });
    }
  }
  for (const [ligne, r] of Object.entries(N.ratios)) {
    if (r !== null) out.push({ feuille: "NOTE 34", cellule: `G${ligne}`, valeur: r });
    const r1 = N1.vide ? null : N1.ratios[Number(ligne)];
    if (r1 !== null && r1 !== undefined) out.push({ feuille: "NOTE 34", cellule: `H${ligne}`, valeur: r1 });
  }
  return out;
};

// ── Page 63 : loyers et chiffre d'affaires par localité ─────────────────────

/** Une seule localité (le siège) : CA HT de l'exercice et loyers des locaux (6221, 6222). */
export const saisiesLoyers = (etats: EtatsFinanciersLiasse, donnees: DonneesMensuelles, localite: string | null | undefined): Saisie[] => {
  const { gestion } = soldesCloture(donnees, etats.annee);
  const loyers = Math.round(somme(gestion, ["6221", "6222"]));
  const ca = etats.n.cr.XB;
  if (!ca && !loyers) return [];
  const f = "Page 63 Autres Renseig.";
  return [
    { feuille: f, cellule: "A14", valeur: localite?.trim() || "Siège" },
    { feuille: f, cellule: "C14", valeur: ca },
    { feuille: f, cellule: "F14", valeur: loyers },
    { feuille: f, cellule: "C31", valeur: ca },
    { feuille: f, cellule: "F31", valeur: loyers },
  ];
};

// ── P73 : analyse des ventes ────────────────────────────────────────────────

/** Ventes HT de l'exercice par désignation (lignes de factures, réduction répartie), toutes réalisées au Togo. */
export const ventesParDesignation = (donnees: DonneesMensuelles, annee: number): { designation: string; montant: number }[] => {
  const ventes = new Map<string, number>();
  for (const [k, m] of Object.entries(donnees)) {
    if (Number(k.split("-")[0]) !== annee) continue;
    for (const f of m?.factures ?? []) {
      if (f.statut === "proforma" || f.statut === "annulee") continue;
      const brut = f.lignes.reduce((t, l) => t + (l.montant || 0), 0);
      if (!brut) continue;
      for (const l of f.lignes) {
        const nom = l.description.trim() || "Ventes diverses";
        ventes.set(nom, (ventes.get(nom) ?? 0) + ((l.montant || 0) * f.totalHT) / brut);
      }
    }
  }
  return [...ventes].map(([designation, montant]) => ({ designation, montant: Math.round(montant) })).sort((a, b) => b.montant - a.montant);
};

export const saisiesAnalyseVentes = (donnees: DonneesMensuelles, annee: number): Saisie[] => {
  const ventes = ventesParDesignation(donnees, annee);
  if (!ventes.length) return [];
  const f = "P73 Analyse des Ventes";
  const max = 38; // lignes 15 à 52
  const out: Saisie[] = [];
  ventes.slice(0, max).forEach((v, i) => {
    out.push({ feuille: f, cellule: `A${15 + i}`, valeur: v.designation });
    out.push({ feuille: f, cellule: `C${15 + i}`, valeur: v.montant });
    out.push({ feuille: f, cellule: `J${15 + i}`, valeur: v.montant });
  });
  const reste = ventes.slice(max).reduce((t, v) => t + v.montant, 0);
  if (reste) { out.push({ feuille: f, cellule: "C53", valeur: reste }); out.push({ feuille: f, cellule: "J53", valeur: reste }); }
  const total = ventes.reduce((t, v) => t + v.montant, 0);
  for (const l of [54, 55]) { out.push({ feuille: f, cellule: `C${l}`, valeur: total }); out.push({ feuille: f, cellule: `J${l}`, valeur: total }); }
  return out;
};

// ── P78 : détail des créances clients ───────────────────────────────────────

/**
 * Factures non encore réglées à la clôture (TTC), par nature : livraisons de
 * biens (activité commerce) ou prestations de services. Une facture réglée
 * après la clôture est encore une créance à cette date.
 */
export const creancesClients = (donnees: DonneesMensuelles, annee: number): { biens: number; services: number } => {
  const cloture = `${annee}-12-31`;
  const reglees = new Set<number>();
  for (const m of Object.values(donnees)) {
    for (const t of m?.transactions ?? []) if (t.factureId && t.date <= cloture) reglees.add(t.factureId);
  }
  let biens = 0, services = 0;
  for (const m of Object.values(donnees)) {
    for (const f of m?.factures ?? []) {
      if (f.statut === "proforma" || f.statut === "annulee" || f.date > cloture || reglees.has(f.id)) continue;
      if (f.activite === "commerce") biens += f.totalTtc; else services += f.totalTtc;
    }
  }
  return { biens: Math.round(biens), services: Math.round(services) };
};

export const saisiesCreancesClients = (donnees: DonneesMensuelles, annee: number): Saisie[] => {
  const f = "P78 Détail CREANCES CLIENTS ET";
  const out: Saisie[] = [];
  (["B", "D", "F", "H"] as const).forEach((col, k) => {
    const { biens, services } = creancesClients(donnees, annee - k);
    if (!biens && !services) return;
    out.push({ feuille: f, cellule: `${col}15`, valeur: biens }, { feuille: f, cellule: `${col}16`, valeur: services }, { feuille: f, cellule: `${col}18`, valeur: biens + services });
  });
  return out;
};

// ── P71 : analyse du coût d'achat ───────────────────────────────────────────

/**
 * Achats HT de l'exercice de marchandises (601), de matières premières (602) et
 * de matières et fournitures consommables (604), par nature (intitulé du
 * compte), achetés localement. Les fournitures non stockables (605) n'en sont pas.
 */
export const achatsParDesignation = (donnees: DonneesMensuelles, annee: number): { designation: string; montant: number }[] => {
  const achats = new Map<string, number>();
  for (const [k, m] of Object.entries(donnees)) {
    if (Number(k.split("-")[0]) !== annee) continue;
    for (const e of m?.ecritures ?? []) {
      if (e.statut === "brouillon") continue;
      for (const l of e.lignes ?? []) {
        if (!commence(l.compte, ["601", "602", "604"])) continue;
        const nom = (l.intitule || l.compte).trim();
        achats.set(nom, (achats.get(nom) ?? 0) + (l.debit || 0) - (l.credit || 0));
      }
    }
  }
  return [...achats].filter(([, v]) => Math.round(v)).map(([designation, montant]) => ({ designation, montant: Math.round(montant) })).sort((a, b) => b.montant - a.montant);
};

export const saisiesAnalyseAchats = (donnees: DonneesMensuelles, annee: number): Saisie[] => {
  const achats = achatsParDesignation(donnees, annee);
  if (!achats.length) return [];
  const f = "P71 Analyse coût dachat";
  const max = 44; // lignes 15 à 58
  const out: Saisie[] = [];
  achats.slice(0, max).forEach((a, i) => {
    const l = 15 + i;
    out.push(
      { feuille: f, cellule: `A${l}`, valeur: a.designation },
      { feuille: f, cellule: `C${l}`, valeur: "Togo" },
      { feuille: f, cellule: `D${l}`, valeur: a.montant },
      { feuille: f, cellule: `G${l}`, valeur: a.montant },
      { feuille: f, cellule: `K${l}`, valeur: a.montant },
    );
  });
  const reste = achats.slice(max).reduce((t, a) => t + a.montant, 0);
  if (reste) for (const c of ["D", "G", "K"]) out.push({ feuille: f, cellule: `${c}59`, valeur: reste });
  const total = achats.reduce((t, a) => t + a.montant, 0);
  for (const l of [60, 61]) for (const c of ["D", "G", "K"]) out.push({ feuille: f, cellule: `${c}${l}`, valeur: total });
  return out;
};

// ── P79 : TVA de l'exercice ─────────────────────────────────────────────────

/** TVA récupérable (débits des 445) et facturée (crédits des 443) de l'exercice. */
export const saisiesTva = (donnees: DonneesMensuelles, annee: number): Saisie[] => {
  const mvt = mouvementsExercice(donnees, annee);
  const r = (x: number) => Math.round(x);
  const recup: Record<number, number> = {
    15: r(mvt.debit(["4452"])), 16: r(mvt.debit(["4453", "4454"])), 17: r(mvt.debit(["4451"])),
  };
  const facturee: Record<number, number> = {
    19: r(mvt.credit(["4431"])), 20: r(mvt.credit(["4432"])), 21: r(mvt.credit(["4433"])), 22: r(mvt.credit(["4434"])),
  };
  const totalRecup = Object.values(recup).reduce((t, v) => t + v, 0);
  const totalFacturee = Object.values(facturee).reduce((t, v) => t + v, 0);
  if (!totalRecup && !totalFacturee) return [];
  const f = "P79 TVA";
  return [
    ...Object.entries({ ...recup, ...facturee }).map(([l, v]) => ({ feuille: f, cellule: `E${l}`, valeur: v })),
    { feuille: f, cellule: "E18", valeur: totalRecup },
    { feuille: f, cellule: "E24", valeur: totalFacturee },
    { feuille: f, cellule: "E25", valeur: Math.max(0, totalFacturee - totalRecup) },
    { feuille: f, cellule: "E26", valeur: Math.max(0, totalRecup - totalFacturee) },
  ];
};

// ── FR 4 : fiche récapitulative des notes présentées ────────────────────────

/** Ligne de la fiche → feuille(s) de la note et, pour les notes 23 et 24 qui partagent une feuille, les lignes concernées. */
const NOTES_FR4: { ligne: number; feuille?: string; lignes?: [number, number]; toujours?: boolean }[] = [
  { ligne: 10, feuille: "NOTE 1" }, { ligne: 11, toujours: true }, { ligne: 12, feuille: "TABLEAU immo note 3A" },
  { ligne: 13, feuille: "TABLEAU IMMO note 3 B" }, { ligne: 14, feuille: "NOTE 3C AMORTISSEMENT" }, { ligne: 15, feuille: "NOTE 3D" },
  { ligne: 16, feuille: "NOTE 3E" }, { ligne: 17 }, { ligne: 18, feuille: "NOTE 4" }, { ligne: 19, feuille: "NOTE 5" },
  { ligne: 20, feuille: "NOTE 6" }, { ligne: 21, feuille: "NOTE 7" }, { ligne: 22, feuille: "NOTE 8" }, { ligne: 23, feuille: "NOTE 9" },
  { ligne: 24, feuille: "NOTE 10" }, { ligne: 25, feuille: "NOTE 11" }, { ligne: 26, feuille: "NOTE 12" }, { ligne: 27, feuille: "NOTE 13" },
  { ligne: 28, feuille: "NOTE 14" }, { ligne: 29, feuille: "NOTE 15 A" }, { ligne: 30, feuille: "NOTE 15B" }, { ligne: 31, feuille: "NOTE 16A" },
  { ligne: 32, feuille: "Note 16 B" }, { ligne: 33, feuille: "Note 16 B bis" }, { ligne: 34, feuille: "Note 16 C" }, { ligne: 35, feuille: "Note 17" },
  { ligne: 36, feuille: "note 18" }, { ligne: 37, feuille: "NOTE 19" }, { ligne: 38, feuille: "NOTE 20" }, { ligne: 39, feuille: "NOTE 21" },
  { ligne: 40, feuille: "NOTE 22" }, { ligne: 41, feuille: "NOTE 23 24", lignes: [10, 29] }, { ligne: 42, feuille: "NOTE 23 24", lignes: [30, 60] },
  { ligne: 43, feuille: "NOTE 25" }, { ligne: 44, feuille: "NOTE 26" }, { ligne: 45, feuille: "NOTE 27A" }, { ligne: 46, feuille: "NOTE 27 B" },
  { ligne: 47, feuille: "NOTE 28" }, { ligne: 48, feuille: "NOTE 29" }, { ligne: 49, feuille: "NOTE 30" }, { ligne: 50, feuille: "NOTE 31" },
  { ligne: 51, feuille: "NOTE 32" }, { ligne: 52, feuille: "NOTE 33" }, { ligne: 53, feuille: "NOTE 34" }, { ligne: 54, feuille: "NOTE 35" },
  { ligne: 55, toujours: true },
];

/**
 * Coche « A » (applicable) pour chaque note qui reçoit au moins un montant non
 * nul, « N/A » sinon. Les notes 2 (informations obligatoires) et 36 (table des
 * codes) sont toujours applicables.
 */
export const saisiesFicheRecapitulative = (saisies: Saisie[]): Saisie[] => {
  const ligneDe = (cellule: string) => Number(cellule.replace(/^[A-Z]+/, ""));
  return NOTES_FR4.map((n) => {
    const applicable = n.toujours || (!!n.feuille && saisies.some((s) =>
      s.feuille === n.feuille && typeof s.valeur === "number" && Math.round(s.valeur) !== 0
      && (!n.lignes || (ligneDe(s.cellule) >= n.lignes[0] && ligneDe(s.cellule) <= n.lignes[1]))));
    return { feuille: "FR 4", cellule: `${applicable ? "G" : "H"}${n.ligne}`, valeur: "X" };
  });
};
