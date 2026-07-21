/**
 * devis.repo.ts — Couche d'accès Supabase pour la table `devis`.
 *
 * `lignes` est stocké en Json en DB → sérialisé/désérialisé dans les mappers.
 */
import { supabase } from "@/integrations/supabase/client";
import { softRemove } from "@/lib/softDelete";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import type {
  Devis,
  StatutDevis,
  LignePrestation,
  ActiviteType,
} from "@/types/ebene";

type DevisRow = Tables<"devis">;

const n = <T>(v: T | null | undefined): T | undefined =>
  v == null ? undefined : v;

const parseLignes = (raw: unknown): LignePrestation[] => {
  if (Array.isArray(raw)) return raw as LignePrestation[];
  return [];
};

export const toDevis = (row: DevisRow): Devis => ({
  id: row.id,
  numero: row.numero,
  client: row.client,
  date: row.date,
  dateValidite: n(row.date_validite),
  lignes: parseLignes(row.lignes),
  reduction: row.reduction ?? 0,
  avecTva: row.avec_tva ?? false,
  statut: row.statut as StatutDevis,
  totalHT: row.total_ht,
  totalTva: row.total_tva,
  totalTtc: row.total_ttc,
  activite: n(row.activite) as ActiviteType | undefined,
  activiteId: n(row.activite_id),
  factureId: n(row.facture_id),
  notes: n(row.notes),
  annee: row.annee,
  mois: row.mois,
});

export const fromDevis = (
  d: Omit<Devis, "id">,
  annee: number,
  mois: number,
  societeId: string,
): TablesInsert<"devis"> => ({
  societe_id: societeId,
  annee,
  mois,
  numero: d.numero,
  client: d.client,
  date: d.date,
  date_validite: d.dateValidite ?? null,
  lignes: d.lignes as unknown as TablesInsert<"devis">["lignes"],
  reduction: d.reduction ?? 0,
  avec_tva: d.avecTva,
  statut: d.statut ?? "envoye",
  total_ht: d.totalHT,
  total_tva: d.totalTva,
  total_ttc: d.totalTtc,
  activite: d.activite ?? null,
  activite_id: d.activiteId ?? null,
  facture_id: d.factureId ?? null,
  notes: d.notes ?? null,
});

export const devis = {
  /** Charge TOUS les devis actifs, groupés par moisKey ("YYYY-M"). */
  async listAll(societeId: string): Promise<Record<string, Devis[]>> {
    const { data, error } = await supabase
      .from("devis")
      .select("*")
      .eq("societe_id", societeId)
      .is("deleted_at" as never, null)
      .order("date", { ascending: false });
    if (error) {
      if (error.code === "42703") {
        const fb = await supabase.from("devis").select("*")
          .eq("societe_id", societeId).order("date", { ascending: false });
        if (fb.error) throw fb.error;
        const result2: Record<string, Devis[]> = {};
        for (const row of (fb.data ?? []) as DevisRow[]) {
          const key = `${row.annee}-${row.mois}`;
          if (!result2[key]) result2[key] = [];
          result2[key].push(toDevis(row));
        }
        return result2;
      }
      throw error;
    }
    const result: Record<string, Devis[]> = {};
    for (const row of (data ?? []) as DevisRow[]) {
      const key = `${row.annee}-${row.mois}`;
      if (!result[key]) result[key] = [];
      result[key].push(toDevis(row));
    }
    return result;
  },

  async create(
    d: Omit<Devis, "id">,
    annee: number,
    mois: number,
    societeId: string,
  ): Promise<Devis> {
    const { data, error } = await supabase
      .from("devis")
      .insert(fromDevis(d, annee, mois, societeId))
      .select()
      .single();
    if (error) throw error;
    return toDevis(data as DevisRow);
  },

  async update(
    id: number,
    patch: Partial<
      Pick<Devis, "statut" | "factureId" | "notes" | "lignes" | "reduction" | "totalHT" | "totalTva" | "totalTtc" | "activiteId">
    >,
    societeId: string,
  ): Promise<void> {
    const { error } = await supabase
      .from("devis")
      .update({
        ...(patch.statut !== undefined && { statut: patch.statut }),
        ...(patch.factureId !== undefined && { facture_id: patch.factureId ?? null }),
        ...(patch.notes !== undefined && { notes: patch.notes ?? null }),
        ...(patch.lignes !== undefined && {
          lignes: patch.lignes as unknown as TablesInsert<"devis">["lignes"],
        }),
        ...(patch.reduction !== undefined && { reduction: patch.reduction }),
        ...(patch.totalHT !== undefined && { total_ht: patch.totalHT }),
        ...(patch.totalTva !== undefined && { total_tva: patch.totalTva }),
        ...(patch.totalTtc !== undefined && { total_ttc: patch.totalTtc }),
        ...(patch.activiteId !== undefined && { activite_id: patch.activiteId ?? null }),
      })
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },

  async remove(id: number, societeId: string): Promise<void> {
    await softRemove("devis", id, societeId);
  },

  async restore(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("devis")
      .update({ deleted_at: null } as never)
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },

  async purge(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("devis")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
