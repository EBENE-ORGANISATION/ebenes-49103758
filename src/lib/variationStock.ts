// Stock au bilan — inventaire intermittent SYSCOHADA, module pur. Décision du
// 9 octobre 2026 : en fin de mois, une écriture ajuste les comptes de stock
// (31 marchandises, 32 matières, 33 autres approvisionnements) à la valeur du
// stock, contre la variation de stock (6031, 6032, 6033). Les achats restent
// passés en charges (601, 602, 604) au moment de l'achat.
import type { Article, EcritureComptable, LigneEcriture, MouvementStock, NatureArticle } from "@/types/ebene";
import { ecartAjustement } from "@/lib/stock";
import { isoLocal } from "@/lib/ebene-utils";

export const COMPTES_STOCK: Record<NatureArticle, { stock: string; variation: string; libelle: string }> = {
  marchandise: { stock: "311", variation: "6031", libelle: "Marchandises" },
  matiere: { stock: "321", variation: "6032", libelle: "Matières premières et fournitures liées" },
  consommable: { stock: "331", variation: "6033", libelle: "Matières et fournitures consommables" },
};

export const NATURES_ARTICLE: { value: NatureArticle; label: string }[] = [
  { value: "marchandise", label: "Marchandise (revendue en l'état) — 31" },
  { value: "matiere", label: "Matière première, denrée — 32" },
  { value: "consommable", label: "Consommable (entretien, accueil…) — 33" },
];

/** Pièce de l'écriture de stock d'un mois : « INV-2026-10 ». */
export const pieceInventaire = (annee: number, mois: number) => `INV-${annee}-${String(mois).padStart(2, "0")}`;

const finDeMois = (annee: number, mois: number) => isoLocal(new Date(annee, mois, 0));

/**
 * Quantité en stock à une date : stock actuel, moins les entrées postérieures,
 * plus les sorties postérieures, moins les écarts d'ajustement postérieurs.
 */
export const quantiteALaDate = (
  article: Pick<Article, "id" | "stock">,
  mouvements: Pick<MouvementStock, "articleId" | "date" | "type" | "quantite" | "motif">[],
  date: string,
): number =>
  mouvements
    .filter((m) => m.articleId === article.id && m.date > date)
    .reduce((q, m) => {
      if (m.type === "entree") return q - m.quantite;
      if (m.type === "sortie") return q + m.quantite;
      return q - (ecartAjustement(m.motif) ?? 0);
    }, article.stock);

type EcritureGeneree = Omit<EcritureComptable, "id">;

/**
 * Écritures de stock du mois, une par activité : pour chaque nature d'article,
 * l'écart entre la valeur du stock en fin de mois (quantité × coût moyen
 * actuel) et le solde du compte de stock à cette date. L'écriture du même
 * mois déjà passée est ignorée : elle est remplacée.
 */
export const ecrituresVariationStock = (
  articles: Pick<Article, "id" | "stock" | "prixAchat" | "nature" | "activiteId">[],
  mouvements: Pick<MouvementStock, "articleId" | "date" | "type" | "quantite" | "motif">[],
  ecritures: Pick<EcritureComptable, "numeroPiece" | "statut" | "lignes" | "date" | "annee" | "mois" | "activiteId">[],
  annee: number,
  mois: number,
): EcritureGeneree[] => {
  const date = finDeMois(annee, mois);
  const piece = pieceInventaire(annee, mois);
  const cle = (activiteId: string | null | undefined, nature: NatureArticle) => `${activiteId ?? ""}|${nature}`;

  // Valeur du stock en fin de mois par activité et nature
  const valeurs = new Map<string, number>();
  for (const a of articles) {
    const nature = a.nature ?? "marchandise";
    const v = Math.max(0, quantiteALaDate(a, mouvements, date)) * (a.prixAchat || 0);
    valeurs.set(cle(a.activiteId, nature), (valeurs.get(cle(a.activiteId, nature)) ?? 0) + v);
  }
  // Solde des comptes de stock à la même date (hors écriture du mois remplacée)
  const soldes = new Map<string, number>();
  for (const e of ecritures) {
    if (e.statut === "brouillon" || e.numeroPiece === piece) continue;
    const d = e.date ?? (e.annee && e.mois ? finDeMois(e.annee, e.mois) : "");
    if (!d || d > date) continue;
    for (const l of e.lignes ?? []) {
      const nature = (Object.keys(COMPTES_STOCK) as NatureArticle[]).find((n) => l.compte.startsWith(COMPTES_STOCK[n].stock.slice(0, 2)));
      if (!nature) continue;
      const k = cle(e.activiteId, nature);
      soldes.set(k, (soldes.get(k) ?? 0) + l.debit - l.credit);
      if (!valeurs.has(k)) valeurs.set(k, 0);
    }
  }

  // Une écriture par activité
  const parActivite = new Map<string, LigneEcriture[]>();
  for (const [k, valeur] of valeurs) {
    const [activite, nature] = k.split("|") as [string, NatureArticle];
    const ecart = Math.round(valeur - (soldes.get(k) ?? 0));
    if (!ecart) continue;
    const c = COMPTES_STOCK[nature];
    const lignes = parActivite.get(activite) ?? [];
    lignes.push(
      { id: 0, compte: c.stock, intitule: c.libelle, debit: Math.max(0, ecart), credit: Math.max(0, -ecart) },
      { id: 0, compte: c.variation, intitule: `Variation des stocks — ${c.libelle.toLowerCase()}`, debit: Math.max(0, -ecart), credit: Math.max(0, ecart) },
    );
    parActivite.set(activite, lignes);
  }
  return [...parActivite].map(([activite, lignes]) => ({
    journal: "OD",
    numeroPiece: piece,
    libelle: `Stock au ${date.split("-").reverse().join("/")} (inventaire)`,
    lignes: lignes.map((l, i) => ({ ...l, id: i + 1 })),
    statut: "valide",
    activiteId: activite || null,
    date,
    annee,
    mois,
  }));
};
