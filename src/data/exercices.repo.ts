/**
 * exercices.repo.ts — Exercices comptables (statut, clôture, affectation) et
 * écritures d'à-nouveaux.
 */
import { supabase } from "@/integrations/supabase/client";
import type { EcritureComptable } from "@/types/ebene";
import { ecritures as ecrituresRepo } from "@/data/ecritures.repo";
import type { Affectation } from "@/lib/liasse/cloture";

export interface Exercice {
  annee: number;
  statut: "ouvert" | "cloture";
  dateCloture?: string | null;
  affectation?: Affectation;
}

export const exercicesRepo = {
  async list(societeId: string): Promise<Exercice[]> {
    const { data, error } = await supabase
      .from("exercices" as never)
      .select("annee, statut, date_cloture, affectation")
      .eq("societe_id", societeId);
    if (error) throw error;
    return ((data ?? []) as { annee: number; statut: "ouvert" | "cloture"; date_cloture: string | null; affectation: Affectation }[])
      .map((r) => ({ annee: r.annee, statut: r.statut, dateCloture: r.date_cloture, affectation: r.affectation }));
  },

  async definirStatut(societeId: string, annee: number, statut: "ouvert" | "cloture", affectation: Affectation = {}): Promise<void> {
    const { error } = await supabase.from("exercices" as never).upsert({
      societe_id: societeId,
      annee,
      statut,
      date_cloture: statut === "cloture" ? new Date().toISOString() : null,
      affectation,
    } as never, { onConflict: "societe_id,annee" });
    if (error) throw error;
  },

  /** Remplace l'écriture d'à-nouveaux d'un exercice (pièce AN-<année>). */
  async remplacerANouveaux(societeId: string, ecriture: Omit<EcritureComptable, "id">): Promise<void> {
    const { error } = await supabase
      .from("ecritures_comptables")
      .delete()
      .eq("societe_id", societeId)
      .eq("journal", "AN")
      .eq("numero_piece", ecriture.numeroPiece);
    if (error) throw error;
    await ecrituresRepo.create(ecriture, ecriture.annee!, ecriture.mois!, societeId);
  },
};
