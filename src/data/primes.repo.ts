/**
 * primes.repo.ts — Couche d'accès Supabase pour la table `primes`.
 */
import { supabase } from "@/integrations/supabase/client";
import { softRemove } from "@/lib/softDelete";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { Prime, StatutValidation } from "@/types/ebene";

type PrimeRow = Tables<"primes">;

const n = <T>(v: T | null | undefined): T | undefined =>
  v == null ? undefined : v;

export const toPrime = (row: PrimeRow): Prime => ({
  id: row.id,
  libelle: row.libelle,
  montant: row.montant,
  statutValidation: n(row.statut_validation) as StatutValidation | undefined,
  motifRejet: n(row.motif_rejet),
  employeId: row.employe_id,
  annee: row.annee,
  mois: row.mois,
});

export const fromPrime = (
  p: Omit<Prime, "id">,
  employeId: number,
  annee: number,
  mois: number,
  societeId: string,
): TablesInsert<"primes"> => ({
  societe_id: societeId,
  employe_id: employeId,
  annee,
  mois,
  libelle: p.libelle,
  montant: p.montant,
  statut_validation: p.statutValidation ?? "en_validation",
  motif_rejet: p.motifRejet ?? null,
});

export const primes = {
  /**
   * Charge TOUTES les primes d'une société, groupées par moisKey puis employeId.
   * Utilisé par le hook TQ pour couvrir la navigation multi-mois.
   */
  async listAll(
    societeId: string,
  ): Promise<Record<string, Record<number, Prime[]>>> {
    const { data, error } = await supabase
      .from("primes")
      .select("*")
      .eq("societe_id", societeId)
      .is("deleted_at" as never, null)
      .order("created_at", { ascending: true });
    if (error) {
      if (error.code === "42703") {
        const fb = await supabase.from("primes").select("*")
          .eq("societe_id", societeId).order("created_at", { ascending: true });
        if (fb.error) throw fb.error;
        const result2: Record<string, Record<number, Prime[]>> = {};
        for (const row of (fb.data ?? []) as PrimeRow[]) {
          const key = `${row.annee}-${row.mois}`;
          if (!result2[key]) result2[key] = {};
          if (!result2[key][row.employe_id]) result2[key][row.employe_id] = [];
          result2[key][row.employe_id].push(toPrime(row));
        }
        return result2;
      }
      throw error;
    }
    const result: Record<string, Record<number, Prime[]>> = {};
    for (const row of (data ?? []) as PrimeRow[]) {
      const key = `${row.annee}-${row.mois}`;
      if (!result[key]) result[key] = {};
      if (!result[key][row.employe_id]) result[key][row.employe_id] = [];
      result[key][row.employe_id].push(toPrime(row));
    }
    return result;
  },

  /**
   * Charge les primes d'une société pour un mois, indexées par employeId.
   * Correspond à la structure `Record<number, Prime[]>` de MoisData.
   */
  async listByMois(
    societeId: string,
    annee: number,
    mois: number,
  ): Promise<Record<number, Prime[]>> {
    const { data, error } = await supabase
      .from("primes")
      .select("*")
      .eq("societe_id", societeId)
      .eq("annee", annee)
      .eq("mois", mois)
      .is("deleted_at" as never, null)
      .order("created_at", { ascending: true });
    if (error) {
      if (error.code === "42703") {
        const fb = await supabase.from("primes").select("*")
          .eq("societe_id", societeId).eq("annee", annee).eq("mois", mois)
          .order("created_at", { ascending: true });
        if (fb.error) throw fb.error;
        const r2: Record<number, Prime[]> = {};
        for (const row of fb.data ?? []) {
          if (!r2[row.employe_id]) r2[row.employe_id] = [];
          r2[row.employe_id].push(toPrime(row));
        }
        return r2;
      }
      throw error;
    }
    const result: Record<number, Prime[]> = {};
    for (const row of data ?? []) {
      if (!result[row.employe_id]) result[row.employe_id] = [];
      result[row.employe_id].push(toPrime(row));
    }
    return result;
  },

  async create(
    p: Omit<Prime, "id">,
    employeId: number,
    annee: number,
    mois: number,
    societeId: string,
  ): Promise<Prime> {
    const { data, error } = await supabase
      .from("primes")
      .insert(fromPrime(p, employeId, annee, mois, societeId))
      .select()
      .single();
    if (error) throw error;
    return toPrime(data);
  },

  async update(
    id: number,
    patch: Partial<Pick<Prime, "statutValidation" | "motifRejet" | "montant" | "libelle">>,
    societeId: string,
  ): Promise<Prime> {
    const dbPatch: Partial<TablesUpdate<"primes">> = {
      ...(patch.statutValidation !== undefined && {
        statut_validation: patch.statutValidation ?? null,
      }),
      ...(patch.motifRejet !== undefined && { motif_rejet: patch.motifRejet ?? null }),
      ...(patch.montant !== undefined && { montant: patch.montant }),
      ...(patch.libelle !== undefined && { libelle: patch.libelle }),
    };
    const { data, error } = await supabase
      .from("primes")
      .update(dbPatch)
      .eq("id", id)
      .eq("societe_id", societeId)
      .select()
      .single();
    if (error) throw error;
    return toPrime(data);
  },

  async remove(id: number, societeId: string): Promise<void> {
    await softRemove("primes", id, societeId);
  },

  async restore(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("primes")
      .update({ deleted_at: null } as never)
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },

  async purge(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("primes")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
