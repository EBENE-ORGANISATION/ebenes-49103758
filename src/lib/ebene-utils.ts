import { TauxFiscaux, TAUX_DEFAUT, Employe } from "@/types/ebene";

export const formatMontant = (n: number): string => {
  const abs = Math.abs(Math.round(n));
  return abs.toLocaleString("fr-FR") + " F";
};

export const formatMontantSigne = (n: number): string => {
  const sign = n >= 0 ? "+" : "-";
  return sign + " " + formatMontant(n);
};

export const moisKey = (annee: number, mois: number) => `${annee}-${mois}`;

export const todayISO = () => new Date().toISOString().split("T")[0];

export const escapeHtml = (str: string): string =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Génère un id numérique strictement croissant et unique au sein d'un même
 * onglet. Combine `Date.now()` avec un compteur monotonique pour éviter les
 * collisions lors de créations multiples dans la même milliseconde
 * (imports en lot, conversions devis→facture…).
 */
let __idCounter = 0;
export const newId = (): number => {
  __idCounter = (__idCounter + 1) % 1000;
  return Date.now() * 1000 + __idCounter;
};

// ─── PAIE TOGOLAISE ───────────────────────────────────────────────────────────
// Code du travail togolais & Convention collective interprofessionnelle

/** Taux horaire = salaire mensuel / 173,33 (Article 32 convention) */
export const tauxHoraire = (salaireBase: number, sursalaire = 0): number =>
  (salaireBase + sursalaire) / 173.33;

/** Prime d'ancienneté (Art. 36 convention) :
 * 2% après 2 ans, +1% par année au-delà, plafond 30% */
export const tauxAnciennete = (anneesPresence: number): number => {
  if (anneesPresence < 2) return 0;
  if (anneesPresence < 4) return 0.02;
  const taux = 0.02 + (anneesPresence - 3) * 0.01;
  return Math.min(taux, 0.3);
};

export const calculerAnciennete = (dateEmbauche?: string, refDate = new Date()): number => {
  if (!dateEmbauche) return 0;
  const d = new Date(dateEmbauche);
  if (isNaN(d.getTime())) return 0;
  const diff = refDate.getTime() - d.getTime();
  return Math.max(0, diff / (365.25 * 24 * 3600 * 1000));
};

/** IRPP Togo - barème simplifié par tranches mensuelles (FCFA) */
const TRANCHES_IRPP = [
  { jusqua: 60_000, taux: 0.005 },
  { jusqua: 150_000, taux: 0.07 },
  { jusqua: 300_000, taux: 0.15 },
  { jusqua: 500_000, taux: 0.25 },
  { jusqua: 800_000, taux: 0.3 },
  { jusqua: Infinity, taux: 0.35 },
];

export const calculerIRPP = (
  salaireImposable: number,
  situation: "celibataire" | "marie",
  enfants: number
): number => {
  if (salaireImposable <= 0) return 0;
  let impot = 0;
  let prec = 0;
  for (const tr of TRANCHES_IRPP) {
    if (salaireImposable > tr.jusqua) {
      impot += (tr.jusqua - prec) * tr.taux;
      prec = tr.jusqua;
    } else {
      impot += (salaireImposable - prec) * tr.taux;
      break;
    }
  }
  // Réduction pour charges de famille (parts fiscales)
  let parts = situation === "marie" ? 2 : 1;
  parts += Math.min(enfants, 6) * 0.5;
  const reduction = Math.min(0.45, (parts - 1) * 0.08);
  return Math.max(0, impot * (1 - reduction));
};

/** Majoration des heures supplémentaires (Art. 32 convention) */
export const HS_TAUX = {
  jourSemaine: 1.2, // 41-48h
  jourSup: 1.4, // > 48h
  dimancheFerie: 1.65,
  nuitSemaine: 1.65,
  nuitDimancheFerie: 2.0,
};

export const formatJours = (j: number): string =>
  j.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " j";

// ─── TAUX VERSIONNÉS PAR DATE D'EFFET ────────────────────────────────────────
/**
 * Retourne les taux applicables à une date donnée (le plus récent dont
 * dateEffet <= refDate). Garantit un fallback sur TAUX_DEFAUT.
 */
export const tauxApplicables = (
  historique: TauxFiscaux[] | undefined,
  refDateISO: string
): TauxFiscaux => {
  if (!historique || historique.length === 0) return TAUX_DEFAUT;
  const ref = new Date(refDateISO).getTime();
  const sorted = [...historique].sort(
    (a, b) => new Date(a.dateEffet).getTime() - new Date(b.dateEffet).getTime()
  );
  let chosen: TauxFiscaux = TAUX_DEFAUT;
  for (const t of sorted) {
    if (new Date(t.dateEffet).getTime() <= ref) chosen = t;
  }
  return chosen;
};

export const tauxPourMois = (
  historique: TauxFiscaux[] | undefined,
  annee: number,
  mois: number
): TauxFiscaux => {
  // on prend le dernier jour du mois pour appliquer un changement intervenu en cours de mois
  const ref = new Date(annee, mois, 0).toISOString().split("T")[0];
  return tauxApplicables(historique, ref);
};

// ─── INDEMNITÉS FIN DE CONTRAT (Code travail + convention TG) ────────────────
/**
 * Préavis légal selon catégorie CCIT / ancienneté.
 *  - Agents d'exécution (E1-E6) : 15 j (< 1 an), 30 j (1-5 ans), 60 j (> 5 ans)
 *  - Agents de maîtrise (M1-M4) : 30 j (< 1 an), 60 j (1-5 ans), 90 j (> 5 ans)
 *  - Cadres (C1-C4) : 90 jours quelle que soit l'ancienneté
 */
export const dureePreavis = (categorie: string | undefined, anneesPresence: number): number => {
  const cat = (categorie || "E1").toUpperCase();
  const famille = cat.charAt(0); // E, M ou C
  if (famille === "C") return 90;
  if (famille === "M") {
    if (anneesPresence < 1) return 30;
    if (anneesPresence <= 5) return 60;
    return 90;
  }
  // famille E (exécution) — défaut
  if (anneesPresence < 1) return 15;
  if (anneesPresence <= 5) return 30;
  return 60;
};

export const indemnitePreavis = (employe: Employe, anneesPresence: number): number => {
  const jours = dureePreavis(employe.categorie, anneesPresence);
  const salaireJournalier = (employe.salaire + (employe.sursalaire || 0)) / 30;
  return jours * salaireJournalier;
};

/**
 * Indemnité de licenciement (Art. 32 Conv. interprof. Togo) :
 * % du salaire mensuel moyen × nb d'années :
 *  - 35% pour les 5 premières années
 *  - 40% de la 6e à la 10e année
 *  - 45% au-delà de 10 ans
 * Aucune indemnité si moins d'un an d'ancienneté ou faute lourde.
 */
export const indemniteLicenciement = (
  salaireMoyenMensuel: number,
  anneesPresence: number,
  fauteLourde = false
): number => {
  if (fauteLourde || anneesPresence < 1) return 0;
  let total = 0;
  const annees = anneesPresence;
  const t1 = Math.min(annees, 5);
  total += salaireMoyenMensuel * 0.35 * t1;
  if (annees > 5) {
    const t2 = Math.min(annees - 5, 5);
    total += salaireMoyenMensuel * 0.4 * t2;
  }
  if (annees > 10) {
    const t3 = annees - 10;
    total += salaireMoyenMensuel * 0.45 * t3;
  }
  return total;
};

/**
 * Indemnité de départ à la retraite : 75 % de l'indemnité de licenciement
 * (Convention interprofessionnelle Togo).
 */
export const indemniteRetraite = (
  salaireMoyenMensuel: number,
  anneesPresence: number
): number => indemniteLicenciement(salaireMoyenMensuel, anneesPresence, false) * 0.75;

/**
 * Indemnité compensatrice de congés payés.
 * Droit : 2,5 jours/mois travaillé. soldeJours = jours acquis - jours pris.
 */
export const indemniteConges = (employe: Employe, soldeJours: number): number => {
  if (soldeJours <= 0) return 0;
  const salaireJournalier = (employe.salaire + (employe.sursalaire || 0)) / 30;
  return soldeJours * salaireJournalier;
};

/**
 * Calcule la déduction pour congés sans solde sur un mois donné.
 * Base 30 jours / mois ; déduit (salaire+sursalaire)/30 × jours sans solde.
 */
export const deductionCongesSansSolde = (
  base: number,
  sursalaire: number,
  joursSansSolde: number
): number => {
  if (joursSansSolde <= 0) return 0;
  return ((base + sursalaire) / 30) * joursSansSolde;
};

// ─── MATRICULE AUTOMATIQUE ───────────────────────────────────────────────────
/**
 * Format demandé : NNNN-A (4 chiffres séquentiels + lettre).
 * On part du plus grand numéro existant + 1, on incrémente la lettre une
 * fois 9999 atteint (9999-A → 0001-B, etc.).
 */
export const genererMatricule = (employes: Employe[]): string => {
  const re = /^(\d{1,4})-([A-Z])$/;
  let maxN = 0;
  let maxLettre = "A";
  employes.forEach((e) => {
    const m = (e.matricule || "").match(re);
    if (!m) return;
    const n = parseInt(m[1], 10);
    const l = m[2];
    if (l > maxLettre || (l === maxLettre && n > maxN)) {
      maxN = n;
      maxLettre = l;
    }
  });
  let n = maxN + 1;
  let lettre = maxLettre;
  if (n > 9999) {
    n = 1;
    lettre = String.fromCharCode(lettre.charCodeAt(0) + 1);
  }
  return `${String(n).padStart(4, "0")}-${lettre}`;
};