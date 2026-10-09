// Bilan d'ouverture et clôture d'exercice — module pur.
// La clôture de l'exercice N produit les à-nouveaux de N+1 (pièce AN-<N+1>,
// journal AN) : soldes des comptes de bilan à la clôture, et résultat de N
// affecté (réserve légale, réserves libres, dividendes, report à nouveau).
import type { DonneesMensuelles, EcritureComptable, LigneEcriture } from "@/types/ebene";
import { getCompte } from "@/lib/planComptable";
import { compteResultatLiasse, pieceANouveaux, soldesCloture } from "./etatsLiasse";

export interface Affectation {
  reserveLegale?: number;
  reservesLibres?: number;
  dividendes?: number;
}

type EcritureGeneree = Omit<EcritureComptable, "id">;

const intitule = (compte: string) => getCompte(compte)?.intitule ?? compte;
const numeroter = (lignes: LigneEcriture[]) => lignes.map((l, i) => ({ ...l, id: i + 1 }));

/** Résultat à affecter : résultat de N et résultats antérieurs non encore affectés. */
export const resultatAAffecter = (donnees: DonneesMensuelles, annee: number) => {
  const { gestion, reportImplicite } = soldesCloture(donnees, annee);
  const resultat = compteResultatLiasse(gestion).XI;
  return { resultat, reportImplicite, total: resultat + reportImplicite };
};

/** À-nouveaux de l'exercice suivant, à la clôture de `annee`. */
export const ecritureANouveaux = (donnees: DonneesMensuelles, annee: number, affectation: Affectation = {}): EcritureGeneree => {
  const { bilan } = soldesCloture(donnees, annee);
  const { total } = resultatAAffecter(donnees, annee);
  const lignes: LigneEcriture[] = [];
  [...bilan.entries()]
    .filter(([c, v]) => Math.round(v) !== 0 && !c.startsWith("13"))
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([compte, v]) => {
      const m = Math.round(v);
      lignes.push({ id: 0, compte, intitule: intitule(compte), debit: Math.max(0, m), credit: Math.max(0, -m) });
    });
  // Affectation du résultat (le reste en report à nouveau)
  const rl = Math.round(affectation.reserveLegale ?? 0);
  const rlib = Math.round(affectation.reservesLibres ?? 0);
  const div = Math.round(affectation.dividendes ?? 0);
  const reste = Math.round(total) - rl - rlib - div;
  if (rl) lignes.push({ id: 0, compte: "111", intitule: "Réserve légale", debit: 0, credit: rl });
  if (rlib) lignes.push({ id: 0, compte: "118", intitule: "Autres réserves", debit: 0, credit: rlib });
  if (div) lignes.push({ id: 0, compte: "465", intitule: "Associés, dividendes à payer", debit: 0, credit: div });
  if (reste > 0) lignes.push({ id: 0, compte: "121", intitule: "Report à nouveau créditeur", debit: 0, credit: reste });
  if (reste < 0) lignes.push({ id: 0, compte: "129", intitule: "Report à nouveau débiteur", debit: -reste, credit: 0 });
  // Arrondis : l'écart éventuel (≤ quelques francs) va en report à nouveau
  const ecart = lignes.reduce((t, l) => t + l.debit - l.credit, 0);
  if (ecart) lignes.push(ecart > 0
    ? { id: 0, compte: "121", intitule: "Report à nouveau (arrondis)", debit: 0, credit: ecart }
    : { id: 0, compte: "129", intitule: "Report à nouveau (arrondis)", debit: -ecart, credit: 0 });
  const suivant = annee + 1;
  return {
    journal: "AN",
    numeroPiece: pieceANouveaux(suivant),
    libelle: `À-nouveaux au 01/01/${suivant} (clôture de l'exercice ${annee})`,
    lignes: numeroter(lignes),
    statut: "valide",
    activiteId: null,
    date: `${suivant}-01-01`,
    annee: suivant,
    mois: 1,
  };
};

export interface LigneOuverture { compte: string; debit: number; credit: number }

/** Contrôle d'un bilan d'ouverture saisi : comptes de bilan, totaux égaux. */
export const verifierOuverture = (lignes: LigneOuverture[]): string | null => {
  const utiles = lignes.filter((l) => l.compte && (l.debit || l.credit));
  if (!utiles.length) return "Saisissez au moins un solde.";
  const hors = utiles.find((l) => !/^[1-5]/.test(l.compte));
  if (hors) return `Le compte ${hors.compte} n'est pas un compte de bilan (classes 1 à 5).`;
  const d = utiles.reduce((t, l) => t + (l.debit || 0), 0);
  const c = utiles.reduce((t, l) => t + (l.credit || 0), 0);
  if (Math.round(d) !== Math.round(c)) return `Le bilan d'ouverture n'est pas équilibré : débits ${Math.round(d)} ≠ crédits ${Math.round(c)}.`;
  return null;
};

/** Écriture d'à-nouveaux d'un bilan d'ouverture saisi. */
export const ecritureOuverture = (lignes: LigneOuverture[], annee: number): EcritureGeneree => ({
  journal: "AN",
  numeroPiece: pieceANouveaux(annee),
  libelle: `Bilan d'ouverture au 01/01/${annee}`,
  lignes: numeroter(lignes
    .filter((l) => l.compte && (l.debit || l.credit))
    .map((l) => ({ id: 0, compte: l.compte, intitule: intitule(l.compte), debit: Math.round(l.debit || 0), credit: Math.round(l.credit || 0) }))),
  statut: "valide",
  activiteId: null,
  date: `${annee}-01-01`,
  annee,
  mois: 1,
});

/** Lignes proposées pour saisir un bilan d'ouverture. */
export const MODELE_OUVERTURE: { compte: string; libelle: string; sens: "debit" | "credit" }[] = [
  { compte: "1013", libelle: "Capital social", sens: "credit" },
  { compte: "111", libelle: "Réserve légale", sens: "credit" },
  { compte: "118", libelle: "Autres réserves", sens: "credit" },
  { compte: "121", libelle: "Report à nouveau créditeur", sens: "credit" },
  { compte: "129", libelle: "Report à nouveau débiteur", sens: "debit" },
  { compte: "162", libelle: "Emprunts auprès des établissements de crédit", sens: "credit" },
  { compte: "2441", libelle: "Matériel et mobilier", sens: "debit" },
  { compte: "2451", libelle: "Matériel de transport", sens: "debit" },
  { compte: "2844", libelle: "Amortissements du matériel et mobilier", sens: "credit" },
  { compte: "2845", libelle: "Amortissements du matériel de transport", sens: "credit" },
  { compte: "311", libelle: "Stocks de marchandises", sens: "debit" },
  { compte: "4111", libelle: "Clients", sens: "debit" },
  { compte: "4011", libelle: "Fournisseurs", sens: "credit" },
  { compte: "4441", libelle: "État, TVA due", sens: "credit" },
  { compte: "431", libelle: "CNSS", sens: "credit" },
  { compte: "521", libelle: "Banque", sens: "debit" },
  { compte: "571", libelle: "Caisse", sens: "debit" },
];
