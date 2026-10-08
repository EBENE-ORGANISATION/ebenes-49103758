// Écritures générées pour les recettes / dépenses saisies en trésorerie — module pur.
import type { EcritureComptable, LigneEcriture, Transaction } from "@/types/ebene";
import { getCompte } from "@/lib/planComptable";

export type CompteTresorerie = "521" | "571";

/** Comptes proposés dans le formulaire de trésorerie (plan SYSCOHADA de l'application). */
export const COMPTES_DEPENSE = ["6222", "6052", "6051", "6055", "6056", "624", "6281", "618", "625", "6324", "631", "6412", "6057", "658"] as const;
export const COMPTES_RECETTE = ["706", "707", "758"] as const;
export const COMPTE_DEPENSE_DEFAUT = "6057";
export const COMPTE_RECETTE_DEFAUT = "706";

export const intituleCompte = (code: string): string => getCompte(code)?.intitule ?? code;

/** Référence des écritures générées depuis une transaction de trésorerie. */
export const pieceTresorerie = (transactionId: number) => `TR-${transactionId}`;
export const pieceAchat = (transactionId: number) => `AC-${transactionId}`;

/** Écriture générée depuis une transaction (achat AC-n ou mouvement de trésorerie TR-n). */
export const estEcritureDeTransaction = (e: Pick<EcritureComptable, "numeroPiece">, transactionId?: number): boolean =>
  transactionId === undefined
    ? /^(TR|AC)-\d+$/.test(e.numeroPiece)
    : e.numeroPiece === pieceTresorerie(transactionId) || e.numeroPiece === pieceAchat(transactionId);

/**
 * Écriture à ajouter aux totaux de trésorerie (comptes 52/57) en plus des
 * transactions : validée, ni liée à une facture, ni générée depuis une
 * transaction — sinon le même encaissement serait compté deux fois.
 */
export const ecritureTresorerieAutonome = (e: Pick<EcritureComptable, "statut" | "factureId" | "numeroPiece">): boolean =>
  e.statut !== "brouillon" && !e.factureId && !/^TR-\d+$/.test(e.numeroPiece);

type EcritureGeneree = Omit<EcritureComptable, "id">;

/**
 * Écritures d'une recette ou dépense de trésorerie (brouillon : validées avec
 * la transaction). Rien pour les sources facture et salaires, qui ont leurs
 * propres écritures.
 *  - Recette : Banque/Caisse au débit, produit au crédit.
 *  - Dépense : charge au débit, Banque/Caisse au crédit.
 *  - Dépense fournisseur : achat AC (charge HT + TVA déductible / 4011 TTC)
 *    puis règlement TR (4011 / Banque ou Caisse).
 */
export const ecrituresDeTransaction = (
  t: Pick<Transaction, "type" | "m" | "desc" | "date" | "source" | "fournisseur" | "avecTva" | "activiteId"> & {
    compte?: string;
    tresorerie?: CompteTresorerie;
  },
  transactionId: number,
  tauxTva: number,
  annee: number,
  mois: number,
): EcritureGeneree[] => {
  if (t.source === "facture" || t.source === "salaires") return [];
  const montant = Math.round(Math.abs(t.m));
  if (!montant) return [];
  const treso = t.tresorerie ?? "521";
  const journal = treso === "571" ? "CA" : "BQ";
  const ligneTreso = (debit: number, credit: number): LigneEcriture => ({
    id: 0, compte: treso, intitule: intituleCompte(treso), debit, credit,
  });
  const commun = {
    statut: "brouillon" as const,
    activiteId: t.activiteId ?? null,
    date: t.date,
    annee,
    mois,
  };
  const numeroter = (lignes: LigneEcriture[]) => lignes.map((l, i) => ({ ...l, id: i + 1 }));

  if (t.type === "r") {
    const compte = t.compte || COMPTE_RECETTE_DEFAUT;
    return [{
      ...commun,
      journal,
      numeroPiece: pieceTresorerie(transactionId),
      libelle: t.desc,
      lignes: numeroter([
        ligneTreso(montant, 0),
        { id: 0, compte, intitule: intituleCompte(compte), debit: 0, credit: montant },
      ]),
    }];
  }

  const compte = t.compte || COMPTE_DEPENSE_DEFAUT;
  if (t.source === "fournisseur" && t.fournisseur) {
    // Facture d'achat avec TVA (par défaut) : TTC = HT × (1 + taux du mois)
    const avecTva = t.avecTva !== false;
    const ht = avecTva ? Math.round(montant / (1 + tauxTva)) : montant;
    const tva = montant - ht;
    return [
      {
        ...commun,
        journal: "AC",
        numeroPiece: pieceAchat(transactionId),
        libelle: t.desc || `Achat — ${t.fournisseur}`,
        lignes: numeroter([
          { id: 0, compte, intitule: intituleCompte(compte), debit: ht, credit: 0, tiers: t.fournisseur },
          ...(tva > 0 ? [{ id: 0, compte: "4452", intitule: "TVA récupérable sur achats", debit: tva, credit: 0 }] : []),
          { id: 0, compte: "4011", intitule: "Fournisseurs", debit: 0, credit: montant, tiers: t.fournisseur },
        ]),
      },
      {
        ...commun,
        journal,
        numeroPiece: pieceTresorerie(transactionId),
        libelle: `Règlement — ${t.fournisseur}`,
        lignes: numeroter([
          { id: 0, compte: "4011", intitule: "Fournisseurs", debit: montant, credit: 0, tiers: t.fournisseur },
          ligneTreso(0, montant),
        ]),
      },
    ];
  }

  return [{
    ...commun,
    journal,
    numeroPiece: pieceTresorerie(transactionId),
    libelle: t.desc,
    lignes: numeroter([
      { id: 0, compte, intitule: intituleCompte(compte), debit: montant, credit: 0 },
      ligneTreso(0, montant),
    ]),
  }];
};

/** Contrepartie de l'acquisition d'une immobilisation. */
export type ReglementImmo = "521" | "571" | "481";

export const pieceImmobilisation = (immoId: number) => `IM-${immoId}`;

/**
 * Écriture d'acquisition d'une immobilisation (brouillon, à valider) :
 * compte d'immobilisation au débit, Banque / Caisse / fournisseur
 * d'investissements (481) au crédit, à la date d'acquisition.
 */
export const ecritureAcquisitionImmo = (
  immo: { libelle: string; valeurOrigine: number; dateAcquisition: string; compteActif: string; activiteId?: string | null },
  immoId: number,
  reglement: ReglementImmo,
): EcritureGeneree => {
  const [annee, mois] = immo.dateAcquisition.split("-").map(Number);
  const montant = Math.round(immo.valeurOrigine);
  const intituleReglement = reglement === "481" ? "Fournisseurs d'investissements" : intituleCompte(reglement);
  return {
    journal: reglement === "521" ? "BQ" : reglement === "571" ? "CA" : "OD",
    numeroPiece: pieceImmobilisation(immoId),
    libelle: `Acquisition — ${immo.libelle}`,
    lignes: [
      { id: 1, compte: immo.compteActif, intitule: intituleCompte(immo.compteActif), debit: montant, credit: 0 },
      { id: 2, compte: reglement, intitule: intituleReglement, debit: 0, credit: montant },
    ],
    statut: "brouillon",
    activiteId: immo.activiteId ?? null,
    date: immo.dateAcquisition,
    annee,
    mois,
  };
};
