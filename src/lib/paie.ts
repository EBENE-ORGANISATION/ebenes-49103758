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

/** Montants stockés d'un bulletin (sous-ensemble de BulletinPaieRecord). */
export interface MontantsEnregistres {
  salaire_base: number;
  sursalaire: number;
  prime_anciennete: number;
  hs_montant: number;
  primes_diverses: number;
  indemnites: number;
  brut: number;
  cnss_sal: number;
  amu_sal: number;
  irpp: number;
  retenues_diverses: number;
  total_retenues: number;
  net_a_payer: number;
  cnss_pat: number;
  amu_pat: number;
  cout_employeur: number;
}

export interface LigneBulletin {
  libelle: string;
  montant: number;
}

/** Contenu chiffré d'un bulletin PDF, prêt à mettre en page. */
export interface ContenuBulletin {
  gains: LigneBulletin[];
  brut: number;
  retenues: LigneBulletin[];
  totalRetenues: number;
  net: number;
  cnssEmp: number;
  amuEmp: number;
  coutEmployeur: number;
  /** Libellés des charges patronales, avec le taux quand il est connu. */
  libelleCnssEmp: string;
  libelleAmuEmp: string;
}

const egal = (a: number, b: number) => Math.round(a) === Math.round(b);
const somme = (l: LigneBulletin[]) => l.reduce((s, x) => s + x.montant, 0);
const avecTaux = (libelle: string, taux: number, connu: boolean) =>
  connu ? `${libelle} (${pctTaux(taux)}%)` : libelle;

/**
 * Lignes du bulletin PDF.
 *  - Sans `enregistre` : montants du calcul `c` (aperçu du mois en cours).
 *  - Avec `enregistre` : montants du bulletin enregistré, qui font foi même si
 *    la fiche employé, les primes ou les taux ont changé depuis. Le calcul `c`
 *    ne sert qu'au détail (liste des primes, indemnités, taux, jours sans
 *    solde), et seulement quand il retombe sur les montants enregistrés.
 */
export const contenuBulletin = (
  c: CalculPaie,
  employe: Employe,
  enregistre?: MontantsEnregistres | null,
): ContenuBulletin => {
  const indemnitesDetail: LigneBulletin[] = [
    { libelle: "Indemnité transport", montant: employe.indemniteTransport || 0 },
    { libelle: "Indemnité logement", montant: employe.indemniteLogement || 0 },
    { libelle: "Indemnité fonction", montant: employe.indemniteFonction || 0 },
  ].filter((l) => l.montant > 0);
  const primesDetail: LigneBulletin[] = c.primes.map((p) => ({
    libelle: `Prime : ${p.libelle}`,
    montant: p.montant,
  }));

  const e = enregistre;
  const v = {
    base: e ? e.salaire_base : c.base,
    sursalaire: e ? e.sursalaire : c.sursalaire,
    anc: e ? e.prime_anciennete : c.primeAnciennete,
    hs: e ? e.hs_montant : c.hsMontant,
    primes: e ? e.primes_diverses : c.primesDiverses,
    indemnites: e ? e.indemnites : c.indemnites,
    brut: e ? e.brut : c.brut,
    cnssSal: e ? e.cnss_sal : c.cnssSal,
    amuSal: e ? e.amu_sal : c.amuSal,
    irpp: e ? e.irpp : c.irpp,
    retenuesDiverses: e ? e.retenues_diverses : c.retenuesDiverses,
    totalRetenues: e ? e.total_retenues : c.totalRetenues,
    net: e ? e.net_a_payer : c.net,
    cnssEmp: e ? e.cnss_pat : c.cnssEmp,
    amuEmp: e ? e.amu_pat : c.amuEmp,
    cout: e ? e.cout_employeur : c.coutEmployeur,
  };
  // Le détail recalculé n'est repris que s'il concorde avec l'enregistré.
  const concorde = (calcule: number, affiche: number) => !e || egal(calcule, affiche);

  const gains: LigneBulletin[] = [{ libelle: "Salaire de base", montant: v.base }];
  if (v.sursalaire > 0) gains.push({ libelle: "Sursalaire", montant: v.sursalaire });
  if (v.anc > 0)
    gains.push({
      libelle: concorde(c.primeAnciennete, v.anc)
        ? `Prime d'ancienneté (${(c.tauxAnc * 100).toFixed(0)}%)`
        : "Prime d'ancienneté",
      montant: v.anc,
    });
  if (v.hs > 0) gains.push({ libelle: "Heures supplémentaires", montant: v.hs });
  if (v.primes > 0) {
    if (concorde(somme(primesDetail), v.primes)) gains.push(...primesDetail);
    else gains.push({ libelle: "Primes", montant: v.primes });
  }
  if (v.indemnites > 0) {
    if (concorde(somme(indemnitesDetail), v.indemnites)) gains.push(...indemnitesDetail);
    else gains.push({ libelle: "Indemnités", montant: v.indemnites });
  }

  const retenues: LigneBulletin[] = [
    { libelle: avecTaux("CNSS salarié", c.taux.cnssSal, concorde(c.cnssSal, v.cnssSal)), montant: v.cnssSal },
    { libelle: avecTaux("AMU salarié", c.taux.amuSal, concorde(c.amuSal, v.amuSal)), montant: v.amuSal },
    { libelle: "IRPP (barème progressif Togo)", montant: v.irpp },
  ];
  // Congés sans solde : non stockés à part, ils sont la part du total des
  // retenues qui n'est ni cotisation, ni IRPP, ni retenue diverse.
  const sansSolde = e
    ? Math.max(0, e.total_retenues - e.cnss_sal - e.amu_sal - e.irpp - e.retenues_diverses)
    : c.deductionSansSolde;
  if (Math.round(sansSolde) > 0)
    retenues.push({
      libelle:
        c.joursSansSolde > 0 && concorde(c.deductionSansSolde, sansSolde)
          ? `Congés sans solde (${c.joursSansSolde} j)`
          : "Congés sans solde",
      montant: sansSolde,
    });
  if (v.retenuesDiverses > 0) retenues.push({ libelle: "Retenues diverses", montant: v.retenuesDiverses });

  return {
    gains,
    brut: v.brut,
    retenues,
    totalRetenues: v.totalRetenues,
    net: v.net,
    cnssEmp: v.cnssEmp,
    amuEmp: v.amuEmp,
    coutEmployeur: v.cout,
    libelleCnssEmp: avecTaux("CNSS employeur", c.taux.cnssEmp, concorde(c.cnssEmp, v.cnssEmp)),
    libelleAmuEmp: avecTaux("AMU employeur", c.taux.amuEmp, concorde(c.amuEmp, v.amuEmp)),
  };
};
