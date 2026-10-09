/**
 * identification.repo.ts — Identification complète de la société pour les
 * états financiers (table `societe_identification`, une ligne par société).
 */
import { supabase } from "@/integrations/supabase/client";

export type FormeJuridique = "SA_PUBLIQUE" | "SA" | "SARL" | "SCS" | "SNC" | "SP" | "GIE" | "ASSOCIATION" | "SAS" | "EI" | "AUTRE";
export type ControleEntite = "public" | "prive_national" | "prive_etranger";

export interface Dirigeant { nif?: string; nom: string; prenoms?: string; qualite?: string; telephone?: string; adresse?: string }
export interface Associe { nif?: string; nom: string; prenoms?: string; nationalite?: string; nombreParts?: number; montant?: number }
export interface Banque { banque: string; compte?: string }

export interface IdentificationSociete {
  sigle?: string;
  formeJuridique?: FormeJuridique;
  capitalSocial?: number;
  valeurNominale?: number;
  nombreParts?: number;
  dateCreation?: string;
  premiereAnnee?: number;
  cnssEmployeur?: string;
  codeActivite?: string;
  greffe?: string;
  repertoireEntites?: string;
  codeImportateur?: string;
  centreImpots?: string;
  boitePostale?: string;
  ville?: string;
  /** Code pays du siège (Togo : 08). */
  paysSiege?: string;
  controle?: ControleEntite;
  nbEtablissements?: number;
  nbEtablissementsHors?: number;
  contact?: string;
  expertComptable?: string;
  commissaireComptes?: string;
  signataire?: string;
  qualiteSignataire?: string;
  banques?: Banque[];
  dirigeants?: Dirigeant[];
  associes?: Associe[];
}

export const identificationRepo = {
  async get(societeId: string): Promise<IdentificationSociete> {
    const { data, error } = await supabase
      .from("societe_identification" as never)
      .select("donnees")
      .eq("societe_id", societeId)
      .maybeSingle();
    if (error) throw error;
    return ((data as { donnees?: IdentificationSociete } | null)?.donnees ?? {}) as IdentificationSociete;
  },

  async enregistrer(societeId: string, donnees: IdentificationSociete): Promise<void> {
    const { error } = await supabase
      .from("societe_identification" as never)
      .upsert({ societe_id: societeId, donnees, updated_at: new Date().toISOString() } as never, { onConflict: "societe_id" });
    if (error) throw error;
  },
};
