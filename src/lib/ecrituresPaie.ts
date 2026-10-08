// Écritures de paie (SYSCOHADA) — module pur, testable.
import type { BulletinPaieRecord, EcritureComptable, LigneEcriture } from "@/types/ebene";
import { sansSoldeEnregistre } from "@/lib/paie";
import { intituleCompte, type CompteTresorerie } from "@/lib/ecrituresTresorerie";

type EcritureGeneree = Omit<EcritureComptable, "id">;

export const pieceSalaire = (b: Pick<BulletinPaieRecord, "annee" | "mois" | "employe_id">) =>
  `OD-SAL-${b.annee}${String(b.mois).padStart(2, "0")}-${b.employe_id}`;
export const pieceReglementSalaire = (b: Pick<BulletinPaieRecord, "annee" | "mois" | "employe_id">) =>
  `RS-${b.annee}${String(b.mois).padStart(2, "0")}-${b.employe_id}`;

/**
 * Écritures d'un bulletin payé, datées du paiement :
 *  1. Paie (OD) : 661 salaire dû (brut − congés sans solde) et 6641 charges
 *     patronales au débit ; au crédit 422 net à payer, 431 CNSS, 433 AMU,
 *     447 IRPP retenu à la source, 4228 autres retenues. Toujours équilibrée.
 *  2. Règlement du net (BQ/CA) : 422 au débit, Banque ou Caisse au crédit.
 * Les cotisations et l'IRPP restent dus jusqu'à leur reversement.
 */
export const ecrituresPaie = (
  b: BulletinPaieRecord,
  datePaiement: string,
  tresorerie: CompteTresorerie = "521",
): EcritureGeneree[] => {
  const r = Math.round;
  const sansSolde = sansSoldeEnregistre(b);
  const salaireDu = r(b.brut) - sansSolde;
  const lignes: LigneEcriture[] = [
    { id: 0, compte: "661", intitule: intituleCompte("661"), debit: salaireDu, credit: 0, tiers: b.employe_nom },
    { id: 0, compte: "6641", intitule: "Charges sociales patronales (CNSS, AMU)", debit: r(b.cnss_pat) + r(b.amu_pat), credit: 0 },
    { id: 0, compte: "422", intitule: intituleCompte("422"), debit: 0, credit: r(b.net_a_payer), tiers: b.employe_nom },
    { id: 0, compte: "431", intitule: intituleCompte("431"), debit: 0, credit: r(b.cnss_sal) + r(b.cnss_pat) },
    { id: 0, compte: "433", intitule: intituleCompte("433"), debit: 0, credit: r(b.amu_sal) + r(b.amu_pat) },
    ...(b.irpp > 0 ? [{ id: 0, compte: "447", intitule: intituleCompte("447"), debit: 0, credit: r(b.irpp) }] : []),
    ...(b.retenues_diverses > 0
      ? [{ id: 0, compte: "4228", intitule: "Autres retenues sur salaires", debit: 0, credit: r(b.retenues_diverses) }]
      : []),
  ];
  // Écart d'arrondi éventuel (montants stockés arrondis séparément) : sur le salaire dû
  const ecart = lignes.reduce((s, l) => s + l.credit - l.debit, 0);
  lignes[0].debit += ecart;

  const [annee, mois] = [b.annee, b.mois];
  const commun = { statut: "valide" as const, bulletinId: b.id, date: datePaiement, annee, mois };
  return [
    {
      ...commun,
      journal: "OD",
      numeroPiece: pieceSalaire(b),
      libelle: `Paie ${b.employe_nom} — ${b.mois}/${b.annee}`,
      lignes: lignes.map((l, i) => ({ ...l, id: i + 1 })),
    },
    {
      ...commun,
      journal: tresorerie === "571" ? "CA" : "BQ",
      numeroPiece: pieceReglementSalaire(b),
      libelle: `Salaire net ${b.employe_nom} — ${b.mois}/${b.annee}`,
      lignes: [
        { id: 1, compte: "422", intitule: intituleCompte("422"), debit: r(b.net_a_payer), credit: 0, tiers: b.employe_nom },
        { id: 2, compte: tresorerie, intitule: intituleCompte(tresorerie), debit: 0, credit: r(b.net_a_payer) },
      ],
    },
  ];
};
