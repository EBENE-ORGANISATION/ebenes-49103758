/**
 * sanctions.repo.ts — Couche d'accès Supabase pour la table `sanctions`.
 * Table créée par la migration 20260512_relational_migration.sql.
 */
import { supabase } from "@/integrations/supabase/client";
import { softRemove } from "@/lib/softDelete";
import type { Sanction, TypeSanction, StatutValidation } from "@/types/ebene";

// Type interne (la table n'est pas encore dans les types auto-générés)
interface SanctionRow {
  id: number;
  societe_id: string;
  employe_id: number;
  date: string;
  type: string;
  motif: string;
  jours_mise_a_pied: number | null;
  observations: string | null;
  statut_validation: string | null;
  motif_rejet: string | null;
  created_at: string;
  updated_at: string;
}

const n = <T>(v: T | null | undefined): T | undefined =>
  v == null ? undefined : v;

export const toSanction = (row: SanctionRow): Sanction => ({
  id: row.id,
  employeId: row.employe_id,
  date: row.date,
  type: row.type as TypeSanction,
  motif: row.motif,
  joursMiseAPied: n(row.jours_mise_a_pied),
  observations: n(row.observations),
  statutValidation: n(row.statut_validation) as StatutValidation | undefined,
  motifRejet: n(row.motif_rejet),
});

export const fromSanction = (
  s: Omit<Sanction, "id">,
  societeId: string,
) => ({
  societe_id: societeId,
  employe_id: s.employeId,
  date: s.date,
  type: s.type,
  motif: s.motif,
  jours_mise_a_pied: s.joursMiseAPied ?? null,
  observations: s.observations ?? null,
  statut_validation: s.statutValidation ?? "valide",
  motif_rejet: s.motifRejet ?? null,
});

export const sanctions = {
  async list(societeId: string): Promise<Sanction[]> {
    const { data, error } = await supabase
      .from("sanctions")
      .select("*")
      .eq("societe_id", societeId)
      .is("deleted_at" as never, null)
      .order("date", { ascending: false });
    if (error) {
      if (error.code === "42703") {
        const fb = await supabase.from("sanctions").select("*")
          .eq("societe_id", societeId).order("date", { ascending: false });
        if (fb.error) throw fb.error;
        return ((fb.data ?? []) as SanctionRow[]).map(toSanction);
      }
      throw error;
    }
    return ((data ?? []) as SanctionRow[]).map(toSanction);
  },

  async create(s: Omit<Sanction, "id">, societeId: string): Promise<Sanction> {
    const { data, error } = await supabase
      .from("sanctions")
      .insert(fromSanction(s, societeId))
      .select()
      .single();
    if (error) throw error;
    return toSanction(data as SanctionRow);
  },

  async update(
    id: number,
    patch: Partial<Pick<Sanction, "statutValidation" | "motifRejet">>,
    societeId: string,
  ): Promise<void> {
    const { error } = await supabase
      .from("sanctions")
      .update({
        ...(patch.statutValidation !== undefined && {
          statut_validation: patch.statutValidation,
        }),
        ...(patch.motifRejet !== undefined && {
          motif_rejet: patch.motifRejet ?? null,
        }),
      })
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },

  async remove(id: number, societeId: string): Promise<void> {
    await softRemove("sanctions", id, societeId);
  },

  async restore(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("sanctions")
      .update({ deleted_at: null } as never)
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },

  async purge(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("sanctions")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
