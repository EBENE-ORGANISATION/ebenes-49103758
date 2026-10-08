// États financiers SYSCOHADA (compte de résultat, bilan) — calculs purs, testables.
import type { DonneesMensuelles } from "@/types/ebene";

/** Solde de chaque compte (débit − crédit) sur les écritures non brouillon de l'exercice. */
export const soldesExercice = (donneesMensuelles: DonneesMensuelles, annee: number): Map<string, number> => {
  const soldes = new Map<string, number>();
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
