/**
 * absences.repo.ts — Couche d'accès Supabase pour la table `absences`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { Absence, TypeAbsence, StatutValidation } from "@/types/ebene";

type AbsenceRow = Tables<"absences">;

const n = <T>(v: T | null | undefined): T | undefined =>
  v == null ? undefined : v;

export const toAbsence = (row: AbsenceRow): Absence => ({
  id: row.id,
  employeId: row.employe_id,
  type: row.type as TypeAbsence,
  dateDebut: row.date_debut,
  dateFin: row.date_fin,
  jours: row.jours,
  motif: n(row.motif),
  statutValidation: n(row.statut_validation) as StatutValidation | undefined,
  motifRejet: n(row.motif_rejet),
});

export const fromAbsence = (
  a: Omit<Absence, "id">,
  annee: number,
  mois: number,
  societeId: string,
): TablesInsert<"absences"> => ({
  societe_id: societeId,
  employe_id: a.employeId,
  annee,
  mois,
  type: a.type,
  date_debut: a.dateDebut,
  date_fin: a.dateFin,
  jours: a.jours,
  motif: a.motif ?? null,
  statut_validation: a.statutValidation ?? "en_validation",
  motif_rejet: a.motifRejet ?? null,
});

export const absences = {
  /** Charge toutes les absences d'une société pour un mois donné. */
  async listByMois(
    societeId: string,
    annee: number,
    mois: number,
  ): Promise<Absence[]> {
    const { data, error } = await supabase
      .from("absences")
      .select("*")
      .eq("societe_id", societeId)
      .eq("annee", annee)
      .eq("mois", mois)
      .order("date_debut", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toAbsence);
  },

  async create(
    a: Omit<Absence, "id">,
    annee: number,
    mois: number,
    societeId: string,
  ): Promise<Absence> {
    const { data, error } = await supabase
      .from("absences")
      .insert(fromAbsence(a, annee, mois, societeId))
      .select()
      .single();
    if (error) throw error;
    return toAbsence(data);
  },

  async update(
    id: number,
    patch: Partial<Pick<Absence, "statutValidation" | "motifRejet" | "motif" | "jours">>,
    societeId: string,
  ): Promise<Absence> {
    const dbPatch: Partial<TablesUpdate<"absences">> = {
      ...(patch.statutValidation !== undefined && {
        statut_validation: patch.statutValidation ?? null,
      }),
      ...(patch.motifRejet !== undefined && { motif_rejet: patch.motifRejet ?? null }),
      ...(patch.motif !== undefined && { motif: patch.motif ?? null }),
      ...(patch.jours !== undefined && { jours: patch.jours }),
    };
    const { data, error } = await supabase
      .from("absences")
      .update(dbPatch)
      .eq("id", id)
      .eq("societe_id", societeId)
      .select()
      .single();
    if (error) throw error;
    return toAbsence(data);
  },

  async remove(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("absences")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
