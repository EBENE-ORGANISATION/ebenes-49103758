// Écritures d'une facture de vente (constatation, règlement) et leur contre-passation — module pur.
//
// Décision du 10 octobre 2026 : la vente est comptabilisée à la validation de
// la facture (journal VE), le règlement au paiement (journal BQ ou CA). La TVA
// suit la règle d'exigibilité : due dès la facture pour les ventes de
// marchandises (4431), à l'encaissement pour les prestations de services (en
// attente en 4438 jusqu'au paiement, puis virée en 4432).
import type { EcritureComptable, Facture, LigneEcriture } from "@/types/ebene";
import type { CompteTresorerie } from "@/lib/ecrituresTresorerie";

type EcritureGeneree = Omit<EcritureComptable, "id">;

/** TVA facturée sur prestations de services, non encore exigible (en attente de l'encaissement). */
export const COMPTE_TVA_ATTENTE = "4438";
export const INTITULE_TVA_ATTENTE = "TVA facturée en attente d'encaissement";

type FactureComptable = Pick<Facture, "id" | "numero" | "client" | "date" | "activite" | "avecTva" | "totalHT" | "totalTva" | "totalTtc"> &
  Partial<Pick<Facture, "lignes" | "taxeSejour">>;

/** Pièce de l'écriture de vente d'une facture. */
export const pieceVente = (numero: string) => `VE-${numero}`;
/** Pièce du virement de la TVA sur services devenue exigible au paiement. */
export const pieceTvaEncaissee = (numero: string) => `TVA-${numero}`;

/**
 * Ventilation d'une facture : produits HT par compte (articles du stock en
 * 701, le reste en 701 ou 706 selon l'activité ; réduction au prorata), TVA
 * sur marchandises et TVA sur services, montant dû par le client.
 */
export const ventilationFacture = (f: FactureComptable) => {
  const compteVente = f.activite === "commerce" ? "701" : "706";
  const lignes = f.lignes ?? [];
  const sousTotal = lignes.reduce((s, l) => s + (l.montant || 0), 0);
  const marchandises = lignes.filter((l) => l.articleId).reduce((s, l) => s + (l.montant || 0), 0);
  const ht = Math.round(f.totalHT);
  const ht701 = compteVente === "701" ? ht : sousTotal > 0 ? Math.round((ht * marchandises) / sousTotal) : 0;
  const htServices = ht - ht701;
  const tva = f.avecTva ? Math.round(f.totalTva) : 0;
  const tvaBiens = ht > 0 ? Math.round((tva * ht701) / ht) : 0;
  const tvaServices = tva - tvaBiens;
  const taxeSejour = Math.max(0, Math.round(f.taxeSejour ?? 0));
  // Montant dû par le client = HT + TVA arrondis : les écritures sont toujours équilibrées
  const montantRegle = ht + tva + taxeSejour;
  return { ht701, htServices, tvaBiens, tvaServices, taxeSejour, montantRegle, produits: produitsParActivite(f, ht701, htServices) };
};

/** Produit HT d'une facture pour un compte (701 / 706) et une activité (null : celle du document). */
export interface ProduitActivite { compte: "701" | "706"; activiteId: string | null; montant: number }

/**
 * Répartit les produits HT de chaque compte entre les activités des lignes,
 * au prorata de leurs montants (la réduction s'y répartit donc aussi). Les
 * arrondis vont aux plus grands restes : la somme égale exactement le total du compte.
 */
const produitsParActivite = (f: FactureComptable, ht701: number, htServices: number): ProduitActivite[] => {
  const tout701 = f.activite === "commerce";
  const poids = new Map<string, { compte: "701" | "706"; activiteId: string | null; brut: number }>();
  for (const l of f.lignes ?? []) {
    const compte: "701" | "706" = tout701 || l.articleId ? "701" : "706";
    const activiteId = l.activiteId ?? null;
    const cle = `${compte}|${activiteId ?? ""}`;
    const p = poids.get(cle) ?? { compte, activiteId, brut: 0 };
    p.brut += l.montant || 0;
    poids.set(cle, p);
  }
  const out: ProduitActivite[] = [];
  for (const [compte, total] of [["706", htServices], ["701", ht701]] as ["701" | "706", number][]) {
    if (total <= 0) continue;
    const parts = [...poids.values()].filter((p) => p.compte === compte && p.brut > 0);
    const somme = parts.reduce((s, p) => s + p.brut, 0);
    if (parts.length === 0 || somme <= 0) {
      out.push({ compte, activiteId: null, montant: total });
      continue;
    }
    const exacts = parts.map((p) => (total * p.brut) / somme);
    const montants = exacts.map(Math.floor);
    let reste = total - montants.reduce((s, m) => s + m, 0);
    exacts
      .map((x, i) => ({ i, r: x - Math.floor(x) }))
      .sort((a, b) => b.r - a.r)
      .forEach(({ i }) => { if (reste > 0) { montants[i] += 1; reste -= 1; } });
    parts.forEach((p, i) => { if (montants[i] > 0) out.push({ compte, activiteId: p.activiteId, montant: montants[i] }); });
  }
  return out;
};

/**
 * Écriture de vente, à la validation de la facture (VE, datée de la facture) :
 * Client 4111 / Produits HT / TVA sur marchandises 4431 / TVA sur services en
 * attente 4438 / taxe de séjour 442.
 */
export const ecritureVenteFacture = (f: FactureComptable, annee: number, mois: number, activiteId: string | null): EcritureGeneree => {
  const v = ventilationFacture(f);
  const libelle = (compte: string) => (compte === "701" ? "Ventes de marchandises" : "Services vendus");
  // Facture multi-activités : une ligne de produit par compte et par activité, chacune
  // portant son activité ; sinon une ligne par compte, rattachée à l'activité de l'écriture.
  const multi = v.produits.some((p) => p.activiteId !== null);
  const produits = new Map<string, { compte: string; activiteId: string | null; montant: number }>();
  for (const p of v.produits) {
    const aid = p.activiteId ?? activiteId;
    const cle = `${p.compte}|${aid ?? ""}`;
    const x = produits.get(cle) ?? { compte: p.compte, activiteId: aid, montant: 0 };
    x.montant += p.montant;
    produits.set(cle, x);
  }
  const lignes: LigneEcriture[] = [
    { id: 0, compte: "4111", intitule: "Clients", debit: v.montantRegle, credit: 0, tiers: f.client },
    ...[...produits.values()].map((p) => ({
      id: 0, compte: p.compte, intitule: libelle(p.compte), debit: 0, credit: p.montant, tiers: f.client,
      ...(multi ? { activiteId: p.activiteId } : {}),
    })),
    ...(v.tvaBiens > 0 ? [{ id: 0, compte: "4431", intitule: "TVA facturée sur ventes", debit: 0, credit: v.tvaBiens }] : []),
    ...(v.tvaServices > 0 ? [{ id: 0, compte: COMPTE_TVA_ATTENTE, intitule: INTITULE_TVA_ATTENTE, debit: 0, credit: v.tvaServices }] : []),
    ...(v.taxeSejour > 0 ? [{ id: 0, compte: "442", intitule: "Taxe de séjour collectée", debit: 0, credit: v.taxeSejour }] : []),
  ].map((l, i) => ({ ...l, id: i + 1 }));
  return {
    statut: "valide", factureId: f.id, activiteId, date: f.date, annee, mois,
    journal: "VE", numeroPiece: pieceVente(f.numero), libelle: `Facture ${f.numero} — ${f.client}`, lignes,
  };
};

/**
 * Écritures du paiement, datées du règlement :
 *  - BQ ou CA : Banque 521 ou Caisse 571 / Client 4111 (montant dû) ;
 *  - OD : la TVA sur services devient exigible, 4438 → 4432. La ligne 4432
 *    porte la base HT encaissée (`base`), reprise par la déclaration de TVA.
 */
export const ecrituresReglementFacture = (
  f: FactureComptable,
  compteTresorerie: CompteTresorerie,
  date: string,
  annee: number,
  mois: number,
  activiteId: string | null,
): EcritureGeneree[] => {
  const v = ventilationFacture(f);
  const estBanque = compteTresorerie === "521";
  const journal = estBanque ? "BQ" : "CA";
  const commun = { statut: "valide" as const, factureId: f.id, activiteId, date, annee, mois };
  const out: EcritureGeneree[] = [{
    ...commun,
    journal,
    numeroPiece: `${journal}-${f.numero}`,
    libelle: `Règlement facture ${f.numero} — ${f.client}`,
    lignes: [
      { id: 1, compte: compteTresorerie, intitule: estBanque ? "Banques" : "Caisse", debit: v.montantRegle, credit: 0 },
      { id: 2, compte: "4111", intitule: "Clients", debit: 0, credit: v.montantRegle, tiers: f.client },
    ],
  }];
  if (v.tvaServices > 0) {
    out.push({
      ...commun,
      journal: "OD",
      numeroPiece: pieceTvaEncaissee(f.numero),
      libelle: `TVA exigible à l'encaissement — facture ${f.numero}`,
      lignes: [
        { id: 1, compte: COMPTE_TVA_ATTENTE, intitule: INTITULE_TVA_ATTENTE, debit: v.tvaServices, credit: 0 },
        { id: 2, compte: "4432", intitule: "TVA facturée sur prestations de services", debit: 0, credit: v.tvaServices, base: v.htServices },
      ],
    });
  }
  return out;
};

/**
 * Facture validée et payée en une fois (anciennes factures sans écriture de
 * vente, restauration depuis la corbeille) : vente puis règlement, à la date
 * de la facture.
 */
export const ecrituresFacturePayee = (
  f: FactureComptable,
  compteTresorerie: CompteTresorerie,
  annee: number,
  mois: number,
  activiteId: string | null,
): EcritureGeneree[] => [
  ecritureVenteFacture(f, annee, mois, activiteId),
  ...ecrituresReglementFacture(f, compteTresorerie, f.date, annee, mois, activiteId),
];

/** La facture a déjà son écriture de vente (validée, non contre-passée). */
export const aEcritureVente = (
  ecritures: Pick<EcritureComptable, "factureId" | "journal" | "numeroPiece" | "statut">[],
  f: Pick<Facture, "id" | "numero">,
): boolean => ecritures.some((e) => e.factureId === f.id && e.journal === "VE" && e.numeroPiece === pieceVente(f.numero));

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
  lignes: e.lignes.map((l) => ({ ...l, debit: l.credit, credit: l.debit, ...(l.base ? { base: -l.base } : {}) })),
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
