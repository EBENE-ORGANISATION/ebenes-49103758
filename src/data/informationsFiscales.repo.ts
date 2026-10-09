/**
 * informationsFiscales.repo.ts — Informations annuelles des états financiers
 * (réintégrations, déductions, hors bilan…), une ligne par société et exercice.
 */
import { supabase } from "@/integrations/supabase/client";
import type { InformationsFiscales } from "@/lib/liasse/resultatFiscal";

export const informationsFiscalesRepo = {
  async get(societeId: string, annee: number): Promise<InformationsFiscales> {
    const { data, error } = await supabase
      .from("informations_fiscales" as never)
      .select("donnees")
      .eq("societe_id", societeId)
      .eq("annee", annee)
      .maybeSingle();
    if (error) throw error;
    return ((data as { donnees?: InformationsFiscales } | null)?.donnees ?? {}) as InformationsFiscales;
  },

  async enregistrer(societeId: string, annee: number, donnees: InformationsFiscales): Promise<void> {
    const { error } = await supabase
      .from("informations_fiscales" as never)
      .upsert({ societe_id: societeId, annee, donnees, updated_at: new Date().toISOString() } as never, { onConflict: "societe_id,annee" });
    if (error) throw error;
  },
};
