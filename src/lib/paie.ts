// Calcul de paie togolais — module pur (sans React ni Supabase), testable.
import { Employe, MoisData, Prime, TauxFiscaux, TAUX_DEFAUT } from "@/types/ebene";
import {
  tauxHoraire,
  tauxAnciennete,
  calculerAnciennete,
  calculerIRPP,
  HS_TAUX,
  deductionCongesSansSolde,
} from "@/lib/ebene-utils";

/** Taux en pourcentage lisible : 0.175 → « 17,5 ». */
export const pctTaux = (r: number): string =>
  (r * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export interface CalculPaie {
  base: number;
  sursalaire: number;
  primeAnciennete: number;
  hsMontant: number;
  primesDiverses: number;
  indemnites: number;
  brut: number;
  imposable: number;
  /** Base CNSS/AMU : brut hors indemnités, moins congés sans solde. */
  baseCotisable: number;
  /** Taux appliqués (pour l'affichage des pourcentages). */
  taux: TauxFiscaux;
  irpp: number;
  cnssSal: number;
  amuSal: number;
  retenuesDiverses: number;
  joursSansSolde: number;
  deductionSansSolde: number;
  totalRetenues: number;
  net: number;
  // patronal
  cnssEmp: number;
  amuEmp: number;
  totalPatronal: number;
  coutEmployeur: number;
  // détail
  primes: Prime[];
  anciennete: number;
  tauxAnc: number;
  th: number;
}

/**
 * Calcule la paie d'un employé pour un mois.
 *  - `annee`/`mois` fixent la date de référence de l'ancienneté (dernier jour
 *    du mois payé) : un bulletin passé garde l'ancienneté de cette date.
 *  - `taux` : taux CNSS/AMU applicables au mois (historique des taux, voir
 *    tauxPourMois). Par défaut, taux réglementaires TAUX_DEFAUT.
 */
export const calculerPaie = (
  employe: Employe,
  data: MoisData,
  annee?: number,
  mois?: number,
  taux: TauxFiscaux = TAUX_DEFAUT,
): CalculPaie => {
  const base = employe.salaire || 0;
  const sursalaire = employe.sursalaire || 0;
  const th = tauxHoraire(base, sursalaire);

  const refDate = annee && mois ? new Date(annee, mois, 0) : new Date();
  const anciennete = calculerAnciennete(employe.dateEmbauche, refDate);
  const tauxAnc = tauxAnciennete(anciennete);
  const primeAnciennete = base * tauxAnc;

  // Heures sup : seules les HS validées (ou héritées sans statut) impactent la paie.
  const hsBrut = (data.heuresSup || {})[employe.id];
  const hsValide =
    hsBrut && (hsBrut.statutValidation === undefined || hsBrut.statutValidation === "valide");
  const hs = hsValide
    ? hsBrut!
    : { jourSemaine: 0, jourSup: 0, dimancheFerie: 0, nuitSemaine: 0, nuitDimancheFerie: 0 };
  const hsMontant =
    hs.jourSemaine * th * HS_TAUX.jourSemaine +
    hs.jourSup * th * HS_TAUX.jourSup +
    hs.dimancheFerie * th * HS_TAUX.dimancheFerie +
    hs.nuitSemaine * th * HS_TAUX.nuitSemaine +
    hs.nuitDimancheFerie * th * HS_TAUX.nuitDimancheFerie;

  // Primes : seules les primes validées (ou héritées sans statut) sont payées.
  const primes = ((data.primes || {})[employe.id] || []).filter(
    (p) => p.statutValidation === undefined || p.statutValidation === "valide"
  );
  const primesDiverses = primes.reduce((a, p) => a + p.montant, 0);

  const indemnites =
    (employe.indemniteTransport || 0) +
    (employe.indemniteLogement || 0) +
    (employe.indemniteFonction || 0);

  const brut =
    base +
    sursalaire +
    primeAnciennete +
    hsMontant +
    primesDiverses +
    indemnites;

  // Congés sans solde : somme des jours d'absences de type "sans_solde" du mois
  const joursSansSolde = (data.absences || [])
    .filter(
      (a) =>
        a.employeId === employe.id &&
        a.type === "sans_solde" &&
        (a.statutValidation === undefined || a.statutValidation === "valide")
    )
    .reduce((acc, a) => acc + (a.jours || 0), 0);
  const deductionSansSolde = deductionCongesSansSolde(base, sursalaire, joursSansSolde);

  // ── Base cotisable CNSS / AMU ────────────────────────────────────────────
  // Toutes les rémunérations sauf les indemnités (transport, logement,
  // fonction), diminuées des congés sans solde. Même base pour la part
  // salariale et la part patronale.
  const baseCotisable = Math.max(
    0,
    base + sursalaire + primeAnciennete + hsMontant + primesDiverses - deductionSansSolde,
  );
  const cnssSal = baseCotisable * taux.cnssSal;
  const amuSal = baseCotisable * taux.amuSal;

  // ── Base imposable IRPP ──────────────────────────────────────────────────
  // Selon CGI Togo : le RB inclut TOUTES les rémunérations y compris les
  // indemnités, diminué des congés sans solde (salaire non versé).
  const imposable = Math.max(0, brut - deductionSansSolde);

  // Déductions fiscales facultatives (VI, VII, VIII) tirées du profil employé
  const interetPret = employe.interetPretImmobilier ?? 0;
  const assurVie    = employe.assuranceVie ?? 0;
  const retraiteC   = employe.retraiteComplementaire ?? 0;

  // calculerIRPP applique la méthode CGI complète :
  // RB → cotisations réellement retenues → forfait 28 % → CF → RNT → VI/VII/VIII → RNI → barème
  const irpp = calculerIRPP(
    imposable,
    employe.situation,
    employe.enfants,
    interetPret,
    assurVie,
    retraiteC,
    cnssSal + amuSal,
  );

  const retenuesDiverses = (data.retenues || {})[employe.id] || 0;

  const totalRetenues = irpp + cnssSal + amuSal + retenuesDiverses + deductionSansSolde;
  const net = brut - totalRetenues;

  // Charges patronales (taux de l'historique, même base cotisable)
  const cnssEmp = baseCotisable * taux.cnssEmp;
  const amuEmp = baseCotisable * taux.amuEmp;
  const totalPatronal = cnssEmp + amuEmp;
  // Le salaire non versé (congés sans solde) n'est pas un coût pour l'employeur
  const coutEmployeur = brut - deductionSansSolde + totalPatronal;

  return {
    base,
    sursalaire,
    primeAnciennete,
    hsMontant,
    primesDiverses,
    indemnites,
    brut,
    imposable,
    baseCotisable,
    taux,
    irpp,
    cnssSal,
    amuSal,
    retenuesDiverses,
    joursSansSolde,
    deductionSansSolde,
    totalRetenues,
    net,
    cnssEmp,
    amuEmp,
    totalPatronal,
    coutEmployeur,
    primes,
    anciennete,
    tauxAnc,
    th,
  };
};
