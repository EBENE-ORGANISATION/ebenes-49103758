import type { EtatDossierCabinet, MissionCabinet, RoleCabinet } from "./cabinetOps";

export type EtatEcheance = "faite" | "a_faire" | "en_retard" | "sans_objet";
export type TypeDeclaration = "TVA" | "CNSS" | "IRPP" | "patente";
export type StatutDeclaration = "deposee" | "payee";
export interface MarquerDeclaration {
  societe_id: string;
  annee: number;
  mois: number;
  type: TypeDeclaration;
  statut: StatutDeclaration;
}
export interface EcheanceCabinet {
  type: TypeDeclaration;
  annee: number;
  mois: number;
  echeance: string | null;
  etat: EtatEcheance;
  marquee: { statut: StatutDeclaration; date: string; par_nom: string | null } | null;
}
export interface DossierTableauCabinet {
  dossier_id: string;
  societe_id: string;
  societe_nom: string;
  mission: MissionCabinet;
  etat: EtatDossierCabinet;
  echeances: EcheanceCabinet[];
  pieces: { transactions: number; factures: number; ecritures_brouillon: number; sans_justificatif: number };
  avancement: { dernier_mois: string | null; bulletins_faits: number; bulletins_attendus: number; exercice_precedent_cloture: boolean };
}
export interface TableauCabinetResultat {
  cabinet_id: string;
  responsable: boolean;
  dossiers: DossierTableauCabinet[];
  charge: { user_id: string; nom: string; role: RoleCabinet; dossiers: number; pieces: number }[] | null;
}
export const etatsEcheance: Record<EtatEcheance, { libelle: string; couleur: string }> = {
  faite: { libelle: "tableau_cabinet.etats.faite", couleur: "bg-success/10 text-success" },
  a_faire: { libelle: "tableau_cabinet.etats.a_faire", couleur: "bg-primary/10 text-primary" },
  en_retard: { libelle: "tableau_cabinet.etats.en_retard", couleur: "bg-destructive/10 text-destructive" },
  sans_objet: { libelle: "tableau_cabinet.etats.sans_objet", couleur: "bg-muted text-muted-foreground" },
};
export function periodeParDefaut(aujourdhui: Date): { annee: number; mois: number } {
  return aujourdhui.getMonth() === 0
    ? { annee: aujourdhui.getFullYear() - 1, mois: 12 }
    : { annee: aujourdhui.getFullYear(), mois: aujourdhui.getMonth() };
}
