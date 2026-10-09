// Liasse du système minimal de trésorerie (SMT, régime TPU) — module pur.
// Compte de résultat en recettes et dépenses encaissées / décaissées, corrigé
// des variations de stocks, créances et dettes et des amortissements.
import type { DonneesMensuelles } from "@/types/ebene";
import { transactionComptabilisee } from "@/lib/ebene-utils";
import type { Saisie } from "./xlsxPatch";
import type { EtatsFinanciersLiasse } from "./etatsLiasse";
import type { InfosSociete } from "./modeleReel";

export interface RecettesDepenses {
  ventes: number;
  prestations: number;
  autresRecettes: number;
  achats: number;
  loyers: number;
  salaires: number;
  impots: number;
  interets: number;
  autresDepenses: number;
}

/** Recettes et dépenses de l'exercice, d'après les opérations comptabilisées. */
export const recettesDepenses = (donnees: DonneesMensuelles, annee: number): RecettesDepenses => {
  const r: RecettesDepenses = { ventes: 0, prestations: 0, autresRecettes: 0, achats: 0, loyers: 0, salaires: 0, impots: 0, interets: 0, autresDepenses: 0 };
  for (const [k, m] of Object.entries(donnees)) {
    if (Number(k.split("-")[0]) !== annee) continue;
    const factures = new Map((m?.factures ?? []).map((f) => [f.id, f]));
    for (const t of m?.transactions ?? []) {
      if (!transactionComptabilisee(t)) continue;
      const montant = Math.abs(t.m);
      const compte = t.compte ?? "";
      if (t.type === "r") {
        const f = t.factureId ? factures.get(t.factureId) : undefined;
        if (f) {
          if (f.activite === "commerce") r.ventes += montant; else r.prestations += montant;
        } else if (compte.startsWith("701")) r.ventes += montant;
        else if (compte.startsWith("70")) r.prestations += montant;
        else r.autresRecettes += montant;
      } else if (t.source === "salaires" || compte.startsWith("66") || ["431", "433", "447"].includes(compte)) {
        r.salaires += montant;
      } else if (compte.startsWith("60")) r.achats += montant;
      else if (compte.startsWith("622")) r.loyers += montant;
      else if (compte.startsWith("64")) r.impots += montant;
      else if (compte.startsWith("67")) r.interets += montant;
      else r.autresDepenses += montant;
    }
  }
  for (const k of Object.keys(r) as (keyof RecettesDepenses)[]) r[k] = Math.round(r[k]);
  return r;
};

/** Montants du compte de résultat SMT (lignes 10 à 27). */
export const compteResultatSmt = (rd: RecettesDepenses, etats: { actif: EtatsFinanciersLiasse["n"]["actif"]; passif: EtatsFinanciersLiasse["n"]["passif"]; cr: Record<string, number> }, prec: { actif: EtatsFinanciersLiasse["n"]["actif"]; passif: EtatsFinanciersLiasse["n"]["passif"] }) => {
  const recettes = rd.ventes + rd.prestations + rd.autresRecettes;
  const depenses = rd.achats + rd.loyers + rd.salaires + rd.impots + rd.interets + rd.autresDepenses;
  const solde = recettes - depenses;
  const dettes = (p: EtatsFinanciersLiasse["n"]["passif"]) => p.DJ + p.DI + p.DK + p.DM;
  const varStocks = etats.actif.BB.net - prec.actif.BB.net;
  const varCreances = etats.actif.BG.net - prec.actif.BG.net;
  const varDettes = -(dettes(etats.passif) - dettes(prec.passif));
  const dotations = -(etats.cr.RL ?? 0);
  return {
    10: rd.ventes, 11: rd.prestations, 12: rd.autresRecettes, 13: recettes,
    14: rd.achats, 15: rd.loyers, 16: rd.salaires, 17: rd.impots, 18: rd.interets, 19: rd.autresDepenses, 20: depenses,
    21: solde, 23: varStocks, 24: varCreances, 25: varDettes, 26: dotations,
    27: solde + varStocks + varCreances + varDettes - dotations,
  } as Record<number, number>;
};

/** Bilan SMT : actif (lignes 13 à 18, colonnes C/D) et passif (colonnes H/I). */
export const bilanSmt = (e: { actif: EtatsFinanciersLiasse["n"]["actif"]; passif: EtatsFinanciersLiasse["n"]["passif"] }, caisse: number) => {
  const { actif, passif } = e;
  const tresorerieNette = actif.BT.net - passif.DT;
  const banque = tresorerieNette - caisse;
  const totalActif = actif.AZ.net + actif.BB.net + actif.BG.net + actif.BA.net + actif.BU.net + caisse + banque;
  const exploitant = passif.CP - passif.CJ;
  const totalPassif = exploitant + passif.CJ + passif.DD + passif.DP + passif.DV;
  return {
    actif: { 13: actif.AZ.net, 14: actif.BB.net, 15: actif.BG.net + actif.BA.net + actif.BU.net, 16: caisse, 17: banque, 18: totalActif },
    passif: { 13: exploitant, 14: passif.CJ, 15: passif.DD, 16: passif.DP + passif.DV, 18: totalPassif },
  };
};

/** Solde des comptes de caisse (57) à la clôture. */
export const caisseCloture = (donnees: DonneesMensuelles, annee: number): number => {
  let s = 0;
  for (const [k, m] of Object.entries(donnees)) {
    if (Number(k.split("-")[0]) > annee) continue;
    for (const e of m?.ecritures ?? []) {
      if (e.statut === "brouillon") continue;
      for (const l of e.lignes ?? []) if (l.compte.startsWith("57")) s += (l.debit || 0) - (l.credit || 0);
    }
  }
  return Math.round(s);
};

/** Cellules de la liasse SMT. */
export const saisiesSmt = (
  donnees: DonneesMensuelles,
  etats: EtatsFinanciersLiasse,
  societe: InfosSociete,
): Saisie[] => {
  const a = etats.annee;
  const out: Saisie[] = [];
  const set = (feuille: string, cellule: string, valeur: number | string | null | undefined) => {
    if (valeur === undefined || valeur === null || valeur === "") return;
    out.push({ feuille, cellule, valeur });
  };
  const cloture = `31/12/${a}`;

  // Fiche de dépôt
  const fd = "FICHE DEPOT SMT REF";
  set(fd, "E17", cloture);
  set(fd, "E20", societe.nom);
  set(fd, "E23", societe.sigle);
  set(fd, "E25", societe.adresse);
  set(fd, "E27", societe.nif);

  // En-têtes : bilan, puis compte de résultat et notes (même disposition)
  set("BILAN", "C4", societe.nom); set("BILAN", "F5", societe.sigle); set("BILAN", "C6", societe.adresse);
  set("BILAN", "C7", societe.nif); set("BILAN", "F7", cloture); set("BILAN", "I7", 12);
  for (const f of ["COMPTE DE RESULTAT", "NOTE1", "NOTE2", "NOTE3", "NOTE3 (2)"]) {
    set(f, "E3", societe.nom); set(f, "F4", societe.sigle); set(f, "C5", societe.adresse);
    set(f, "C6", societe.nif); set(f, "F6", cloture); set(f, "I6", 12);
  }
  for (const f of ["NOT4", "NOT4 (2)"]) {
    set(f, "D3", societe.nom); set(f, "I4", societe.sigle); set(f, "C5", societe.adresse);
    set(f, "C6", societe.nif); set(f, "I6", cloture);
  }

  // Bilan N et N-1
  const bN = bilanSmt(etats.n, caisseCloture(donnees, a));
  const bN1 = bilanSmt(etats.n1, caisseCloture(donnees, a - 1));
  for (const [l, v] of Object.entries(bN.actif)) set("BILAN", `C${l}`, v);
  for (const [l, v] of Object.entries(bN1.actif)) set("BILAN", `D${l}`, v);
  for (const [l, v] of Object.entries(bN.passif)) set("BILAN", `H${l}`, v);
  for (const [l, v] of Object.entries(bN1.passif)) set("BILAN", `I${l}`, v);

  // Compte de résultat N et N-1
  const cN = compteResultatSmt(recettesDepenses(donnees, a), etats.n, etats.n1);
  const cN1 = compteResultatSmt(recettesDepenses(donnees, a - 1), etats.n1, { actif: etats.n1.actif, passif: etats.n1.passif });
  for (const [l, v] of Object.entries(cN)) set("COMPTE DE RESULTAT", `H${l}`, v);
  for (const [l, v] of Object.entries(cN1)) set("COMPTE DE RESULTAT", `I${l}`, v);
  return out;
};
