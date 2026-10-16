// États financiers SYSCOHADA (compte de résultat, bilan) — calculs purs, testables.
import type { DonneesMensuelles } from "@/types/ebene";
import { COMPTE_TVA_ATTENTE } from "@/lib/ecrituresFacture";
import { ouvertureProvisoire } from "@/lib/soldesComptables";

/** Solde de chaque compte (débit − crédit) sur les écritures non brouillon de l'exercice. */
export const soldesExercice = (donneesMensuelles: DonneesMensuelles, annee: number): Map<string, number> => {
  // Exercice précédent pas encore clôturé : à-nouveaux provisoires (comptes de bilan, résultat en 12)
  const soldes = new Map<string, number>(ouvertureProvisoire(donneesMensuelles, annee));
  Object.entries(donneesMensuelles).forEach(([key, moisData]) => {
    const [a] = key.split("-");
    if (parseInt(a) !== annee) return;
    (moisData.ecritures || [])
      .filter((e) => e.statut !== "brouillon")
      .forEach((ecriture) => {
        (Array.isArray(ecriture.lignes) ? ecriture.lignes : []).forEach((ligne) => {
          soldes.set(ligne.compte, (soldes.get(ligne.compte) || 0) + ligne.debit - ligne.credit);
        });
      });
  });
  return soldes;
};

/** Somme des soldes des comptes commençant par l'un des préfixes (chaque compte compté une fois). */
export const sommePrefixes = (soldes: Map<string, number>, prefixes: string[]): number => {
  let total = 0;
  soldes.forEach((val, code) => {
    if (prefixes.some((p) => code.startsWith(p))) total += val;
  });
  return total;
};

/**
 * Résultat de l'exercice en cours : produits − charges (classes 6, 7 et 8).
 * Avec la convention débit − crédit, c'est l'opposé de la somme des soldes.
 * Le compte 13 n'est alimenté qu'à la clôture : avant, le bilan doit
 * reprendre ce résultat, sinon il est déséquilibré du montant du résultat.
 */
export const resultatExercice = (soldes: Map<string, number>): number =>
  -sommePrefixes(soldes, ["6", "7", "8"]);

/** Soldes intermédiaires de gestion et résultat net (format SYSCOHADA révisé). */
export const compteResultat = (soldes: Map<string, number>) => {
  const get = (prefixes: string[]) => sommePrefixes(soldes, prefixes);

  // Produits : solde créditeur, négatif en débit − crédit → on inverse.
  const ventesMarchandises = 0 - get(["701"]);
  const achatsMarchandises = get(["601"]);
  const variationStockMarchandises = get(["6031"]);
  const margeCommerciale = ventesMarchandises - achatsMarchandises - variationStockMarchandises;

  const ventesProduitsFabriques = 0 - get(["702", "703", "704"]);
  const travauxServicesVendus = 0 - get(["705", "706"]);
  const produitsAccessoires = 0 - get(["707"]);
  const chiffreAffaires = ventesMarchandises + ventesProduitsFabriques + travauxServicesVendus + produitsAccessoires;

  const productionStockee = 0 - get(["734", "735", "736", "737"]);
  const productionImmobilisee = 0 - get(["72"]);
  const subventionExploitation = 0 - get(["71"]);
  const autresProduits = 0 - get(["75"]);
  const transfertsCharges = 0 - get(["781"]);

  const achatsMatieres = get(["602"]);
  const variationStockMatieres = get(["6032", "6033"]);
  const autresAchats = get(["604", "605", "608"]);
  const transports = get(["61"]);
  const servicesExterieurs = get(["62", "63"]);
  const impotsTaxes = get(["64"]);
  const autresCharges = get(["65"]);

  // XC part du chiffre d'affaires (et non de la seule marge commerciale) :
  // sans quoi les ventes de services (706) n'entrent jamais dans le résultat.
  const valeurAjoutee =
    chiffreAffaires - achatsMarchandises - variationStockMarchandises
    + productionStockee + productionImmobilisee + subventionExploitation
    + autresProduits + transfertsCharges
    - achatsMatieres - variationStockMatieres - autresAchats
    - transports - servicesExterieurs - impotsTaxes - autresCharges;

  const chargesPersonnel = get(["66"]);
  const excedentBrutExploitation = valeurAjoutee - chargesPersonnel;

  // Exploitation : reprises 791/798/799, dotations 681/691 ; financier : 797 et 697.
  const reprisesAmortProv = 0 - get(["791", "798", "799"]);
  const dotationsAmortProv = get(["681", "691"]);
  const resultatExploitation = excedentBrutExploitation + reprisesAmortProv - dotationsAmortProv;

  const revenusFinanciers = 0 - get(["77"]);
  const reprisesProvFinancieres = 0 - get(["797"]);
  const transfertsChargesFinancieres = 0 - get(["787"]);
  const fraisFinanciers = get(["67"]);
  const dotationsProvFinancieres = get(["687", "697"]);
  const resultatFinancier =
    revenusFinanciers + reprisesProvFinancieres + transfertsChargesFinancieres
    - fraisFinanciers - dotationsProvFinancieres;

  const resultatActivitesOrdinaires = resultatExploitation + resultatFinancier;

  const produitsCessions = 0 - get(["82"]);
  const autresProduitsHAO = 0 - get(["84", "86", "88"]);
  const valeurComptableCessions = get(["81"]);
  const autresChargesHAO = get(["83", "85"]);
  const resultatHAO = produitsCessions + autresProduitsHAO - valeurComptableCessions - autresChargesHAO;

  const participationTravailleurs = get(["87"]);
  const impotResultat = get(["89"]);
  const resultatNet = resultatActivitesOrdinaires + resultatHAO - participationTravailleurs - impotResultat;

  return {
    ventesMarchandises, achatsMarchandises, variationStockMarchandises, margeCommerciale,
    ventesProduitsFabriques, travauxServicesVendus, produitsAccessoires, chiffreAffaires,
    productionStockee, productionImmobilisee, subventionExploitation, autresProduits, transfertsCharges,
    achatsMatieres, variationStockMatieres, autresAchats, transports, servicesExterieurs, impotsTaxes, autresCharges,
    valeurAjoutee, chargesPersonnel, excedentBrutExploitation,
    reprisesAmortProv, dotationsAmortProv, resultatExploitation,
    revenusFinanciers, fraisFinanciers, resultatFinancier, resultatActivitesOrdinaires,
    produitsCessions, autresProduitsHAO, valeurComptableCessions, autresChargesHAO, resultatHAO,
    participationTravailleurs, impotResultat, resultatNet,
  };
};

/**
 * Répartit les soldes entre des lignes d'états dont les préfixes se recoupent
 * (ex. « 10 » et « 109 », « 56 » et « 561 ») : chaque compte va dans la ligne
 * dont le préfixe correspondant est le plus long, jamais dans deux lignes.
 * Renvoie le total de chaque ligne (clé = référence de ligne).
 */
export const repartirSoldes = (
  soldes: Map<string, number>,
  lignes: { ref: string; prefixes: string[] }[],
): Record<string, number> => {
  const totaux: Record<string, number> = {};
  lignes.forEach((l) => { totaux[l.ref] = 0; });
  soldes.forEach((val, code) => {
    let meilleure: string | null = null;
    let longueur = 0;
    for (const l of lignes) {
      for (const p of l.prefixes) {
        if (code.startsWith(p) && p.length > longueur) {
          meilleure = l.ref;
          longueur = p.length;
        }
      }
    }
    if (meilleure) totaux[meilleure] += val;
  });
  return totaux;
};

/** Chiffres fiscaux d'une période, lus dans les écritures validées. */
export interface FiscalitePeriode {
  /** Chiffre d'affaires hors taxes (crédits nets des comptes 70). */
  caHT: number;
  /**
   * Base soumise à la TVA exigible sur la période (ligne L1 de la
   * déclaration) : ventes dont l'écriture porte de la TVA collectée exigible,
   * plus la base des prestations de services encaissées (TVA exigible à
   * l'encaissement, ligne de TVA portant sa base). Les prestations facturées
   * non encore encaissées n'y sont pas.
   */
  caTaxable: number;
  /** Ventes sans aucune TVA : hors champ ou exonérées (ligne L2). */
  caNonTaxable: number;
  /** Part commerce (701) et part service (autres 70x), pour la patente. */
  caCommerce: number;
  caService: number;
  /** TVA collectée exigible (crédits nets 443, hors TVA en attente 4438) et déductible (débits nets 445). */
  tvaCollectee: number;
  tvaDeductible: number;
  /** Résultat de la période : produits − charges (classes 6, 7, 8). */
  resultat: number;
}

/**
 * Liquidation ou règlement de la TVA d'une période (TVA collectée soldée au
 * débit contre la déductible, l'État 4441/4449 ou la banque). Elle solde la
 * déclaration et ne doit pas l'annuler : exclue du calcul de la TVA du mois.
 * Une contre-passation de TVA (4432 / 4438) n'en est pas une.
 */
export const estLiquidationTva = (lignes: { compte: string; debit: number; credit: number }[]): boolean => {
  const debitCollectee = lignes.some((l) => l.compte.startsWith("443") && !l.compte.startsWith(COMPTE_TVA_ATTENTE) && (l.debit || 0) > 0);
  const contrepartie = lignes.some((l) =>
    l.compte.startsWith("4441") || l.compte.startsWith("4449") || /^5[0-8]/.test(l.compte)
    || (l.compte.startsWith("445") && (l.credit || 0) > 0));
  const sansProduitNiCharge = !lignes.some((l) => /^[67]/.test(l.compte));
  return debitCollectee && contrepartie && sansProduitNiCharge;
};

export const fiscaliteDepuisEcritures = (
  ecritures: { statut: string; lignes?: { compte: string; debit: number; credit: number; base?: number }[] | null }[],
): FiscalitePeriode => {
  const soldes = new Map<string, number>();
  const validees = ecritures.filter((e) => e.statut !== "brouillon" && !estLiquidationTva(Array.isArray(e.lignes) ? e.lignes : []));
  validees.forEach((e) => (Array.isArray(e.lignes) ? e.lignes : []).forEach((l) => {
    soldes.set(l.compte, (soldes.get(l.compte) || 0) + (l.debit || 0) - (l.credit || 0));
  }));
  const enAttente = (c: string) => c.startsWith(COMPTE_TVA_ATTENTE);
  const exigible = (c: string) => c.startsWith("443") && !enAttente(c);
  let caTaxable = 0;
  let caNonTaxable = 0;
  for (const e of validees) {
    const lignes = Array.isArray(e.lignes) ? e.lignes : [];
    const produit = (prefixe: string) => lignes.filter((l) => l.compte.startsWith(prefixe)).reduce((s, l) => s + (l.credit || 0) - (l.debit || 0), 0);
    const avecExigible = lignes.some((l) => exigible(l.compte));
    const avecAttente = lignes.some((l) => enAttente(l.compte));
    // Prestations dont la TVA attend l'encaissement : seules les marchandises de la facture sont imposables
    if (avecAttente) { if (avecExigible) caTaxable += produit("701"); }
    else if (avecExigible) caTaxable += produit("70");
    else caNonTaxable += produit("70");
    caTaxable += lignes.filter((l) => exigible(l.compte) && l.base).reduce((s, l) => s + (l.base || 0), 0);
  }
  const caCommerce = 0 - sommePrefixes(soldes, ["701"]);
  const caHT = 0 - sommePrefixes(soldes, ["70"]);
  return {
    caHT,
    caTaxable,
    caNonTaxable,
    caCommerce,
    caService: caHT - caCommerce,
    tvaCollectee: 0 - sommePrefixes(soldes, ["443"]) + sommePrefixes(soldes, [COMPTE_TVA_ATTENTE]),
    tvaDeductible: sommePrefixes(soldes, ["445"]),
    resultat: resultatExercice(soldes),
  };
};

/**
 * Crédit de TVA reporté au début du mois (ligne L16 de la déclaration) :
 * déclarations des mois précédents enchaînées depuis le premier mois tenu en
 * comptabilité, chaque crédit s'imputant sur la TVA due du mois suivant.
 */
export const creditTvaReporte = (donnees: DonneesMensuelles, annee: number, mois: number): number => {
  const cle = (a: number, m: number) => a * 100 + m;
  const fin = cle(annee, mois);
  const periodes = Object.keys(donnees || {})
    .map((k) => k.split("-").map(Number) as [number, number])
    .filter(([a, m]) => cle(a, m) < fin)
    .sort(([a1, m1], [a2, m2]) => cle(a1, m1) - cle(a2, m2));
  let credit = 0;
  for (const [a, m] of periodes) {
    const ecritures = donnees[`${a}-${m}`]?.ecritures || [];
    if (!ecritures.some((e) => e.statut !== "brouillon")) continue;
    const f = fiscaliteDepuisEcritures(ecritures);
    credit = Math.max(0, credit + f.tvaDeductible - f.tvaCollectee);
  }
  return Math.round(credit);
};
