import type { EcritureComptable, Immobilisation, LigneEcriture } from "@/types/ebene";
import { amortissementsAnnee, cumulAFin, joursEcoules30360, vncAFin, type AmortissementAnnuelLigne } from "@/lib/amortissements";

/**
 * Calcul de la valeur nette comptable (VNC) à une date donnée pour une
 * cession SYSCOHADA. Convention pratique :
 *  - On prend la VNC à la fin de l'exercice précédent l'année de cession,
 *    puis on retranche la dotation prorata temporis de l'année courante
 *    jusqu'à la date de cession (base 30/360, comme l'année d'acquisition).
 */
export const vncADate = (
  immo: Immobilisation,
  dateCessionISO: string,
): number => {
  // Date lue à minuit local (new Date("AAAA-MM-JJ") serait minuit UTC)
  const d = new Date(`${String(dateCessionISO).slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return immo.valeurOrigine;
  const annee = d.getFullYear();
  // VNC à la fin de l'exercice N-1 (valeur d'origine si acquise pendant l'exercice ;
  // une immobilisation totalement amortie a bien une VNC nulle)
  const anneeAcq = Number(String(immo.dateAcquisition).slice(0, 4));
  const vncDebutAnnee = annee - 1 < anneeAcq ? immo.valeurOrigine : vncAFin(immo, annee - 1);
  const dotAnnee = cumulAFin(immo, annee) - cumulAFin(immo, annee - 1);
  // Prorata temporis (base 30/360) de la dotation N. L'année d'acquisition,
  // la dotation ne court que depuis l'acquisition.
  const acq = new Date(`${String(immo.dateAcquisition).slice(0, 10)}T00:00:00`);
  const debut = acq.getFullYear() === annee ? joursEcoules30360(acq) - 1 : 0;
  const duree = 360 - debut;
  const prorata = duree > 0 ? Math.min(1, Math.max(0, (joursEcoules30360(d) - debut) / duree)) : 0;
  const dotProrata = dotAnnee * prorata;
  return Math.max(0, vncDebutAnnee - dotProrata);
};

/**
 * Cumul des amortissements à la date de cession (origine - VNC).
 */
export const cumulADate = (
  immo: Immobilisation,
  dateCessionISO: string,
): number => {
  return Math.max(0, immo.valeurOrigine - vncADate(immo, dateCessionISO));
};

/**
 * Calcule la plus-value (> 0) ou moins-value (< 0) de cession.
 *  plus_ou_moins = valeurCession - VNC(date)
 */
export const calculerPlusMoinsValue = (
  immo: Immobilisation,
  dateCession: string,
  valeurCession: number,
): number => {
  const vnc = vncADate(immo, dateCession);
  return Number(valeurCession || 0) - vnc;
};

/** Catégorise un résultat de cession : profit / perte / nul. */
export const typeResultatCession = (
  resultat: number,
): "plus_value" | "moins_value" | "nul" => {
  if (Math.abs(resultat) < 0.5) return "nul";
  return resultat > 0 ? "plus_value" : "moins_value";
};

/**
 * Plan d'écritures SYSCOHADA pour une cession d'immobilisation.
 *
 * Schéma utilisé (conforme à la doctrine SYSCOHADA Révisé / référentiel demandé) :
 *
 *  ① Sortie de l'immobilisation et de ses amortissements (constatation VNC) :
 *     Débit  28xx — Amortissements cumulés      = cumul amortissements à la cession
 *     Débit  812  — Valeur comptable des cessions (VNC)
 *           ─────► Crédit 2xx — Immobilisation     = valeur d'origine
 *
 *  ② Constatation du prix de cession :
 *     Débit  485  — Créances sur cessions d'immobilisations  = valeur de cession
 *           ─────► Crédit 822 — Produits des cessions          = valeur de cession
 *
 *  La plus ou moins-value est la différence 822 − 812 : elle n'a pas de
 *  compte propre en SYSCOHADA révisé.
 */
export interface EcritureCession {
  compte: string;
  libelle: string;
  debit: number;
  credit: number;
}

export const ecrituresCession = (
  immo: Immobilisation,
): EcritureCession[] => {
  if (immo.statut !== "cede" || !immo.dateCession) return [];
  const valeurCession = Number(immo.valeurCession || 0);
  const cumul = cumulADate(immo, immo.dateCession);
  const vnc = Math.max(0, immo.valeurOrigine - cumul);

  const cptActif = immo.comptesSYSCOHADA?.actif || "2";
  const cptAmort = immo.comptesSYSCOHADA?.amortissementCumule || "28";

  const lib = `Cession ${immo.libelle}`;
  const ecr: EcritureCession[] = [];

  // ① Sortie : amort. cumulés + VNC (812) ► immo (2xx)
  if (cumul > 0 && cptAmort) {
    ecr.push({ compte: cptAmort, libelle: lib + " — solde amort. cumulés", debit: cumul, credit: 0 });
  }
  if (vnc > 0) {
    ecr.push({ compte: "812", libelle: lib + " — VNC sortie", debit: vnc, credit: 0 });
  }
  ecr.push({ compte: cptActif, libelle: lib + " — sortie d'actif", debit: 0, credit: immo.valeurOrigine });

  // ② Prix de cession : 485 ► 822
  if (valeurCession > 0) {
    ecr.push({ compte: "485", libelle: lib + " — créance sur cession", debit: valeurCession, credit: 0 });
    ecr.push({ compte: "822", libelle: lib + " — produit de cession", debit: 0, credit: valeurCession });
  }

  return ecr;
};
type EcritureGeneree = Omit<EcritureComptable, "id">;

/** Contrepartie du prix de cession : encaissé en banque ou en caisse, ou restant dû (485). */
export type ReglementCession = "521" | "571" | "485";

export const pieceCession = (immoId: number) => `CES-${immoId}`;

/**
 * Écritures d'une cession, à la date de cession :
 *  1. dotation de l'exercice jusqu'à la cession (OD DOT-CES-<id>) ;
 *  2. sortie de l'actif (OD CES-<id>) : amortissements cumulés et VNC (812)
 *     au débit, valeur d'origine au crédit ;
 *  3. prix (CES-PRIX-<id>) : banque, caisse ou créance 485 au débit, 822 au crédit.
 * Les dotations des exercices antérieurs sont supposées comptabilisées.
 */
export const ecrituresComptablesCession = (
  immo: Immobilisation,
  dateCession: string,
  prix: number,
  reglement: ReglementCession,
  statut: "valide" | "brouillon" = "valide",
): EcritureGeneree[] => {
  const [annee, mois] = dateCession.split("-").map(Number);
  const r = Math.round;
  const comptes = immo.comptesSYSCOHADA;
  const actif = comptes?.actif || "2";
  const amort = comptes?.amortissementCumule || "";
  const dotation = comptes?.dotation || "6813";
  const anneeAcq = Number(String(immo.dateAcquisition).slice(0, 4));
  const cumul = amort ? r(cumulADate(immo, dateCession)) : 0;
  const anterieurs = amort && annee - 1 >= anneeAcq ? r(Math.min(immo.valeurOrigine, cumulAFin(immo, annee - 1))) : 0;
  const complement = Math.max(0, cumul - anterieurs);
  const vnc = r(immo.valeurOrigine) - cumul;
  const numeroter = (l: LigneEcriture[]) => l.filter((x) => x.debit || x.credit).map((x, i) => ({ ...x, id: i + 1 }));
  const commun = { statut, activiteId: immo.activiteId ?? null, date: dateCession, annee, mois };
  const out: EcritureGeneree[] = [];
  if (complement > 0) {
    out.push({
      ...commun, journal: "OD", numeroPiece: `DOT-CES-${immo.id}`,
      libelle: `Dotation ${annee} jusqu'à la cession — ${immo.libelle}`,
      lignes: numeroter([
        { id: 0, compte: dotation, intitule: "Dotations aux amortissements", debit: complement, credit: 0 },
        { id: 0, compte: amort, intitule: `Amortissements — ${immo.libelle}`, debit: 0, credit: complement },
      ]),
    });
  }
  out.push({
    ...commun, journal: "OD", numeroPiece: pieceCession(immo.id),
    libelle: `Cession — ${immo.libelle}`,
    lignes: numeroter([
      ...(amort ? [{ id: 0, compte: amort, intitule: `Amortissements — ${immo.libelle}`, debit: cumul, credit: 0 }] : []),
      { id: 0, compte: "812", intitule: "Valeurs comptables des cessions d'immobilisations", debit: vnc, credit: 0 },
      { id: 0, compte: actif, intitule: immo.libelle, debit: 0, credit: r(immo.valeurOrigine) },
    ]),
  });
  if (prix > 0) {
    const intitules = { "521": "Banques", "571": "Caisse", "485": "Créances sur cessions d'immobilisations" } as const;
    out.push({
      ...commun, journal: reglement === "521" ? "BQ" : reglement === "571" ? "CA" : "OD", numeroPiece: `CES-PRIX-${immo.id}`,
      libelle: `Prix de cession — ${immo.libelle}`,
      lignes: numeroter([
        { id: 0, compte: reglement, intitule: intitules[reglement], debit: r(prix), credit: 0 },
        { id: 0, compte: "822", intitule: "Produits des cessions d'immobilisations", debit: 0, credit: r(prix) },
      ]),
    });
  }
  return out;
};

/**
 * Tableau de l'exercice en tenant compte des cessions : l'année de la cession,
 * la dotation court jusqu'à la date de cession ; ensuite plus de dotation. Un
 * bien cédé est sorti de l'actif : cumul et VNC à 0 en fin d'exercice.
 */
export const amortissementsAnneeAvecCessions = (immos: Immobilisation[], annee: number): AmortissementAnnuelLigne[] =>
  amortissementsAnnee(immos, annee).map((l) => {
    const i = l.immobilisation;
    const anneeCession = i.statut === "cede" && i.dateCession ? Number(String(i.dateCession).slice(0, 4)) : null;
    if (anneeCession === null || anneeCession > annee) return l;
    if (anneeCession < annee) return { immobilisation: i, dotation: 0, cumul: 0, vnc: 0 };
    const anterieurs = cumulAFin(i, annee - 1);
    return { immobilisation: i, dotation: Math.max(0, Math.round(cumulADate(i, i.dateCession!) - anterieurs)), cumul: 0, vnc: 0 };
  });
