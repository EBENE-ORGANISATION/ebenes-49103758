// Résultat par activité — module pur. Décisions du 9 octobre 2026 :
//  - les produits et charges sans activité (siège, direction, comptable…)
//    sont répartis entre les activités au prorata de leur chiffre d'affaires ;
//  - un employé peut être partagé entre plusieurs activités (pourcentages) :
//    ses charges de personnel sont réparties selon ces parts.
import type { EcritureComptable, Employe, RepartitionActivite } from "@/types/ebene";

/** Part d'un employé dans une activité (1 = 100 %). `null` : toutes activités. */
export const partActivite = (
  e: Pick<Employe, "activiteId" | "repartition">,
  activiteId: string | null,
): number => {
  if (activiteId === null) return 1;
  const rep = e.repartition ?? [];
  if (rep.length > 0) return (rep.find((r) => r.activiteId === activiteId)?.part ?? 0) / 100;
  return e.activiteId === activiteId ? 1 : 0;
};

/** Répartition valide : parts positives, total de 100 %. */
export const repartitionValide = (rep: RepartitionActivite[]): boolean =>
  rep.length === 0 || (rep.every((r) => r.part > 0) && Math.abs(rep.reduce((s, r) => s + r.part, 0) - 100) < 0.01);

export interface ResultatActivite {
  activiteId: string;
  /** Chiffre d'affaires HT (comptes 70). */
  ca: number;
  /** Produits directs (classe 7, et 8 au crédit). */
  produits: number;
  /** Charges directes (classe 6, et 8 au débit), salaires partagés compris. */
  charges: number;
  /** Quote-part des produits et charges sans activité (charges − produits communs). */
  communs: number;
  resultat: number;
}

/** Employé d'une écriture de paie « OD-SAL-AAAAMM-<id> » / « RS-AAAAMM-<id> ». */
const employeDeLaPiece = (piece: string): number | null => {
  const m = /^(?:OD-SAL|RS)-\d{6}-(\d+)$/.exec(piece);
  return m ? Number(m[1]) : null;
};

/**
 * Résultat de la période par activité. Les écritures sans activité forment
 * le « commun », réparti au prorata du CA des activités (à parts égales si
 * aucune n'a de CA). La somme des résultats égale le résultat comptable.
 */
export const resultatParActivite = (
  ecritures: Pick<EcritureComptable, "statut" | "lignes" | "activiteId" | "numeroPiece">[],
  activiteIds: string[],
  employes: Pick<Employe, "id" | "activiteId" | "repartition">[] = [],
): { lignes: ResultatActivite[]; communProduits: number; communCharges: number } => {
  const direct = new Map(activiteIds.map((id) => [id, { ca: 0, produits: 0, charges: 0 }]));
  let communProduits = 0;
  let communCharges = 0;

  const imputer = (activiteId: string | null | undefined, compte: string, debit: number, credit: number, poids = 1) => {
    const produit = compte.startsWith("7") || (compte.startsWith("8") && credit > debit);
    const charge = compte.startsWith("6") || (compte.startsWith("8") && debit >= credit);
    if (!produit && !charge) return;
    const cible = activiteId ? direct.get(activiteId) : undefined;
    if (produit) {
      const v = (credit - debit) * poids;
      if (cible) { cible.produits += v; if (compte.startsWith("70")) cible.ca += v; } else communProduits += v;
    } else {
      const v = (debit - credit) * poids;
      if (cible) cible.charges += v; else communCharges += v;
    }
  };

  for (const e of ecritures) {
    if (e.statut === "brouillon") continue;
    const empId = employeDeLaPiece(e.numeroPiece);
    const emp = empId !== null ? employes.find((x) => x.id === empId) : undefined;
    const partage = emp?.repartition && emp.repartition.length > 0 ? emp.repartition : null;
    for (const l of e.lignes ?? []) {
      if (partage && l.compte.startsWith("6")) {
        // Salaire d'un employé partagé : charges réparties selon ses parts
        for (const r of partage) imputer(r.activiteId, l.compte, l.debit, l.credit, r.part / 100);
      } else {
        imputer(e.activiteId, l.compte, l.debit, l.credit);
      }
    }
  }

  const caTotal = [...direct.values()].reduce((s, d) => s + Math.max(0, d.ca), 0);
  const communNet = communCharges - communProduits;
  const lignes = activiteIds.map((id) => {
    const d = direct.get(id)!;
    const cle = caTotal > 0 ? Math.max(0, d.ca) / caTotal : 1 / Math.max(1, activiteIds.length);
    const communs = Math.round(communNet * cle);
    return {
      activiteId: id,
      ca: Math.round(d.ca),
      produits: Math.round(d.produits),
      charges: Math.round(d.charges),
      communs,
      resultat: Math.round(d.produits - d.charges) - communs,
    };
  });
  return { lignes, communProduits: Math.round(communProduits), communCharges: Math.round(communCharges) };
};
