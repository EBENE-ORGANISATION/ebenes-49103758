export type TransactionType = "r" | "d";
export type TransactionSource = "manuelle" | "facture" | "salaires" | "fournisseur";

export interface Transaction {
  id: number;
  date: string;
  desc: string;
  type: TransactionType;
  m: number; // signed amount
  source: TransactionSource;
  factureId?: number | null;
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
}

export interface Prime {
  id: number;
  libelle: string;
  montant: number;
}

export type TypeContrat = "cdi" | "cdd" | "essai" | "stage" | "interim";
export type CategorieProf = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";

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
}

export type DonneesMensuelles = Record<string, MoisData>; // key = "YYYY-M"

export interface ParamsAnnuels {
  th?: number; // Taxe d'habitation annuelle
  rsl?: number; // Redevance annuelle
}

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