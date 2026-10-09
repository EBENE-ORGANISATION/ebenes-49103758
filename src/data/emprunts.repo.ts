/**
 * emprunts.repo.ts — Emprunts de la société (table `emprunts`) : échéancier,
 * garanties ; les écritures sont passées dans `ecritures_comptables`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Emprunt, Garantie, Periodicite } from "@/lib/liasse/emprunts";

interface EmpruntRow {
  id: number;
  preteur: string;
  objet: string | null;
  montant: number;
  taux_annuel: number;
  duree_mois: number;
  periodicite: Periodicite;
  date_deblocage: string;
  compte: string;
  tresorerie: "521" | "571";
  garantie: Garantie | null;
  montant_garanti: number | null;
  activite_id: string | null;
}

const versEmprunt = (r: EmpruntRow): Emprunt => ({
  id: r.id,
  preteur: r.preteur,
  objet: r.objet,
  montant: Number(r.montant),
  tauxAnnuel: Number(r.taux_annuel),
  dureeMois: r.duree_mois,
  periodicite: r.periodicite,
  dateDeblocage: r.date_deblocage,
  compte: r.compte,
  tresorerie: r.tresorerie,
  garantie: r.garantie,
  montantGaranti: r.montant_garanti == null ? null : Number(r.montant_garanti),
  activiteId: r.activite_id,
});

export const empruntsRepo = {
  async list(societeId: string): Promise<Emprunt[]> {
    const { data, error } = await supabase
      .from("emprunts" as never)
      .select("*")
      .eq("societe_id", societeId)
      .is("deleted_at", null)
      .order("date_deblocage");
    if (error) throw error;
    return ((data ?? []) as EmpruntRow[]).map(versEmprunt);
  },

  async create(societeId: string, e: Omit<Emprunt, "id">): Promise<Emprunt> {
    const { data, error } = await supabase
      .from("emprunts" as never)
      .insert({
        societe_id: societeId,
        preteur: e.preteur,
        objet: e.objet ?? null,
        montant: e.montant,
        taux_annuel: e.tauxAnnuel,
        duree_mois: e.dureeMois,
        periodicite: e.periodicite,
        date_deblocage: e.dateDeblocage,
        compte: e.compte,
        tresorerie: e.tresorerie,
        garantie: e.garantie ?? null,
        montant_garanti: e.montantGaranti ?? null,
        activite_id: e.activiteId ?? null,
      } as never)
      .select()
      .single();
    if (error) throw error;
    return versEmprunt(data as EmpruntRow);
  },

  /** Mise à la corbeille (les écritures déjà passées restent). */
  async remove(id: number): Promise<void> {
    const { error } = await supabase
      .from("emprunts" as never)
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (error) throw error;
  },
};
