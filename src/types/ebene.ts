export type TransactionType = "r" | "d";
export type TransactionSource = "manuelle" | "facture";

export interface Transaction {
  id: number;
  date: string;
  desc: string;
  type: TransactionType;
  m: number; // signed amount
  source: TransactionSource;
  factureId?: number | null;
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

export interface Employe {
  id: number;
  nom: string;
  poste: string;
  salaire: number;
  situation: "celibataire" | "marie";
  enfants: number;
}

export interface MoisData {
  transactions: Transaction[];
  factures: Facture[];
  primes: Record<number, Prime[]>; // employeId -> primes
}

export type DonneesMensuelles = Record<string, MoisData>; // key = "YYYY-M"

export const MOIS_NOMS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];