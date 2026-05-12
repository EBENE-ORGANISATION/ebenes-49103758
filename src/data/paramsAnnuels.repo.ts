/**
 * paramsAnnuels.repo.ts — Couche d'accès Supabase pour `params_annuels`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { ParamsAnnuels } from "@/types/ebene";

type ParamsRow = Tables<"params_annuels">;

const n = <T>(v: T | null | undefined): T | undefined =>
  v == null ? undefined : v;

export const toParamsAnnuels = (row: ParamsRow): ParamsAnnuels & { annee: number } => ({
  annee: row.annee,
  th: n(row.th),
  rsl: n(row.rsl),
  activite: n(row.activite) as "service" | "commerce" | undefined,
});

export const fromParamsAnnuels = (
  p: ParamsAnnuels,
  annee: number,
  societeId: string,
): TablesInsert<"params_annuels"> => ({
  societe_id: societeId,
  annee,
  th: p.th ?? null,
  rsl: p.rsl ?? null,
  activite: p.activite ?? null,
});

export const paramsAnnuels = {
  /** Charge tous les paramètres annuels d'une société (map indexée par année). */
  async listAll(societeId: string): Promise<Record<number, ParamsAnnuels>> {
    const { data, error } = await supabase
      .from("params_annuels")
      .select("*")
      .eq("societe_id", societeId);
    if (error) throw error;
    const result: Record<number, ParamsAnnuels> = {};
    for (const row of data ?? []) {
      const { annee, ...params } = toParamsAnnuels(row);
      result[annee] = params;
    }
    return result;
  },

  /** Charge les paramètres d'une année donnée (null si inexistants). */
  async getOne(
    societeId: string,
    annee: number,
  ): Promise<ParamsAnnuels | null> {
    const { data, error } = await supabase
      .from("params_annuels")
      .select("*")
      .eq("societe_id", societeId)
      .eq("annee", annee)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { annee: _a, ...params } = toParamsAnnuels(data);
    return params;
  },

  /** Upsert les paramètres d'une année (crée ou met à jour). */
  async upsert(
    p: ParamsAnnuels,
    annee: number,
    societeId: string,
  ): Promise<void> {
    const { error } = await supabase
      .from("params_annuels")
      .upsert(fromParamsAnnuels(p, annee, societeId), {
        onConflict: "societe_id,annee",
      });
    if (error) throw error;
  },
};
