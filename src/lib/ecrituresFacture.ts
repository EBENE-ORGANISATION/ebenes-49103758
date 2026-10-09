// Écritures d'une facture de vente payée, et leur contre-passation — module pur.
import type { EcritureComptable, Facture, LigneEcriture } from "@/types/ebene";
import type { CompteTresorerie } from "@/lib/ecrituresTresorerie";

type EcritureGeneree = Omit<EcritureComptable, "id">;

/**
 * Écritures d'une facture payée (validées, liées à la facture) :
 *  - VE : Client 4111 / Produit (HT) / TVA 4431 si « avec TVA ». Les lignes
 *    d'articles du stock vont en 701 (ventes de marchandises), les autres en
 *    701 ou 706 selon l'activité de la facture ; la réduction est répartie
 *    au prorata ;
 *    La taxe de séjour éventuelle (hors TVA) est collectée en 442 ;
 *  - BQ ou CA : Banque 521 ou Caisse 571 / Client 4111 (montant réglé).
 */
export const ecrituresFacturePayee = (
  f: Pick<Facture, "id" | "numero" | "client" | "date" | "activite" | "avecTva" | "totalHT" | "totalTva" | "totalTtc"> &
    Partial<Pick<Facture, "lignes" | "taxeSejour">>,
  compteTresorerie: CompteTresorerie,
  annee: number,
  mois: number,
  activiteId: string | null,
): EcritureGeneree[] => {
  const compteVente = f.activite === "commerce" ? "701" : "706";
  const libelle = (compte: string) => (compte === "701" ? "Ventes de marchandises" : "Services vendus");

  // Produits HT par compte : articles du stock en 701, le reste selon l'activité
  const lignes = f.lignes ?? [];
  const sousTotal = lignes.reduce((s, l) => s + (l.montant || 0), 0);
  const marchandises = lignes.filter((l) => l.articleId).reduce((s, l) => s + (l.montant || 0), 0);
  const ht = Math.round(f.totalHT);
  // Montant dû par le client = HT + TVA arrondis : l'écriture est toujours équilibrée
  const taxeSejour = Math.max(0, Math.round(f.taxeSejour ?? 0));
  const montantRegle = ht + (f.avecTva ? Math.round(f.totalTva) : 0) + taxeSejour;
  const ht701 = compteVente === "701" ? ht : sousTotal > 0 ? Math.round((ht * marchandises) / sousTotal) : 0;
  const produits = (
    [[compteVente === "701" ? "701" : "706", ht - ht701], ["701", ht701]] as [string, number][]
  )
    .reduce<[string, number][]>((acc, [c, m]) => {
      const i = acc.findIndex(([x]) => x === c);
      if (i >= 0) acc[i][1] += m; else acc.push([c, m]);
      return acc;
    }, [])
    .filter(([, m]) => m > 0);

  const lignesVente: LigneEcriture[] = [
    { id: 0, compte: "4111", intitule: "Clients", debit: montantRegle, credit: 0, tiers: f.client },
    ...produits.map(([compte, m]) => ({ id: 0, compte, intitule: libelle(compte), debit: 0, credit: m, tiers: f.client })),
    ...(f.avecTva ? [{ id: 0, compte: "4431", intitule: "TVA facturée sur ventes", debit: 0, credit: Math.round(f.totalTva) }] : []),
    ...(taxeSejour > 0 ? [{ id: 0, compte: "442", intitule: "Taxe de séjour collectée", debit: 0, credit: taxeSejour }] : []),
  ].map((l, i) => ({ ...l, id: i + 1 }));

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
