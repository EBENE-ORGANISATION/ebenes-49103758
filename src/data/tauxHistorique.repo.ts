/**
 * tauxHistorique.repo.ts — Couche d'accès Supabase pour `taux_historique`.
 *
 * Mapping DB ↔ TS :
 *   is_taux          ↔ TauxFiscaux.is
 *   tva              ↔ tva
 *   imf_taux         ↔ imfTaux
 *   imf_min          ↔ imfMin
 *   patente_service  ↔ patenteService
 *   patente_commerce ↔ patenteCommerce
 *   cnss_sal         ↔ cnssSal
 *   cnss_emp         ↔ cnssEmp
 *   amu_sal          ↔ amuSal
 *   amu_emp          ↔ amuEmp
 *   activite_defaut  ↔ activiteDefaut
 *   date_effet       ↔ dateEffet
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import type { TauxFiscaux } from "@/types/ebene";

type TauxRow = Tables<"taux_historique">;

export const toTaux = (row: TauxRow): TauxFiscaux => ({
  dateEffet:       row.date_effet,
  tva:             row.tva,
  is:              row.is_taux,
  imfTaux:         row.imf_taux,
  imfMin:          row.imf_min,
  patenteService:  row.patente_service,
  patenteCommerce: row.patente_commerce,
  cnssSal:         row.cnss_sal,
  cnssEmp:         row.cnss_emp,
  amuSal:          row.amu_sal,
  amuEmp:          row.amu_emp,
  activiteDefaut:  (row.activite_defaut as "service" | "commerce") ?? "service",
});

export const fromTaux = (
  t: TauxFiscaux,
  societeId: string,
): TablesInsert<"taux_historique"> => ({
  societe_id:       societeId,
  date_effet:       t.dateEffet,
  tva:              t.tva,
  is_taux:          t.is,
  imf_taux:         t.imfTaux,
  imf_min:          t.imfMin,
  patente_service:  t.patenteService,
  patente_commerce: t.patenteCommerce,
  cnss_sal:         t.cnssSal,
  cnss_emp:         t.cnssEmp,
  amu_sal:          t.amuSal,
  amu_emp:          t.amuEmp,
  activite_defaut:  t.activiteDefaut,
});

export const tauxHistorique = {
  /** Charge tous les taux d'une société, triés par date_effet croissante. */
  async listAll(societeId: string): Promise<TauxFiscaux[]> {
    const { data, error } = await supabase
      .from("taux_historique")
      .select("*")
      .eq("societe_id", societeId)
      .order("date_effet", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toTaux);
  },

  /** Upsert un taux (contrainte UNIQUE societe_id + date_effet). */
  async upsert(t: TauxFiscaux, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("taux_historique")
      .upsert(fromTaux(t, societeId), {
        onConflict: "societe_id,date_effet",
      });
    if (error) throw error;
  },

  /** Upsert un lot de taux (utilisé lors de l'import JSON). */
  async upsertBatch(list: TauxFiscaux[], societeId: string): Promise<void> {
    if (!list.length) return;
    const { error } = await supabase
      .from("taux_historique")
      .upsert(list.map((t) => fromTaux(t, societeId)), {
        onConflict: "societe_id,date_effet",
      });
    if (error) throw error;
  },

  /** Supprime un taux identifié par sa date d'effet. */
  async remove(dateEffet: string, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("taux_historique")
      .delete()
      .eq("societe_id", societeId)
      .eq("date_effet", dateEffet);
    if (error) throw error;
  },
};
