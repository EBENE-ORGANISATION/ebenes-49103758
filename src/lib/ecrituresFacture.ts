// Écritures d'une facture de vente payée, et leur contre-passation — module pur.
import type { EcritureComptable, Facture, LigneEcriture } from "@/types/ebene";
import type { CompteTresorerie } from "@/lib/ecrituresTresorerie";

type EcritureGeneree = Omit<EcritureComptable, "id">;

/**
 * Écritures d'une facture payée (validées, liées à la facture) :
 *  - VE : Client 4111 / Produit 701 ou 706 (HT) / TVA 4431 si « avec TVA » ;
 *  - BQ ou CA : Banque 521 ou Caisse 571 / Client 4111 (montant réglé).
 */
export const ecrituresFacturePayee = (
  f: Pick<Facture, "id" | "numero" | "client" | "date" | "activite" | "avecTva" | "totalHT" | "totalTva" | "totalTtc">,
  compteTresorerie: CompteTresorerie,
  annee: number,
  mois: number,
  activiteId: string | null,
): EcritureGeneree[] => {
  const compteVente = f.activite === "commerce" ? "701" : "706";
  const libelleVente = f.activite === "commerce" ? "Ventes de marchandises" : "Services vendus";
  const montantRegle = Math.round(f.avecTva ? f.totalTtc : f.totalHT);

  const lignesVente: LigneEcriture[] = f.avecTva
    ? [
        { id: 1, compte: "4111", intitule: "Clients", debit: Math.round(f.totalTtc), credit: 0, tiers: f.client },
        { id: 2, compte: compteVente, intitule: libelleVente, debit: 0, credit: Math.round(f.totalHT), tiers: f.client },
        { id: 3, compte: "4431", intitule: "TVA facturée sur ventes", debit: 0, credit: Math.round(f.totalTva) },
      ]
    : [
        { id: 1, compte: "4111", intitule: "Clients", debit: Math.round(f.totalHT), credit: 0, tiers: f.client },
        { id: 2, compte: compteVente, intitule: libelleVente, debit: 0, credit: Math.round(f.totalHT), tiers: f.client },
      ];

  const estBanque = compteTresorerie === "521";
  const journal = estBanque ? "BQ" : "CA";
  const commun = { statut: "valide" as const, factureId: f.id, activiteId, date: f.date, annee, mois };

  return [
    {
      ...commun,
      journal: "VE",
      numeroPiece: `VE-${f.numero}`,
      libelle: `Facture ${f.numero} — ${f.client}`,
      lignes: lignesVente,
    },
    {
      ...commun,
      journal,
      numeroPiece: `${journal}-${f.numero}`,
      libelle: `Règlement facture ${f.numero} — ${f.client}`,
      lignes: [
        { id: 1, compte: compteTresorerie, intitule: estBanque ? "Banques" : "Caisse", debit: montantRegle, credit: 0 },
        { id: 2, compte: "4111", intitule: "Clients", debit: 0, credit: montantRegle, tiers: f.client },
      ],
    },
  ];
};

/**
 * Contre-passation d'une écriture : mêmes comptes, débit et crédit inversés,
 * à la date de l'annulation. L'écriture d'origine est conservée.
 */
export const contrePassation = (
  e: Pick<EcritureComptable, "journal" | "numeroPiece" | "libelle" | "lignes" | "factureId" | "activiteId">,
  date: string,
  annee: number,
  mois: number,
): EcritureGeneree => ({
  journal: e.journal,
  numeroPiece: `AN-${e.numeroPiece}`,
  libelle: `Annulation — ${e.libelle}`,
  lignes: e.lignes.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
  statut: "valide",
  factureId: e.factureId ?? null,
  activiteId: e.activiteId ?? null,
  date,
  annee,
  mois,
});

/** Écriture déjà contre-passée (ou elle-même une contre-passation). */
export const estContrePassation = (e: Pick<EcritureComptable, "numeroPiece">): boolean =>
  e.numeroPiece.startsWith("AN-");
