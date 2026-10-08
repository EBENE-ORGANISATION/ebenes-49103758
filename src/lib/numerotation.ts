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
 * Réserve atomiquement le prochain numéro (facture ou devis) et avance le
 * compteur en base, AVANT la création du document.
 *
 * Lit le compteur à jour en base puis ne l'avance que s'il n'a pas changé
 * entre-temps (mise à jour conditionnelle « compare-and-swap »). Si un autre
 * utilisateur l'a avancé juste avant, on relit et on réessaie : deux créations
 * simultanées ne peuvent donc pas obtenir le même numéro.
 *
 * Retourne null en cas d'échec (pas de config, droits, réseau) : l'appelant
 * se rabat alors sur le numéro d'aperçu.
 */
export const reserverNumero = async (
  societeId: string,
  type: "facture" | "devis",
  annee: number,
  mois?: number,
): Promise<string | null> => {
  if (!societeId) return null;
  const colCompteur = type === "facture" ? "compteur_facture" : "compteur_devis";
  const colFormat = type === "facture" ? "format_facture" : "format_devis";
  const formatDefaut = type === "facture" ? DEFAULT_FORMAT_FACTURE : DEFAULT_FORMAT_DEVIS;

  try {
    for (let essai = 0; essai < 5; essai++) {
      const { data: cfg, error: readErr } = await supabase
        .from("societe_config")
        .select(`${colCompteur}, ${colFormat}`)
        .eq("societe_id", societeId)
        .maybeSingle();
      if (readErr || !cfg) return null;

      const row = cfg as Record<string, unknown>;
      const brut = row[colCompteur] as number | null;
      const courant = Math.max(1, Number(brut ?? 1));

      const patch =
        type === "facture" ? { compteur_facture: courant + 1 } : { compteur_devis: courant + 1 };
      let maj = supabase
        .from("societe_config")
        .update(patch)
        .eq("societe_id", societeId);
      // Le compteur ne doit pas avoir bougé depuis la lecture
      maj = brut == null ? maj.is(colCompteur, null) : maj.eq(colCompteur, brut);
      const { data: updated, error: updErr } = await maj.select("societe_id");
      if (updErr) return null;

      if (updated && updated.length === 1) {
        const fmt = (row[colFormat] as string | null) || formatDefaut;
        return formaterNumero(fmt, annee, courant, mois);
      }
      // Compteur avancé par quelqu'un d'autre entre-temps → on réessaie
    }
    return null;
  } catch (e) {
    console.warn("[numerotation] reservation error", e);
    return null;
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