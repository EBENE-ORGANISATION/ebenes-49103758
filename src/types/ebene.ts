export type TransactionType = "r" | "d";
export type TransactionSource = "manuelle" | "facture" | "salaires" | "fournisseur";
export type ActiviteType = "service" | "commerce";

/** Statut du workflow de validation (transactions et factures). */
export type StatutValidation =
  | "brouillon"
  | "en_validation"
  | "valide"
  | "rejete";

export interface Transaction {
  id: number;
  date: string;
  desc: string;
  type: TransactionType;
  m: number; // signed amount
  source: TransactionSource;
  factureId?: number | null;
  /** Activité associée à la recette (impacte la patente) */
  activite?: ActiviteType;
  /** PDF/image fournisseur en data URL (base64) */
  pieceJointe?: string | null;
  pieceJointeNom?: string | null;
  pieceJointeType?: string | null;
  fournisseur?: string | null;
  /** marque les transactions auto (salaires mensuels) — non supprimables manuellement */
  auto?: boolean;
  /** Statut du workflow de validation (par défaut: 'en_validation' à la saisie). */
  statut?: StatutValidation;
  /** Motif renseigné lors d'un rejet par le chef de service. */
  motifRejet?: string;
  annee?: number;
  mois?: number;
}

export interface LignePrestation {
  description: string;
  montant: number;
}

export type StatutFacture = "en_attente" | "payee" | "proforma";

export interface Facture {
  id: number;
  numero: string;
  client: string;
  date: string;
  lignes: LignePrestation[];
  reduction: number;
  avecTva: boolean;
  statut: StatutFacture;
  transactionId?: number | null;
  totalHT: number;
  totalTva: number;
  totalTtc: number;
  /** Type d'activité (impacte la patente lors du règlement) */
  activite?: ActiviteType;
  /**
   * Statut du workflow de validation, indépendant du statut métier
   * (en_attente / payee / proforma).
   */
  statutValidation?: StatutValidation;
  /** Motif renseigné lors d'un rejet par le chef de service. */
  motifRejet?: string;
  annee?: number;
  mois?: number;
}

export interface Prime {
  id: number;
  libelle: string;
  montant: number;
  /** Workflow de validation GRH (par défaut: 'en_validation' à la saisie). */
  statutValidation?: StatutValidation;
  /** Motif renseigné lors d'un rejet par le chef GRH. */
  motifRejet?: string;
  employeId?: number;
  annee?: number;
  mois?: number;
}

// ─── Devis (proche d'une Facture mais sans impact comptable) ───────────────
export type StatutDevis = "brouillon" | "envoye" | "accepte" | "refuse" | "converti";

export interface Devis {
  id: number;
  numero: string;
  client: string;
  date: string;
  /** Date limite de validité du devis */
  dateValidite?: string;
  lignes: LignePrestation[];
  reduction: number;
  avecTva: boolean;
  statut: StatutDevis;
  totalHT: number;
  totalTva: number;
  totalTtc: number;
  activite?: ActiviteType;
  /** Renseigné lorsque le devis est converti en facture. */
  factureId?: number | null;
  notes?: string;
  annee?: number;
  mois?: number;
}

export type TypeContrat = "cdi" | "cdd" | "essai" | "stage" | "interim";
/**
 * Catégories professionnelles selon la Convention Collective
 * Interprofessionnelle du Togo (CCIT) :
 *  - E1 → E6 : Agents d'exécution
 *  - M1 → M4 : Agents de maîtrise et assimilés
 *  - C1 → C4 : Cadres et assimilés
 */
export type CategorieProf =
  | "E1" | "E2" | "E3" | "E4" | "E5" | "E6"
  | "M1" | "M2" | "M3" | "M4"
  | "C1" | "C2" | "C3" | "C4";

export interface Employe {
  id: number;
  nom: string;
  poste: string;
  salaire: number; // salaire de base mensuel
  situation: "celibataire" | "marie";
  enfants: number;
  // Champs GRH étendus (optionnels pour compat ascendante)
  matricule?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  sexe?: "M" | "F";
  nationalite?: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  numCnss?: string;
  cni?: string;
  typeContrat?: TypeContrat;
  dateEmbauche?: string;
  dateFinContrat?: string; // pour CDD
  categorie?: CategorieProf;
  echelon?: number;
  qualification?: string;
  // Indemnités fixes mensuelles
  indemniteTransport?: number;
  indemniteLogement?: number;
  indemniteFonction?: number;
  sursalaire?: number;
  // Solde congés (jours acquis non pris)
  soldeConges?: number;
  /** UUID du compte auth.users lié (portail employé self-service). */
  userId?: string;
  /**
   * Workflow de validation GRH. Un employé créé par un membre est
   * 'en_validation' tant que le chef GRH ne l'a pas validé. Tant qu'il
   * n'est pas 'valide', il est exclu des calculs de paie.
   */
  statutValidation?: StatutValidation;
  /** Motif renseigné lors d'un rejet par le chef GRH. */
  motifRejet?: string;
  /** Retenues mensuelles optionnelles */
  interetPretImmobilier?: number;
  assuranceVie?: number;
  retraiteComplementaire?: number;
}

export type TypeAbsence =
  | "conges_payes"
  | "maladie"
  | "maternite"
  | "accident_travail"
  | "deces_conjoint"
  | "deces_frere_soeur"
  | "deces_beau_parent"
  | "mariage"
  | "mariage_enfant"
  | "naissance"
  | "bapteme"
  | "demenagement"
  | "permission_syndicale"
  | "sans_solde"
  | "autre";

export interface Absence {
  id: number;
  employeId: number;
  type: TypeAbsence;
  dateDebut: string;
  dateFin: string;
  jours: number;
  motif?: string;
  /** Workflow de validation GRH (par défaut: 'en_validation' à la saisie). */
  statutValidation?: StatutValidation;
  /** Motif renseigné lors d'un rejet par le chef GRH. */
  motifRejet?: string;
  annee?: number;
  mois?: number;
}

export interface HeuresSup {
  jourSemaine: number; // heures 41-48 majorées 20% (montant déjà calculé sur taux horaire)
  jourSup: number; // > 48h majorées 40%
  dimancheFerie: number; // 65%
  nuitSemaine: number; // 65%
  nuitDimancheFerie: number; // 100%
  /** Workflow de validation GRH (par défaut: 'en_validation' à la saisie). */
  statutValidation?: StatutValidation;
  /** Motif renseigné lors d'un rejet par le chef GRH. */
  motifRejet?: string;
  _dbId?: number;
  employeId?: number;
  annee?: number;
  mois?: number;
}

// ─── Comptabilité SYSCOHADA ────────────────────────────────────────────────────

export type CodeJournal = "AC" | "VE" | "BQ" | "CA" | "OD" | "AN";

export const JOURNAL_LABELS: Record<CodeJournal, string> = {
  AC: "Achats",
  VE: "Ventes",
  BQ: "Banque",
  CA: "Caisse",
  OD: "Opérations Diverses",
  AN: "À Nouveaux",
};

export type StatutEcriture = "brouillon" | "valide" | "cloture";

export interface LigneEcriture {
  id: number;
  compte: string;
  intitule: string;
  debit: number;
  credit: number;
  tiers?: string;
}

export interface CompteComptable {
  code: string;
  intitule: string;
  classe: number;
  sens: "debit" | "credit";
  racine?: boolean;
}

export interface EcritureComptable {
  id: number;
  journal: CodeJournal;
  numeroPiece: string;
  libelle: string;
  lignes: LigneEcriture[];
  statut: StatutEcriture;
  factureId?: number | null;
  bulletinId?: string | null;
  creePar?: string;
  validepar?: string;
  motifRejet?: string;
  pieceJointe?: string | null;
  pieceJointeNom?: string | null;
  pieceJointeType?: string | null;
  annee?: number;
  mois?: number;
  /** Date comptable explicite (ISO YYYY-MM-DD). Distinct de created_at. */
  date?: string | null;
}

export type TypeOperationGuide =
  | "vente_marchandises"
  | "vente_services"
  | "achat_marchandises"
  | "achat_fournitures"
  | "achat_service"
  | "encaissement_client"
  | "paiement_fournisseur"
  | "charge_loyer"
  | "charge_telephone"
  | "charge_electricite"
  | "charge_salaires"
  | "tva_a_decaisser"
  | "dotation_amortissement"
  | "autre";

export const TYPE_OPERATION_LABELS: Record<TypeOperationGuide, string> = {
  vente_marchandises:     "Vente de marchandises",
  vente_services:         "Vente de services / prestations",
  achat_marchandises:     "Achat de marchandises",
  achat_fournitures:      "Achat de fournitures / matières",
  achat_service:          "Achat de service (sous-traitance)",
  encaissement_client:    "Encaissement client (banque)",
  paiement_fournisseur:   "Paiement fournisseur (banque)",
  charge_loyer:           "Charge — Loyer",
  charge_telephone:       "Charge — Téléphone / Internet",
  charge_electricite:     "Charge — Électricité / Eau",
  charge_salaires:        "Charge — Salaires & charges sociales",
  tva_a_decaisser:        "TVA à décaisser (règlement OTR)",
  dotation_amortissement: "Dotation aux amortissements",
  autre:                  "Autre opération diverse",
};

export interface MoisData {
  transactions: Transaction[];
  factures: Facture[];
  primes: Record<number, Prime[]>; // employeId -> primes
  absences?: Absence[];
  heuresSup?: Record<number, HeuresSup>; // employeId -> heures sup du mois
  retenues?: Record<number, number>; // employeId -> retenues diverses
  /** mouvements de stock du mois */
  mouvementsStock?: MouvementStock[];
  /** Devis émis dans le mois (n'impactent pas la comptabilité tant qu'ils ne sont pas convertis) */
  devis?: Devis[];
  /** Écritures comptables SYSCOHADA du mois */
  ecritures?: EcritureComptable[];
}

export type DonneesMensuelles = Record<string, MoisData>; // key = "YYYY-M"

export interface ParamsAnnuels {
  /** Taxe d'Habitation annuelle (FCFA) — acompte semestriel : 15 janv. + 15 juil. */
  th?: number;
  /** Loyer annuel (FCFA) — RSL = loyer × 8,75 %, payée mensuellement avant le 15 du mois suivant */
  loyerAnnuel?: number;
  /** Activité dominante de l'année (impacte la patente) */
  activite?: "service" | "commerce";
}

// ─── Sanctions disciplinaires ────────────────────────────────────────────────
export type TypeSanction =
  | "avertissement_oral"
  | "avertissement_ecrit"
  | "blame"
  | "mise_a_pied"
  | "licenciement_faute_simple"
  | "licenciement_faute_grave"
  | "licenciement_faute_lourde";

export interface Sanction {
  id: number;
  employeId: number;
  date: string;
  type: TypeSanction;
  motif: string;
  joursMiseAPied?: number; // si mise à pied
  observations?: string;
  /** Workflow de validation GRH (par défaut: 'en_validation' à la saisie). */
  statutValidation?: StatutValidation;
  /** Motif renseigné lors d'un rejet par le chef GRH. */
  motifRejet?: string;
}

export const TYPE_SANCTION_LABELS: Record<TypeSanction, string> = {
  avertissement_oral: "Avertissement oral",
  avertissement_ecrit: "Avertissement écrit",
  blame: "Blâme",
  mise_a_pied: "Mise à pied (sans salaire)",
  licenciement_faute_simple: "Licenciement pour faute simple",
  licenciement_faute_grave: "Licenciement pour faute grave",
  licenciement_faute_lourde: "Licenciement pour faute lourde",
};

// ─── Stock ───────────────────────────────────────────────────────────────────
export type TypeMouvementStock = "entree" | "sortie" | "ajustement";

export interface Fournisseur {
  id: number;
  nom: string;
  contact?: string;
  telephone?: string;
  email?: string;
  adresse?: string;
}

export interface CategorieArticle {
  id: number;
  nom: string;
}

export interface Article {
  id: number;
  reference: string;
  designation: string;
  categorieId?: number | null;
  unite: string; // ex: "pièce", "kg", "L"
  prixAchat: number; // PMP courant
  prixVente: number;
  stock: number; // quantité actuelle
  seuilAlerte: number;
  fournisseurId?: number | null;
  emplacement?: string;
  description?: string;
}

export interface MouvementStock {
  id: number;
  date: string;
  articleId: number;
  type: TypeMouvementStock;
  quantite: number; // positif
  prixUnitaire?: number; // pour entrées (recalcul PMP)
  motif?: string;
  reference?: string; // n° BL, n° facture liée, etc.
  factureId?: number | null;
  transactionId?: number | null;
}

// ─── Taux versionnés (par date d'entrée en vigueur) ──────────────────────────
export interface TauxFiscaux {
  /** date ISO d'entrée en vigueur */
  dateEffet: string;
  tva: number; // 0.18
  is: number; // 0.27 - Impôt sur les sociétés
  imfTaux: number; // 0.01 - taux IMF sur CA
  imfMin: number; // 20 000 - minimum forfaitaire annuel
  patenteService: number; // 0.0075
  patenteCommerce: number; // 0.0055
  cnssSal: number; // 0.04
  cnssEmp: number; // 0.175
  amuSal: number; // 0.05
  amuEmp: number; // 0.05
  /** Activité par défaut: service ou commerce */
  activiteDefaut: "service" | "commerce";
}

export const TAUX_DEFAUT: TauxFiscaux = {
  dateEffet: "2020-01-01",
  tva: 0.18,
  is: 0.27,
  imfTaux: 0.01,
  imfMin: 20000,
  patenteService: 0.0075,
  patenteCommerce: 0.0055,
  cnssSal: 0.04,
  cnssEmp: 0.175,
  amuSal: 0.05,
  amuEmp: 0.05,
  activiteDefaut: "service",
};

export const MOIS_NOMS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/**
 * Libellés CCIT (Convention Collective Interprofessionnelle du Togo) —
 * Annexe I « Classifications professionnelles ».
 */
export const CATEGORIES_LABELS: Record<CategorieProf, string> = {
  // ─── Agents d'exécution ───
  E1: "E1 - Manœuvre ordinaire",
  E2: "E2 - Gardien, agent de sécurité, agent d'entretien, manutentionnaire…",
  E3: "E3 - Aide ouvrier, vendeur auxiliaire, pompiste, jardinier…",
  E4: "E4 - Ouvrier spécialisé, caissier, vendeur, dactylographe, conducteur (B/C), aide-soignant…",
  E5: "E5 - Employé de bureau (CEPE/CEPD + 2 ans), agent de transit, conducteur (D/E)…",
  E6: "E6 - Aide-comptable, employé titulaire CAP, BEPC, Bac1 (Ens. général)…",
  // ─── Agents de maîtrise ───
  M1: "M1 - Bac II (Ens. général), archiviste, documentaliste, bibliothécaire…",
  M2: "M2 - BEPC + 3 ans formation pro, ENA Cycle I, Bac techniques, brevet de technicien…",
  M3: "M3 - DEUG (Diplôme d'Études Universitaires Générales)…",
  M4: "M4 - Licence (Bac+3), BTS / DUT (Bac+2 pro)…",
  // ─── Cadres ───
  C1: "C1 - Licence pro, ENA Cycle II, maîtrise (Bac+4), ingénieur des travaux…",
  C2: "C2 - Bac+4 formation professionnelle, Master recherche…",
  C3: "C3 - ENA Cycle III, DESS, Master professionnel, ingénieur diplômé…",
  C4: "C4 - Doctorat ou équivalent, Directeur Général…",
};

export const TYPE_ABSENCE_LABELS: Record<TypeAbsence, { label: string; jours: number | null }> = {
  conges_payes: { label: "Congés payés", jours: null },
  maladie: { label: "Congé maladie", jours: null },
  maternite: { label: "Congé maternité (14 sem.)", jours: 98 },
  accident_travail: { label: "Accident du travail", jours: null },
  deces_conjoint: { label: "Décès conjoint/ascendant/descendant", jours: 4 },
  deces_frere_soeur: { label: "Décès frère/sœur", jours: 2 },
  deces_beau_parent: { label: "Décès beau-père/belle-mère", jours: 3 },
  mariage: { label: "Mariage du travailleur", jours: 3 },
  mariage_enfant: { label: "Mariage enfant/frère/sœur", jours: 1 },
  naissance: { label: "Naissance au foyer", jours: 2 },
  bapteme: { label: "Baptême", jours: 1 },
  demenagement: { label: "Déménagement", jours: 1 },
  permission_syndicale: { label: "Permission syndicale", jours: null },
  sans_solde: { label: "Congé sans solde", jours: null },
  autre: { label: "Autre", jours: null },
};

// ─── Immobilisations / Amortissements (SYSCOHADA Révisé) ──────────────────
export type MethodeAmortissement = "lineaire" | "degressif";

/**
 * Catégorie SYSCOHADA d'une immobilisation. Détermine les comptes
 * (immobilisation, amortissement cumulé, dotation) utilisés dans le grand-livre.
 */
export type CategorieImmo =
  | "terrain"
  | "construction"
  | "agencement"
  | "materiel_industriel"
  | "materiel_transport"
  | "materiel_bureau"
  | "materiel_informatique"
  | "mobilier"
  | "logiciel"
  | "autre_incorporelle";

export interface ComptesSYSCOHADAImmo {
  /** Compte d'actif (classe 2) — ex: 2441 Matériel de bureau. */
  actif: string;
  /** Compte d'amortissements cumulés (classe 28) — ex: 28441. */
  amortissementCumule: string;
  /** Compte de dotation aux amortissements (classe 68) — ex: 6813. */
  dotation: string;
}

export interface Immobilisation {
  id: number;
  libelle: string;
  categorie?: CategorieImmo;
  dateAcquisition: string; // ISO
  valeurOrigine: number;
  /** Durée d'amortissement en années. */
  dureeAmortissement: number;
  methode: MethodeAmortissement;
  /** Comptes SYSCOHADA (auto-déduits par défaut depuis la catégorie). */
  comptesSYSCOHADA: ComptesSYSCOHADAImmo;
  /** Optionnel : valeur résiduelle prévue en fin de plan. */
  valeurResiduelle?: number;
  /** Statut de l'immobilisation. */
  statut?: "actif" | "cede" | "rebut";
  /** Optionnel : date de cession (sortie d'inventaire). */
  dateCession?: string;
  /** Prix de cession (HT, FCFA). */
  valeurCession?: number;
  /**
   * Plus-value (positif) ou moins-value (négatif) constatée lors de la cession.
   * Calculé automatiquement = valeurCession - VNC à la date de cession.
   */
  plusMoinsValue?: number;
  notes?: string;
}

/**
 * Comptes SYSCOHADA par défaut selon la catégorie. Utilisés lorsqu'aucun
 * compte n'est renseigné par l'utilisateur.
 */
// ─── Bulletins de paie persistés ─────────────────────────────────────────────

export type StatutBulletin = "brouillon" | "valide" | "paye";

export interface BulletinPaieRecord {
  id: string;
  employe_id: number;
  employe_nom: string;
  employe_user_id: string | null;
  societe_id: string;
  mois: number;
  annee: number;
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
  statut: StatutBulletin;
  created_at: string;
  paid_at: string | null;
}

export const COMPTES_IMMO_DEFAUT: Record<CategorieImmo, ComptesSYSCOHADAImmo> = {
  terrain:               { actif: "22",   amortissementCumule: "",     dotation: "" /* non amortissable */ },
  construction:          { actif: "231",  amortissementCumule: "2831", dotation: "6813" },
  agencement:            { actif: "235",  amortissementCumule: "2835", dotation: "6813" },
  materiel_industriel:   { actif: "241",  amortissementCumule: "2841", dotation: "6813" },
  materiel_transport:    { actif: "245",  amortissementCumule: "2845", dotation: "6813" },
  materiel_bureau:       { actif: "2444", amortissementCumule: "2844", dotation: "6813" },
  materiel_informatique: { actif: "2442", amortissementCumule: "2842", dotation: "6813" },
  mobilier:              { actif: "2444", amortissementCumule: "2844", dotation: "6813" },
  logiciel:              { actif: "213",  amortissementCumule: "2813", dotation: "6811" },
  autre_incorporelle:    { actif: "21",   amortissementCumule: "281",  dotation: "6811" },
};

export const CATEGORIE_IMMO_LABELS: Record<CategorieImmo, string> = {
  terrain:               "Terrains (non amortissable)",
  construction:          "Bâtiments et constructions",
  agencement:            "Aménagements & installations",
  materiel_industriel:   "Matériel industriel",
  materiel_transport:    "Matériel de transport",
  materiel_bureau:       "Matériel de bureau",
  materiel_informatique: "Matériel informatique",
  mobilier:              "Mobilier",
  logiciel:              "Logiciels",
  autre_incorporelle:    "Autre immobilisation incorporelle",
};

/**
 * Coefficients dégressifs SYSCOHADA appliqués au taux linéaire selon la durée.
 *  - durée < 4 ans : non éligible (retombe en linéaire)
 *  - 3 < durée ≤ 4 : 1.5
 *  - 4 < durée ≤ 6 : 2.0
 *  - durée > 6     : 2.5
 */
export const COEFF_DEGRESSIF = (duree: number): number => {
  if (duree <= 4) return 1.5;
  if (duree <= 6) return 2.0;
  return 2.5;
};