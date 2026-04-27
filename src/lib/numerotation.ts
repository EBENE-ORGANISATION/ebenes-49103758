import { supabase } from "@/integrations/supabase/client";

export interface NumeroFormatConfig {
  format_facture?: string | null;
  format_devis?: string | null;
  compteur_facture?: number | null;
  compteur_devis?: number | null;
}

export const DEFAULT_FORMAT_FACTURE = "FAC-{YYYY}-{NNN}";
export const DEFAULT_FORMAT_DEVIS = "DEV-{YYYY}-{NNN}";

/**
 * Applique un format de numérotation : remplace les jetons connus.
 * - {YYYY} : année sur 4 chiffres
 * - {YY}   : année sur 2 chiffres
 * - {MM}   : mois sur 2 chiffres (01..12) — facultatif (mois courant si non fourni)
 * - {N}    : compteur brut
 * - {NN}   : compteur min. 2 chiffres
 * - {NNN}  : compteur min. 3 chiffres
 * - {NNNN} : compteur min. 4 chiffres
 * - {NNNNN}: compteur min. 5 chiffres
 */
export const formaterNumero = (
  format: string,
  annee: number,
  compteur: number,
  mois?: number,
): string => {
  const m = mois ?? new Date().getMonth() + 1;
  return format
    .replace(/\{YYYY\}/g, String(annee))
    .replace(/\{YY\}/g, String(annee).slice(-2))
    .replace(/\{MM\}/g, String(m).padStart(2, "0"))
    .replace(/\{NNNNN\}/g, String(compteur).padStart(5, "0"))
    .replace(/\{NNNN\}/g, String(compteur).padStart(4, "0"))
    .replace(/\{NNN\}/g, String(compteur).padStart(3, "0"))
    .replace(/\{NN\}/g, String(compteur).padStart(2, "0"))
    .replace(/\{N\}/g, String(compteur));
};

/** Construit l'aperçu du prochain numéro de facture (sans incrémenter). */
export const genererNumeroFacture = (
  config: NumeroFormatConfig | null | undefined,
  annee: number,
  mois?: number,
): string => {
  const fmt = config?.format_facture || DEFAULT_FORMAT_FACTURE;
  const compteur = Math.max(1, Number(config?.compteur_facture ?? 1));
  return formaterNumero(fmt, annee, compteur, mois);
};

/** Construit l'aperçu du prochain numéro de devis (sans incrémenter). */
export const genererNumeroDevis = (
  config: NumeroFormatConfig | null | undefined,
  annee: number,
  mois?: number,
): string => {
  const fmt = config?.format_devis || DEFAULT_FORMAT_DEVIS;
  const compteur = Math.max(1, Number(config?.compteur_devis ?? 1));
  return formaterNumero(fmt, annee, compteur, mois);
};

/**
 * Incrémente le compteur correspondant en base.
 * Échoue silencieusement (retourne false) — la création du document ne
 * doit jamais être bloquée par un problème de compteur.
 */
export const incrementerCompteur = async (
  societeId: string,
  type: "facture" | "devis",
  current: number,
): Promise<boolean> => {
  if (!societeId) return false;
  const next = Math.max(1, Number(current || 1)) + 1;
  const patch =
    type === "facture" ? { compteur_facture: next } : { compteur_devis: next };
  try {
    const { error } = await supabase
      .from("societe_config")
      .update(patch)
      .eq("societe_id", societeId);
    if (error) {
      console.warn("[numerotation] increment failed", error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[numerotation] increment error", e);
    return false;
  }
};

/** Réinitialise le compteur d'un type donné (à 1 par défaut). */
export const resetCompteur = async (
  societeId: string,
  type: "facture" | "devis",
  value: number = 1,
): Promise<boolean> => {
  if (!societeId) return false;
  const v = Math.max(1, Math.floor(value));
  const patch =
    type === "facture" ? { compteur_facture: v } : { compteur_devis: v };
  const { error } = await supabase
    .from("societe_config")
    .update(patch)
    .eq("societe_id", societeId);
  if (error) throw error;
  return true;
};