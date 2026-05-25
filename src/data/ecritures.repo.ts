/**
 * ecritures.repo.ts — Couche d'accès Supabase pour la table `ecritures_comptables`.
 *
 * Mapping TS ↔ DB :
 *   EcritureComptable.journal     ↔ journal
 *   EcritureComptable.numeroPiece ↔ numero_piece
 *   EcritureComptable.lignes      ↔ lignes (jsonb)
 *   EcritureComptable.creePar     ↔ cree_par
 *   EcritureComptable.validepar   ↔ valide_par
 *   EcritureComptable.motifRejet  ↔ motif_rejet
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import type {
  EcritureComptable,
  LigneEcriture,
  CodeJournal,
  StatutEcriture,
} from "@/types/ebene";

type EcritureRow = Tables<"ecritures_comptables">;

const n = <T>(v: T | null | undefined): T | undefined =>
  v == null ? undefined : v;

export const toEcriture = (row: EcritureRow): EcritureComptable => ({
  id: row.id,
  journal: row.journal as CodeJournal,
  numeroPiece: row.numero_piece,
  libelle: row.libelle,
  lignes: (row.lignes as LigneEcriture[]) ?? [],
  statut: row.statut as StatutEcriture,
  factureId: n(row.facture_id),
  bulletinId: n(row.bulletin_id),
  creePar: n(row.cree_par),
  validepar: n(row.valide_par),
  motifRejet: n(row.motif_rejet),
  pieceJointe: n(row.piece_jointe),
  pieceJointeNom: n(row.piece_jointe_nom),
  pieceJointeType: n(row.piece_jointe_type),
  annee: row.annee,
  mois: row.mois,
});

export const fromEcriture = (
  e: Omit<EcritureComptable, "id">,
  annee: number,
  mois: number,
  societeId: string,
): TablesInsert<"ecritures_comptables"> => ({
  societe_id: societeId,
  annee: e.annee ?? annee,
  mois: e.mois ?? mois,
  journal: e.journal,
  numero_piece: e.numeroPiece,
  libelle: e.libelle,
  lignes: e.lignes as never,
  statut: e.statut ?? "brouillon",
  facture_id: e.factureId ?? null,
  bulletin_id: e.bulletinId ?? null,
  cree_par: e.creePar ?? null,
  valide_par: e.validepar ?? null,
  motif_rejet: e.motifRejet ?? null,
  piece_jointe: e.pieceJointe ?? null,
  piece_jointe_nom: e.pieceJointeNom ?? null,
  piece_jointe_type: e.pieceJointeType ?? null,
});

export const ecritures = {
  /** Charge TOUTES les écritures actives, groupées par moisKey ("YYYY-M"). */
  async listAll(societeId: string): Promise<Record<string, EcritureComptable[]>> {
    const { data, error } = await supabase
      .from("ecritures_comptables")
      .select("*")
      .eq("societe_id", societeId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const result: Record<string, EcritureComptable[]> = {};
    for (const row of (data ?? []) as EcritureRow[]) {
      const key = `${row.annee}-${row.mois}`;
      if (!result[key]) result[key] = [];
      result[key].push(toEcriture(row));
    }
    return result;
  },

  async create(
    e: Omit<EcritureComptable, "id">,
    annee: number,
    mois: number,
    societeId: string,
  ): Promise<EcritureComptable> {
    const { data, error } = await supabase
      .from("ecritures_comptables")
      .insert(fromEcriture(e, annee, mois, societeId))
      .select()
      .single();
    if (error) throw error;
    return toEcriture(data as EcritureRow);
  },

  async update(
    id: number,
    patch: Partial<Pick<EcritureComptable, "statut" | "motifRejet" | "validepar" | "lignes" | "libelle">>,
    societeId: string,
  ): Promise<void> {
    const { error } = await supabase
      .from("ecritures_comptables")
      .update({
        ...(patch.statut      !== undefined && { statut: patch.statut }),
        ...(patch.motifRejet  !== undefined && { motif_rejet: patch.motifRejet ?? null }),
        ...(patch.validepar   !== undefined && { valide_par: patch.validepar ?? null }),
        ...(patch.lignes      !== undefined && { lignes: patch.lignes as never }),
        ...(patch.libelle     !== undefined && { libelle: patch.libelle }),
      })
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },

  async remove(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("ecritures_comptables")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
