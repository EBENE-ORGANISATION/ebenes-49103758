/**
 * softDelete.ts — Helpers pour le soft-delete uniforme dans tous les repos.
 *
 * Chaque repo appelle ces fonctions à la place des appels Supabase directs.
 * Si la colonne `deleted_at` n'existe pas encore (pré-migration), les fonctions
 * tombent silencieusement en mode hard-delete/no-op pour ne pas casser l'UX.
 */
import { supabase } from "@/integrations/supabase/client";

type TableName = string;

/**
 * Soft-delete un enregistrement (deleted_at = now()).
 * Fallback hard-delete si la colonne n'existe pas encore.
 */
export async function softRemove(
  table: TableName,
  id: number | string,
  societeId: string,
): Promise<void> {
  const { error } = await supabase
    .from(table as never)
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("societe_id", societeId);

  if (error) {
    // Colonne absente → fallback hard-delete
    if (error.code === "42703" || error.code === "PGRST204") {
      const { error: hderr } = await supabase
        .from(table as never)
        .delete()
        .eq("id", id)
        .eq("societe_id", societeId);
      if (hderr) throw hderr;
      return;
    }
    throw error;
  }
}

/**
 * Restaure un enregistrement (deleted_at = null).
 */
export async function softRestore(
  table: TableName,
  id: number | string,
  societeId: string,
): Promise<void> {
  const { error } = await supabase
    .from(table as never)
    .update({ deleted_at: null } as never)
    .eq("id", id)
    .eq("societe_id", societeId);
  if (error) throw error;
}

/**
 * Suppression définitive depuis la corbeille (hard-delete).
 */
export async function softPurge(
  table: TableName,
  id: number | string,
  societeId: string,
): Promise<void> {
  const { error } = await supabase
    .from(table as never)
    .delete()
    .eq("id", id)
    .eq("societe_id", societeId);
  if (error) throw error;
}

/**
 * Filtre à appliquer dans les requêtes SELECT pour exclure les éléments supprimés.
 * Retourne null si la colonne n'existe pas (le composant décide quoi faire).
 */
export const SOFT_FILTER = { column: "deleted_at", value: null } as const;

// ─── Utilitaire pour la page Corbeille ──────────────────────────────────────

export interface CorbeilleItem {
  id: number | string;
  label: string;
  sublabel?: string;
  entity: string;           // clé interne ("employes", "transactions", …)
  entityLabel: string;      // libellé lisible ("Employés", "Transactions", …)
  emoji: string;
  deletedAt: string;        // ISO date
  societeId: string;
}

/**
 * Requête générique pour lister les éléments supprimés d'une table.
 * `labelFields` : colonnes à sélectionner pour construire le libellé.
 */
export async function fetchDeleted<T extends Record<string, unknown>>(
  table: TableName,
  societeId: string,
  selectFields: string,
): Promise<(T & { id: number | string; deleted_at: string })[]> {
  const { data, error } = await supabase
    .from(table as never)
    .select(selectFields)
    .eq("societe_id", societeId)
    .not("deleted_at" as never, "is", null)
    .order("deleted_at" as never, { ascending: false });

  if (error) {
    // Colonne absente → corbeille vide
    if (error.code === "42703") return [];
    throw error;
  }
  return (data ?? []) as (T & { id: number | string; deleted_at: string })[];
}
