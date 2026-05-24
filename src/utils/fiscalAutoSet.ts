// ============================================================================
// fiscalAutoSet.ts — Miroir TypeScript de generate_set_impots (CGI Togo 2025)
// Calcul côté client sans appel DB — utilisé pour l'aperçu en temps réel.
// ============================================================================

import type {
  RegimeFiscal,
  SecteurActivite,
  ImpotApplicable,
} from "@/types/fiscal";
import {
  REGIMES_SANS_TVA,
  SECTEURS_SANS_TVA,
  SEUIL_TVA_TOGO,
} from "@/types/fiscal";

export interface ParamsFiscaux {
  regime: RegimeFiscal;
  secteur: SecteurActivite;
  caAnnuel?: number;
  assujetti_tva?: boolean;
}

// ─── Taux de Patente par tranche et groupe ────────────────────────────────

const TAUX_PATENTE: Record<
  "T1" | "T2" | "T3" | "T4",
  Record<SecteurActivite, number>
> = {
  T1: { CO: 0.0055, HO: 0.0055, PH: 0.0055, SE: 0.0075, BTP: 0.0075, ASS: 0.0075, BE: 0.0075, IND: 0.0035, AGRI: 0.0035, TEL: 0.0080, TI: 0.0050, AUT: 0.0075 },
  T2: { CO: 0.0060, HO: 0.0060, PH: 0.0060, SE: 0.0090, BTP: 0.0090, ASS: 0.0090, BE: 0.0090, IND: 0.0040, AGRI: 0.0040, TEL: 0.0100, TI: 0.0065, AUT: 0.0090 },
  T3: { CO: 0.0065, HO: 0.0065, PH: 0.0065, SE: 0.0105, BTP: 0.0105, ASS: 0.0105, BE: 0.0105, IND: 0.0045, AGRI: 0.0045, TEL: 0.0110, TI: 0.0075, AUT: 0.0105 },
  T4: { CO: 0.0070, HO: 0.0070, PH: 0.0070, SE: 0.0120, BTP: 0.0120, ASS: 0.0120, BE: 0.0120, IND: 0.0050, AGRI: 0.0050, TEL: 0.0130, TI: 0.0090, AUT: 0.0100 },
};

function getTauxPatente(secteur: SecteurActivite, ca: number): number {
  const tranche =
    ca <= 5_000_000   ? "T1" :
    ca <= 30_000_000  ? "T2" :
    ca <= 100_000_000 ? "T3" : "T4";
  return TAUX_PATENTE[tranche][secteur] ?? 0.0075;
}

// ─── Recommandation de régime selon CA ────────────────────────────────────

export function regimeRecommande(
  ca: number,
  secteur: SecteurActivite,
): RegimeFiscal {
  if (["BE", "ASS", "TEL", "TI"].includes(secteur))
    return secteur as RegimeFiscal;
  if (ca < 60_000_000) return "TPU";
  return "IS";
}

// ─── Calcul TVA auto selon CA ──────────────────────────────────────────────

export function calcAssujetti(
  ca: number,
  regime: RegimeFiscal,
  secteur: SecteurActivite,
): boolean {
  if (REGIMES_SANS_TVA.includes(regime)) return false;
  if (SECTEURS_SANS_TVA.includes(secteur)) return false;
  return ca > SEUIL_TVA_TOGO;
}

// ─── Générateur principal ─────────────────────────────────────────────────

export function generateSetImpots({
  regime,
  secteur,
  caAnnuel = 0,
  assujetti_tva = false,
}: ParamsFiscaux): ImpotApplicable[] {
  const result: ImpotApplicable[] = [];

  // IS
  if (regime === "IS" || regime === "IMF") {
    result.push({
      code: "IS",
      label: "Impôt sur les Sociétés",
      taux: 0.27,
      assiette: "benefice_net",
      article: "CGI Art. 128",
      periodicite: "annuel",
    });
  }

  // IMF
  if (regime === "IS" || regime === "IMF") {
    result.push({
      code: "IMF",
      label: "Impôt Minimum Forfaitaire",
      taux: 0.01,
      assiette: "ca_ht",
      montant_min: 200_000,
      article: "CGI Art. 141",
      periodicite: "annuel",
    });
  }

  // TPU
  if (regime === "TPU") {
    const servicesTPU = !["CO", "HO", "PH", "IND", "AGRI"].includes(secteur);
    result.push({
      code: "TPU",
      label: servicesTPU
        ? "Taxe Professionnelle Unique — Services"
        : "Taxe Professionnelle Unique — Commerce / Production",
      taux: servicesTPU ? 0.08 : 0.02,
      assiette: "ca_ht",
      article: "CGI Art. 163",
      periodicite: "trimestriel",
    });
  }

  // TVA
  if (
    assujetti_tva &&
    !REGIMES_SANS_TVA.includes(regime) &&
    !SECTEURS_SANS_TVA.includes(secteur) &&
    caAnnuel > SEUIL_TVA_TOGO
  ) {
    result.push({
      code: "TVA",
      label: "Taxe sur la Valeur Ajoutée",
      taux: 0.18,
      assiette: "ca_ht",
      seuil_ca: SEUIL_TVA_TOGO,
      article: "CGI Art. 203",
      periodicite: "mensuel",
    });
  }

  // TAF (BE)
  if (regime === "BE" || secteur === "BE") {
    result.push({
      code: "TAF",
      label: "Taxe sur les Activités Financières",
      taux: 0.10,
      assiette: "produits_bruts",
      article: "CGI Art. 230",
      periodicite: "mensuel",
    });
  }

  // TCA (ASS)
  if (regime === "ASS" || secteur === "ASS") {
    const tcaTypes: Array<[string, string, number]> = [
      ["TCA_NAV",     "TCA Navigation",              0.05 ],
      ["TCA_INC_GEN", "TCA Incendie général",         0.25 ],
      ["TCA_INC_PRO", "TCA Incendie professionnel",   0.20 ],
      ["TCA_VIE",     "TCA Vie",                      0.03 ],
      ["TCA_AUT",     "TCA Autres",                   0.06 ],
      ["TCA_CRED",    "TCA Crédit export",             0.002],
    ];
    tcaTypes.forEach(([code, label, taux]) =>
      result.push({ code, label, taux, assiette: "primes_nettes", article: "CGI Art. 246", periodicite: "mensuel" })
    );
  }

  // TETTIC (TEL / TI)
  if (regime === "TEL" || regime === "TI" || secteur === "TEL" || secteur === "TI") {
    result.push({
      code: "TETTIC",
      label:
        secteur === "TEL"
          ? "TETTIC — Télécommunications"
          : "TETTIC — Transferts Internationaux",
      taux: 0.05,
      assiette: "ca_ht",
      article: "CGI Art. 253",
      periodicite: "mensuel",
    });
  }

  // Patente
  if (caAnnuel > 0) {
    const tauxPat = getTauxPatente(secteur, caAnnuel);
    result.push({
      code: "PATENTE",
      label: "Taxe Professionnelle (Patente)",
      taux: tauxPat,
      assiette: "ca_annuel",
      montant_estime: Math.round(caAnnuel * tauxPat),
      article: "CGI Art. 302",
      periodicite: "annuel",
    });
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

export const TCA_TYPES = [
  { code: "TCA_NAV",     label: "Navigation",             taux: 0.05  },
  { code: "TCA_INC_GEN", label: "Incendie général",       taux: 0.25  },
  { code: "TCA_INC_PRO", label: "Incendie professionnel", taux: 0.20  },
  { code: "TCA_VIE",     label: "Vie",                    taux: 0.03  },
  { code: "TCA_AUT",     label: "Autres",                 taux: 0.06  },
  { code: "TCA_CRED",    label: "Crédit export",          taux: 0.002 },
] as const;

export const PAT_TRANCHES = [
  { label: "≤ 5 M FCFA",      min: 0,           max: 5_000_000    },
  { label: "5 – 30 M FCFA",   min: 5_000_000,   max: 30_000_000   },
  { label: "30 – 100 M FCFA", min: 30_000_000,  max: 100_000_000  },
  { label: "> 100 M FCFA",    min: 100_000_000, max: Infinity      },
] as const;

export const TVM_GRILLES = {
  mensuel:      [0, 0, 5, 10, 15, 20, 25, 30, 35, 40],
  trimestriel:  [0, 0, 5, 10, 15, 20, 25, 30, 35, 40],
} as const;
