/**
 * transactions.repo.ts — Couche d'accès Supabase pour la table `transactions`.
 *
 * Mapping TS ↔ DB :
 *   Transaction.desc  ↔ description
 *   Transaction.m     ↔ montant
 *   Transaction.statut ↔ statut
 */
import { supabase } from "@/integrations/supabase/client";
import { softRemove } from "@/lib/softDelete";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import type {
  Transaction,
  TransactionType,
  TransactionSource,
  StatutValidation,
  ActiviteType,
} from "@/types/ebene";

type TransactionRow = Tables<"transactions">;

const n = <T>(v: T | null | undefined): T | undefined =>
  v == null ? undefined : v;

export const toTransaction = (row: TransactionRow): Transaction => ({
  id: row.id,
  date: row.date,
  desc: row.description,
  type: row.type as TransactionType,
  m: row.montant,
  source: row.source as TransactionSource,
  factureId: n(row.facture_id),
  activite: n(row.activite) as ActiviteType | undefined,
  pieceJointe: n(row.piece_jointe),
  pieceJointeNom: n(row.piece_jointe_nom),
  pieceJointeType: n(row.piece_jointe_type),
  fournisseur: n(row.fournisseur),
  auto: row.auto ?? false,
  statut: n(row.statut) as StatutValidation | undefined,
  motifRejet: n(row.motif_rejet),
  annee: row.annee,
  mois: row.mois,
});

export const fromTransaction = (
  t: Omit<Transaction, "id">,
  annee: number,
  mois: number,
  societeId: string,
): TablesInsert<"transactions"> => ({
  societe_id: societeId,
  annee,
  mois,
  date: t.date,
  description: t.desc,
  type: t.type,
  montant: t.m,
  source: t.source ?? "manuelle",
  facture_id: t.factureId ?? null,
  activite: t.activite ?? null,
  piece_jointe: t.pieceJointe ?? null,
  piece_jointe_nom: t.pieceJointeNom ?? null,
  piece_jointe_type: t.pieceJointeType ?? null,
  fournisseur: t.fournisseur ?? null,
  auto: t.auto ?? false,
  statut: t.statut ?? "en_validation",
  motif_rejet: t.motifRejet ?? null,
});

export const transactions = {
  /** Charge TOUTES les transactions actives, groupées par moisKey ("YYYY-M"). */
  async listAll(societeId: string): Promise<Record<string, Transaction[]>> {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("societe_id", societeId)
      .is("deleted_at" as never, null)
      .order("date", { ascending: false });
    if (error) {
      if (error.code === "42703") {
        const fb = await supabase.from("transactions").select("*")
          .eq("societe_id", societeId).order("date", { ascending: false });
        if (fb.error) throw fb.error;
        const result2: Record<string, Transaction[]> = {};
        for (const row of (fb.data ?? []) as TransactionRow[]) {
          const key = `${row.annee}-${row.mois}`;
          if (!result2[key]) result2[key] = [];
          result2[key].push(toTransaction(row));
        }
        return result2;
      }
      throw error;
    }
    const result: Record<string, Transaction[]> = {};
    for (const row of (data ?? []) as TransactionRow[]) {
      const key = `${row.annee}-${row.mois}`;
      if (!result[key]) result[key] = [];
      result[key].push(toTransaction(row));
    }
    return result;
  },

  async create(
    t: Omit<Transaction, "id">,
    annee: number,
    mois: number,
    societeId: string,
  ): Promise<Transaction> {
    const { data, error } = await supabase
      .from("transactions")
      .insert(fromTransaction(t, annee, mois, societeId))
      .select()
      .single();
    if (error) throw error;
    return toTransaction(data as TransactionRow);
  },

  async update(
    id: number,
    patch: Partial<Pick<Transaction, "statut" | "motifRejet" | "factureId">>,
    societeId: string,
  ): Promise<void> {
    const { error } = await supabase
      .from("transactions")
      .update({
        ...(patch.statut !== undefined && { statut: patch.statut }),
        ...(patch.motifRejet !== undefined && { motif_rejet: patch.motifRejet ?? null }),
        ...(patch.factureId !== undefined && { facture_id: patch.factureId ?? null }),
      })
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },

  async remove(id: number, societeId: string): Promise<void> {
    await softRemove("transactions", id, societeId);
  },

  async restore(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("transactions")
      .update({ deleted_at: null } as never)
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },

  async purge(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
