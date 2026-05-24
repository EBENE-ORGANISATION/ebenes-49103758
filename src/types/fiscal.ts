// ============================================================================
// Types fiscaux EBENE — CGI Togo 2025
// ============================================================================

export type RegimeFiscal =
  | "IS"   // Impôt sur les Sociétés
  | "IMF"  // Impôt Minimum Forfaitaire
  | "TPU"  // Taxe Professionnelle Unique
  | "BE"   // Banques & Établissements de crédit
  | "ASS"  // Assurances
  | "TEL"  // Télécommunications
  | "TI";  // Transferts Internationaux

export type SecteurActivite =
  | "CO"   // Commerce général
  | "HO"   // Hôtellerie & Restauration
  | "PH"   // Pharmacie
  | "SE"   // Services (hors secteurs spéciaux)
  | "BTP"  // BTP & Travaux publics
  | "ASS"  // Assurances
  | "BE"   // Banques & Établissements de crédit
  | "TEL"  // Télécommunications
  | "TI"   // Transferts Internationaux
  | "IND"  // Industrie & Manufacture
  | "AGRI" // Agriculture & Élevage
  | "AUT"; // Autres / Non classé

export type AssietteFiscale =
  | "benefice_net"
  | "ca_ht"
  | "ca_annuel"
  | "produits_bruts"
  | "primes_nettes";

export type PeriodiciteFiscale = "mensuel" | "trimestriel" | "annuel";

export interface ImpotApplicable {
  code: string;
  label: string;
  taux: number;
  assiette: AssietteFiscale;
  montant_min?: number;
  montant_estime?: number;
  seuil_ca?: number;
  article?: string;
  periodicite?: PeriodiciteFiscale;
}

export interface FiscalDelegation {
  id: string;
  societe_id: string;
  delegue_user_id: string;
  granted_by: string;
  granted_at: string;
  expires_at?: string | null;
  is_active: boolean;
  note?: string | null;
  /** Enrichi côté client depuis auth.users */
  delegue_email?: string;
}

export interface SocieteInfoFiscale {
  id: string;
  nom: string;
  regime_fiscal: RegimeFiscal;
  secteur_activite: SecteurActivite;
  assujetti_tva: boolean;
  set_impots: ImpotApplicable[];
  ca_annuel_estime: number;
}

// ── Labels affichés dans l'UI ────────────────────────────────────────────────

export const REGIME_LABELS: Record<RegimeFiscal, string> = {
  IS:  "IS — Impôt sur les Sociétés (27%)",
  IMF: "IMF — Impôt Minimum Forfaitaire (1% CA)",
  TPU: "TPU — Taxe Professionnelle Unique",
  BE:  "BE — Banques & Établissements de crédit",
  ASS: "ASS — Assurances",
  TEL: "TEL — Télécommunications",
  TI:  "TI — Transferts Internationaux",
};

export const REGIME_DESCRIPTIONS: Record<RegimeFiscal, string> = {
  IS:  "SA et SARL — IS 27% sur bénéfice net + IMF 1% CA (min 20 000 FCFA)",
  IMF: "Entreprises soumises à l'IMF — 1% CA HT, minimum 20 000 FCFA/an",
  TPU: "Petits contribuables — CA < 60 M FCFA. 2% commerce, 8% services",
  BE:  "Banques : TAF 10% sur produits bruts (remplace TVA)",
  ASS: "Compagnies d'assurance : TCA à taux variables selon type de contrat",
  TEL: "Opérateurs télécom : TETTIC 5% CA HT + IS/IMF",
  TI:  "Établissements de transfert d'argent : TETTIC 5% CA HT + IS/IMF",
};

export const SECTEUR_LABELS: Record<SecteurActivite, string> = {
  CO:   "Commerce général",
  HO:   "Hôtellerie & Restauration",
  PH:   "Pharmacie",
  SE:   "Services",
  BTP:  "BTP & Travaux publics",
  ASS:  "Assurances",
  BE:   "Banque / Établissement de crédit",
  TEL:  "Télécommunications",
  TI:   "Transferts Internationaux",
  IND:  "Industrie & Manufacture",
  AGRI: "Agriculture & Élevage",
  AUT:  "Autres",
};

export const PERIODICITE_LABELS: Record<PeriodiciteFiscale, string> = {
  mensuel:      "Mensuel",
  trimestriel:  "Trimestriel",
  annuel:       "Annuel",
};

/** Seuil d'assujettissement TVA au Togo — CGI 2025 */
export const SEUIL_TVA_TOGO = 60_000_000;

/** Régimes pour lesquels la TVA n'est jamais applicable */
export const REGIMES_SANS_TVA: RegimeFiscal[] = ["BE", "ASS", "TPU"];

/** Secteurs pour lesquels la TVA n'est jamais applicable */
export const SECTEURS_SANS_TVA: SecteurActivite[] = ["BE", "ASS"];
