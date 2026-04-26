export type TransactionType = "r" | "d";
export type TransactionSource = "manuelle" | "facture" | "salaires" | "fournisseur";
export type ActiviteType = "service" | "commerce";

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
}

export interface Prime {
  id: number;
  libelle: string;
  montant: number;
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
}

export interface HeuresSup {
  jourSemaine: number; // heures 41-48 majorées 20% (montant déjà calculé sur taux horaire)
  jourSup: number; // > 48h majorées 40%
  dimancheFerie: number; // 65%
  nuitSemaine: number; // 65%
  nuitDimancheFerie: number; // 100%
}

export interface MoisData {
  transactions: Transaction[];
  factures: Facture[];
  primes: Record<number, Prime[]>; // employeId -> primes
  absences?: Absence[];
  heuresSup?: Record<number, HeuresSup>; // employeId -> heures sup du mois
  retenues?: Record<number, number>; // employeId -> retenues diverses
  /** mouvements de stock du mois */
  mouvementsStock?: MouvementStock[];
}

export type DonneesMensuelles = Record<string, MoisData>; // key = "YYYY-M"

export interface ParamsAnnuels {
  th?: number; // Taxe d'habitation annuelle
  rsl?: number; // Redevance annuelle
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
  primeSalissure: number; // 5000
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
  primeSalissure: 5000,
  activiteDefaut: "service",
};

export const MOIS_NOMS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export const CATEGORIES_LABELS: Record<CategorieProf, string> = {
  "1": "1ère catégorie - Manœuvre ordinaire",
  "2": "2ème catégorie - Manœuvre spécialisé",
  "3": "3ème catégorie - Ouvrier qualifié 1er échelon",
  "4": "4ème catégorie - Ouvrier qualifié 2ème échelon",
  "5": "5ème catégorie - Ouvrier hautement qualifié",
  "6": "6ème catégorie - Agent de maîtrise / Technicien",
  "7": "7ème catégorie - Technicien supérieur",
  "8": "8ème catégorie - Cadre débutant",
  "9": "9ème catégorie - Cadre confirmé",
  "10": "10ème catégorie - Cadre supérieur",
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