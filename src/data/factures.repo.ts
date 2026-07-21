/**
 * factures.repo.ts — Couche d'accès Supabase pour la table `factures`.
 *
 * `lignes` est stocké en Json en DB → sérialisé/désérialisé dans les mappers.
 */
import { supabase } from "@/integrations/supabase/client";
import { softRemove } from "@/lib/softDelete";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import type {
  Facture,
  StatutFacture,
  StatutValidation,
  LignePrestation,
  ActiviteType,
} from "@/types/ebene";

type FactureRow = Tables<"factures">;

const n = <T>(v: T | null | undefined): T | undefined =>
  v == null ? undefined : v;

const parseLignes = (raw: unknown): LignePrestation[] => {
  if (Array.isArray(raw)) return raw as LignePrestation[];
  return [];
};

export const toFacture = (row: FactureRow): Facture => ({
  id: row.id,
  numero: row.numero,
  client: row.client,
  date: row.date,
  lignes: parseLignes(row.lignes),
  reduction: row.reduction ?? 0,
  avecTva: row.avec_tva ?? false,
  statut: row.statut as StatutFacture,
  transactionId: n(row.transaction_id),
  totalHT: row.total_ht,
  totalTva: row.total_tva,
  totalTtc: row.total_ttc,
  activite: n(row.activite) as ActiviteType | undefined,
  activiteId: n(row.activite_id),
  statutValidation: n(row.statut_validation) as StatutValidation | undefined,
  motifRejet: n(row.motif_rejet),
  annee: row.annee,
  mois: row.mois,
});

export const fromFacture = (
  f: Omit<Facture, "id">,
  annee: number,
  mois: number,
  societeId: string,
): TablesInsert<"factures"> => ({
  societe_id: societeId,
  annee,
  mois,
  numero: f.numero,
  client: f.client,
  date: f.date,
  lignes: f.lignes as unknown as TablesInsert<"factures">["lignes"],
  reduction: f.reduction ?? 0,
  avec_tva: f.avecTva,
  statut: f.statut,
  transaction_id: f.transactionId ?? null,
  total_ht: f.totalHT,
  total_tva: f.totalTva,
  total_ttc: f.totalTtc,
  activite: f.activite ?? null,
  activite_id: f.activiteId ?? null,
  statut_validation: f.statutValidation ?? "en_validation",
  motif_rejet: f.motifRejet ?? null,
});

export const factures = {
  /** Charge TOUTES les factures actives, groupées par moisKey ("YYYY-M"). */
  async listAll(societeId: string): Promise<Record<string, Facture[]>> {
    const { data, error } = await supabase
      .from("factures")
      .select("*")
      .eq("societe_id", societeId)
      .is("deleted_at" as never, null)
      .order("date", { ascending: false });
    if (error) {
      if (error.code === "42703") {
        const fb = await supabase.from("factures").select("*")
          .eq("societe_id", societeId).order("date", { ascending: false });
        if (fb.error) throw fb.error;
        const result2: Record<string, Facture[]> = {};
        for (const row of (fb.data ?? []) as FactureRow[]) {
          const key = `${row.annee}-${row.mois}`;
          if (!result2[key]) result2[key] = [];
          result2[key].push(toFacture(row));
        }
        return result2;
      }
      throw error;
    }
    const result: Record<string, Facture[]> = {};
    for (const row of (data ?? []) as FactureRow[]) {
      const key = `${row.annee}-${row.mois}`;
      if (!result[key]) result[key] = [];
      result[key].push(toFacture(row));
    }
    return result;
  },

  async create(
    f: Omit<Facture, "id">,
    annee: number,
    mois: number,
    societeId: string,
  ): Promise<Facture> {
    const { data, error } = await supabase
      .from("factures")
      .insert(fromFacture(f, annee, mois, societeId))
      .select()
      .single();
    if (error) throw error;
    return toFacture(data as FactureRow);
  },

  async update(
    id: number,
    patch: Partial<
      Pick<
        Facture,
        | "statut"
        | "transactionId"
        | "statutValidation"
        | "motifRejet"
        | "numero"
        | "lignes"
        | "reduction"
        | "avecTva"
        | "totalHT"
        | "totalTva"
        | "totalTtc"
        | "activiteId"
      >
    >,
    societeId: string,
  ): Promise<void> {
    const { error } = await supabase
      .from("factures")
      .update({
        ...(patch.statut !== undefined && { statut: patch.statut }),
        ...(patch.transactionId !== undefined && {
          transaction_id: patch.transactionId ?? null,
        }),
        ...(patch.statutValidation !== undefined && {
          statut_validation: patch.statutValidation,
        }),
        ...(patch.motifRejet !== undefined && {
          motif_rejet: patch.motifRejet ?? null,
        }),
        ...(patch.numero !== undefined && { numero: patch.numero }),
        ...(patch.lignes !== undefined && {
          lignes: patch.lignes as unknown as TablesInsert<"factures">["lignes"],
        }),
        ...(patch.reduction !== undefined && { reduction: patch.reduction }),
        ...(patch.avecTva !== undefined && { avec_tva: patch.avecTva }),
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
    await softRemove("factures", id, societeId);
  },

  async restore(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("factures")
      .update({ deleted_at: null } as never)
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },

  async purge(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("factures")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
