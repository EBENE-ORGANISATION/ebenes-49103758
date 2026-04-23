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

export const newId = () => Date.now() + Math.floor(Math.random() * 1000);

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