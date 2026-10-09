// États complémentaires et notes à partir des données de gestion (factures,
// immobilisations, stock, personnel, trésorerie) — module pur.
import type { Article, DonneesMensuelles, Immobilisation } from "@/types/ebene";
import { cumulAFin, dotationAnnee } from "@/lib/amortissements";
import { transactionComptabilisee } from "@/lib/ebene-utils";
import type { Saisie } from "./xlsxPatch";
import { soldesCloture } from "./etatsLiasse";
import { DETAIL_REEL, DETAIL_SMT, type TableDetail } from "./detailComptes";

const dateFrCourte = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

// ── Détail des charges et produits par compte ───────────────────────────────

/**
 * Montant de chaque ligne de compte détaillé : un compte va dans la ligne
 * dont le code est son plus long préfixe ; un compte plus court que les codes
 * (ex. 601 face à 6011…6019) va dans la première ligne qui le prolonge.
 */
export const saisiesDetailComptes = (donnees: DonneesMensuelles, annee: number, tables: TableDetail[]): Saisie[] => {
  const { gestion } = soldesCloture(donnees, annee);
  const toutes = tables.flatMap((t) => t.lignes.map(([ligne, code]) => ({ feuille: t.feuille, col: t.col, ligne, code })));
  const montants = new Map<string, number>();
  const cle = (l: (typeof toutes)[number]) => `${l.feuille}|${l.col}${l.ligne}`;
  gestion.forEach((v, compte) => {
    if (!v) return;
    let cible = toutes
      .filter((l) => compte.startsWith(l.code))
      .sort((a, b) => b.code.length - a.code.length)[0];
    if (!cible) cible = toutes.find((l) => l.code.startsWith(compte));
    if (!cible) return;
    const produit = compte.startsWith("7") || (compte.startsWith("8") && Number(compte.charAt(1)) % 2 === 0);
    montants.set(cle(cible), (montants.get(cle(cible)) ?? 0) + (produit ? -v : v));
  });
  return toutes
    .filter((l) => montants.has(cle(l)))
    .map((l) => ({ feuille: l.feuille, cellule: `${l.col}${l.ligne}`, valeur: Math.round(montants.get(cle(l))!) }));
};

// ── Principaux clients et fournisseurs ──────────────────────────────────────

interface Tiers { nom: string; ht: number; tva: number; ttc: number }

/** Clients (factures payées ou en attente, hors proformas et annulées) de l'exercice, par montant. */
export const principauxClients = (donnees: DonneesMensuelles, annee: number): Tiers[] => {
  const parClient = new Map<string, Tiers>();
  for (const [k, m] of Object.entries(donnees)) {
    if (Number(k.split("-")[0]) !== annee) continue;
    for (const f of m?.factures ?? []) {
      if (f.statut === "proforma" || f.statut === "annulee") continue;
      const t = parClient.get(f.client) ?? { nom: f.client, ht: 0, tva: 0, ttc: 0 };
      t.ht += f.totalHT; t.tva += f.avecTva ? f.totalTva : 0; t.ttc += f.avecTva ? f.totalHT + f.totalTva : f.totalHT;
      parClient.set(f.client, t);
    }
  }
  return [...parClient.values()].sort((a, b) => b.ttc - a.ttc);
};

/** Fournisseurs (dépenses comptabilisées au nom d'un fournisseur) de l'exercice, par montant. */
export const principauxFournisseurs = (donnees: DonneesMensuelles, annee: number, tauxTva = 0.18): Tiers[] => {
  const parFournisseur = new Map<string, Tiers>();
  for (const [k, m] of Object.entries(donnees)) {
    if (Number(k.split("-")[0]) !== annee) continue;
    for (const t of m?.transactions ?? []) {
      if (t.type !== "d" || !t.fournisseur || !transactionComptabilisee(t)) continue;
      const ttc = Math.abs(t.m);
      const ht = t.avecTva === false || t.source !== "fournisseur" ? ttc : Math.round(ttc / (1 + tauxTva));
      const f = parFournisseur.get(t.fournisseur) ?? { nom: t.fournisseur, ht: 0, tva: 0, ttc: 0 };
      f.ht += ht; f.tva += ttc - ht; f.ttc += ttc;
      parFournisseur.set(t.fournisseur, f);
    }
  }
  return [...parFournisseur.values()].sort((a, b) => b.ttc - a.ttc);
};

const saisiesTiers = (feuille: string, premiere: number, tiers: Tiers[], max = 30): Saisie[] =>
  tiers.slice(0, max).flatMap((t, i) => [
    { feuille, cellule: `A${premiere + i}`, valeur: i + 1 },
    { feuille, cellule: `C${premiere + i}`, valeur: t.nom },
    { feuille, cellule: `G${premiere + i}`, valeur: Math.round(t.ht) },
    { feuille, cellule: `H${premiere + i}`, valeur: Math.round(t.tva) },
    { feuille, cellule: `I${premiere + i}`, valeur: Math.round(t.ttc) },
  ]);

// ── Tableau des amortissements (P85) ────────────────────────────────────────

export const saisiesAmortissements = (immobilisations: Immobilisation[], annee: number, feuille = "P85 Tableau des amort.", premiere = 16): Saisie[] =>
  immobilisations
    .filter((i) => i.dateAcquisition.slice(0, 4) <= String(annee))
    .slice(0, 40)
    .flatMap((i, k) => {
      const l = premiere + k;
      const anterieurs = cumulAFin(i, annee - 1);
      const dotation = dotationAnnee(i, annee);
      const total = anterieurs + dotation;
      const taux = i.dureeAmortissement > 0 ? Math.round((100 / i.dureeAmortissement) * 100) / 100 : 0;
      const cedee = !!i.dateCession && i.dateCession.slice(0, 4) === String(annee);
      return [
        { feuille, cellule: `A${l}`, valeur: i.libelle },
        { feuille, cellule: `C${l}`, valeur: dateFrCourte(i.dateAcquisition) },
        { feuille, cellule: `D${l}`, valeur: Math.round(i.valeurOrigine) },
        { feuille, cellule: `E${l}`, valeur: taux },
        { feuille, cellule: `F${l}`, valeur: Math.round(anterieurs) },
        { feuille, cellule: `G${l}`, valeur: Math.round(dotation) },
        { feuille, cellule: `H${l}`, valeur: Math.round(total) },
        { feuille, cellule: `I${l}`, valeur: Math.round(i.valeurOrigine - total) },
        ...(cedee ? [{ feuille, cellule: `J${l}`, valeur: Math.round(i.valeurCession ?? 0) }] : []),
      ];
    });

// ── Personnel (note 27B, état CA du SMT) ────────────────────────────────────

export interface Salarie {
  sexe?: "M" | "F" | string | null;
  nationalite?: string | null;
  categorie?: string | null;
  typeContrat?: string | null;
  /** Salaire brut versé sur l'exercice. */
  masseAnnuelle: number;
}

const OHADA = ["bénin", "benin", "burkina", "cameroun", "centrafric", "comores", "congo", "ivoir", "gabon", "guinée", "guinee", "mali", "niger", "sénégal", "senegal", "tchad"];

const zone = (nationalite?: string | null): "nationaux" | "ohada" | "hors" => {
  const n = (nationalite ?? "Togolaise").toLowerCase();
  if (!n || n.startsWith("togo")) return "nationaux";
  return OHADA.some((p) => n.includes(p)) ? "ohada" : "hors";
};

/** Qualification : YA cadres supérieurs, YB techniciens supérieurs / cadres moyens, YC agents de maîtrise, YD employés et ouvriers. */
export const qualification = (categorie?: string | null): "YA" | "YB" | "YC" | "YD" => {
  const c = (categorie ?? "E1").toUpperCase();
  if (c === "C3" || c === "C4") return "YA";
  if (c.startsWith("C")) return "YB";
  if (c.startsWith("M")) return "YC";
  return "YD";
};

export const saisiesNote27B = (personnel: Salarie[]): Saisie[] => {
  const f = "NOTE 27 B";
  const lignes = { YA: 13, YB: 14, YC: 15, YD: 16, YE: 17, YF: 18, YG: 19 } as const;
  const colsEff = { nationaux: ["C", "D"], ohada: ["E", "F"], hors: ["G", "H"] } as const;
  const colsMasse = { nationaux: ["J", "K"], ohada: ["L", "M"], hors: ["N", "O"] } as const;
  const comptes = new Map<string, number>();
  const ajouter = (k: string, v: number) => comptes.set(k, (comptes.get(k) ?? 0) + v);
  for (const s of personnel) {
    const z = zone(s.nationalite);
    const i = s.sexe === "F" ? 1 : 0;
    const q = qualification(s.categorie);
    const statut = !s.typeContrat || s.typeContrat === "cdi" ? "YF" : "YG";
    for (const ligne of [lignes[q], lignes.YE, lignes[statut]]) {
      ajouter(`${colsEff[z][i]}${ligne}`, 1);
      ajouter(`I${ligne}`, 1);
      ajouter(`${colsMasse[z][i]}${ligne}`, s.masseAnnuelle);
      ajouter(`P${ligne}`, s.masseAnnuelle);
    }
  }
  return [...comptes].map(([cellule, v]) => ({ feuille: f, cellule, valeur: Math.round(v) }));
};

// ── Notes du SMT ────────────────────────────────────────────────────────────

/** NOTE1 : suivi du matériel et des immobilisations. */
const saisiesSmtMateriel = (immos: Immobilisation[], annee: number): Saisie[] =>
  immos.filter((i) => i.dateAcquisition.slice(0, 4) <= String(annee)).slice(0, 14).flatMap((i, k) => [
    { feuille: "NOTE1", cellule: `A${11 + k}`, valeur: dateFrCourte(i.dateAcquisition) },
    { feuille: "NOTE1", cellule: `B${11 + k}`, valeur: i.libelle },
    { feuille: "NOTE1", cellule: `G${11 + k}`, valeur: Math.round(i.valeurOrigine) },
    ...(i.dateCession ? [
      { feuille: "NOTE1", cellule: `H${11 + k}`, valeur: dateFrCourte(i.dateCession) },
      { feuille: "NOTE1", cellule: `I${11 + k}`, valeur: Math.round(i.valeurCession ?? 0) },
    ] : []),
  ]);

/** NOTE2 : état des stocks (articles en stock à la clôture). */
const saisiesSmtStocks = (articles: Article[]): Saisie[] =>
  articles.filter((a) => a.stock > 0).slice(0, 14).flatMap((a, k) => [
    { feuille: "NOTE2", cellule: `A${11 + k}`, valeur: a.reference },
    { feuille: "NOTE2", cellule: `B${11 + k}`, valeur: a.designation },
    { feuille: "NOTE2", cellule: `G${11 + k}`, valeur: a.stock },
    { feuille: "NOTE2", cellule: `H${11 + k}`, valeur: Math.round(a.prixAchat) },
    { feuille: "NOTE2", cellule: `I${11 + k}`, valeur: Math.round(a.stock * a.prixAchat) },
  ]);

/** NOTE3 : créances clients non encaissées (factures en attente) à la clôture. */
const saisiesSmtCreances = (donnees: DonneesMensuelles, annee: number): Saisie[] => {
  const ouvertes = Object.entries(donnees)
    .filter(([k]) => Number(k.split("-")[0]) <= annee)
    .flatMap(([, m]) => m?.factures ?? [])
    .filter((f) => f.statut === "en_attente" && f.date.slice(0, 4) <= String(annee));
  return ouvertes.slice(0, 14).flatMap((f, k) => [
    { feuille: "NOTE3", cellule: `A${11 + k}`, valeur: dateFrCourte(f.date) },
    { feuille: "NOTE3", cellule: `B${11 + k}`, valeur: f.client },
    { feuille: "NOTE3", cellule: `E${11 + k}`, valeur: Math.round(f.totalTtc) },
  ]);
};

/** NOT4 : journal de trésorerie, une ligne par mois avec ventilation. */
const saisiesSmtJournal = (donnees: DonneesMensuelles, annee: number): Saisie[] => {
  const out: Saisie[] = [];
  const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  let solde = 0;
  for (let mois = 1; mois <= 12; mois++) {
    const m = donnees[`${annee}-${mois}`];
    const v = { recettes: 0, depenses: 0, ventes: 0, autresR: 0, materiel: 0, marchandises: 0, matieres: 0, loyer: 0, salaires: 0, impots: 0, autresD: 0 };
    for (const t of m?.transactions ?? []) {
      if (!transactionComptabilisee(t)) continue;
      const x = Math.abs(t.m);
      const c = t.compte ?? "";
      if (t.type === "r") {
        v.recettes += x;
        if (t.source === "facture" || c.startsWith("70")) v.ventes += x; else v.autresR += x;
      } else {
        v.depenses += x;
        if (c.startsWith("2")) v.materiel += x;
        else if (c.startsWith("601")) v.marchandises += x;
        else if (c.startsWith("602") || c.startsWith("604")) v.matieres += x;
        else if (c.startsWith("622")) v.loyer += x;
        else if (t.source === "salaires" || c.startsWith("66") || ["431", "433", "447"].includes(c)) v.salaires += x;
        else if (c.startsWith("64")) v.impots += x;
        else v.autresD += x;
      }
    }
    if (!v.recettes && !v.depenses) continue;
    solde += v.recettes - v.depenses;
    const l = 12 + mois;
    const r = (n: number) => Math.round(n);
    out.push(
      { feuille: "NOT4", cellule: `A${l}`, valeur: `${MOIS[mois - 1]} ${annee}` },
      { feuille: "NOT4", cellule: `B${l}`, valeur: "Opérations du mois" },
      { feuille: "NOT4", cellule: `D${l}`, valeur: r(v.recettes) },
      { feuille: "NOT4", cellule: `E${l}`, valeur: r(v.depenses) },
      { feuille: "NOT4", cellule: `F${l}`, valeur: r(solde) },
      { feuille: "NOT4", cellule: `G${l}`, valeur: r(v.ventes) },
      { feuille: "NOT4", cellule: `H${l}`, valeur: r(v.autresR) },
      { feuille: "NOT4", cellule: `I${l}`, valeur: r(v.materiel) },
      { feuille: "NOT4", cellule: `J${l}`, valeur: r(v.marchandises) },
      { feuille: "NOT4", cellule: `K${l}`, valeur: r(v.matieres) },
      { feuille: "NOT4", cellule: `L${l}`, valeur: r(v.loyer) },
      { feuille: "NOT4", cellule: `M${l}`, valeur: r(v.salaires) },
      { feuille: "NOT4", cellule: `N${l}`, valeur: r(v.impots) },
      { feuille: "NOT4", cellule: `O${l}`, valeur: r(v.autresD) },
    );
  }
  return out;
};

/** État CA du SMT : chiffre d'affaires par nature et effectif. */
const saisiesSmtCa = (donnees: DonneesMensuelles, annee: number, personnel: Salarie[]): Saisie[] => {
  const ca = (a: number) => {
    const { gestion } = soldesCloture(donnees, a);
    let ventes = 0, services = 0, autres = 0;
    gestion.forEach((v, c) => {
      if (c.startsWith("701")) ventes -= v;
      else if (c.startsWith("705") || c.startsWith("706")) services -= v;
      else if (c.startsWith("70")) autres -= v;
    });
    return [ventes, services, autres].map(Math.round);
  };
  const [vN, sN, aN] = ca(annee);
  const [v1, s1, a1] = ca(annee - 1);
  const out: Saisie[] = [
    { feuille: "CA", cellule: "E21", valeur: vN }, { feuille: "CA", cellule: "G21", valeur: v1 },
    { feuille: "CA", cellule: "E22", valeur: sN }, { feuille: "CA", cellule: "G22", valeur: s1 },
    { feuille: "CA", cellule: "E23", valeur: aN }, { feuille: "CA", cellule: "G23", valeur: a1 },
    { feuille: "CA", cellule: "E24", valeur: vN + sN + aN }, { feuille: "CA", cellule: "G24", valeur: v1 + s1 + a1 },
  ];
  const lignes = { YA: 32, YB: 33, YC: 34, YD: 35 } as const;
  const eff = { YA: 0, YB: 0, YC: 0, YD: 0 };
  for (const s of personnel) eff[qualification(s.categorie)]++;
  for (const [q, l] of Object.entries(lignes)) out.push({ feuille: "CA", cellule: `E${l}`, valeur: eff[q as keyof typeof eff] });
  out.push({ feuille: "CA", cellule: "E36", valeur: personnel.length });
  return out;
};

export interface DonneesGestion {
  immobilisations?: Immobilisation[];
  articles?: Article[];
  personnel?: Salarie[];
}

/** Compléments du système normal. */
export const complementsReel = (donnees: DonneesMensuelles, annee: number, g: DonneesGestion): Saisie[] => [
  ...saisiesDetailComptes(donnees, annee, DETAIL_REEL),
  ...saisiesTiers("P83 Liste principaux clients", 15, principauxClients(donnees, annee)),
  ...saisiesTiers("P84 Liste princip. fourniss.", 13, principauxFournisseurs(donnees, annee)),
  ...saisiesAmortissements(g.immobilisations ?? [], annee),
  ...saisiesNote27B(g.personnel ?? []),
];

/** Compléments du SMT. */
export const complementsSmt = (donnees: DonneesMensuelles, annee: number, g: DonneesGestion): Saisie[] => [
  ...saisiesDetailComptes(donnees, annee, DETAIL_SMT),
  ...saisiesSmtMateriel(g.immobilisations ?? [], annee),
  ...saisiesSmtStocks(g.articles ?? []),
  ...saisiesSmtCreances(donnees, annee),
  ...saisiesSmtJournal(donnees, annee),
  ...saisiesSmtCa(donnees, annee, g.personnel ?? []),
];
