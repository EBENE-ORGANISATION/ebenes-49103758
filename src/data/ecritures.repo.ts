/**
 * ecritures.repo.ts — Couche d'accès Supabase pour `ecritures_comptables`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate, Json } from "@/integrations/supabase/types";
import type {
  EcritureComptable,
  LigneEcriture,
  CodeJournal,
  StatutEcriture,
} from "@/types/ebene";

type Row = Tables<"ecritures_comptables">;

const n = <T>(v: T | null | undefined): T | undefined =>
  v == null ? undefined : v;

export const toEcriture = (row: Row): EcritureComptable => ({
  id: row.id,
  date: (row.lignes && (row.lignes as { _date?: string })._date) || "",
  journal: row.journal as CodeJournal,
  numeroPiece: row.numero_piece,
  libelle: row.libelle,
  lignes: Array.isArray(row.lignes)
    ? (row.lignes as unknown as LigneEcriture[])
    : ((row.lignes as { lignes?: LigneEcriture[] })?.lignes ?? []),
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

/** Stocke les lignes + la date dans le JSONB `lignes` pour préserver tout. */
const packLignes = (e: Omit<EcritureComptable, "id">): Json =>
  ({ _date: e.date, lignes: e.lignes }) as unknown as Json;

export const fromEcriture = (
  e: Omit<EcritureComptable, "id">,
  annee: number,
  mois: number,
  societeId: string,
): TablesInsert<"ecritures_comptables"> => ({
  societe_id: societeId,
  annee,
  mois,
  journal: e.journal,
  numero_piece: e.numeroPiece,
  libelle: e.libelle ?? "",
  lignes: packLignes(e),
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
  async listAll(societeId: string): Promise<Record<string, EcritureComptable[]>> {
    const { data, error } = await supabase
      .from("ecritures_comptables")
      .select("*")
      .eq("societe_id", societeId)
      .order("id", { ascending: true });
    if (error) throw error;
    const result: Record<string, EcritureComptable[]> = {};
    for (const row of (data ?? []) as Row[]) {
      const key = `${row.annee}-${row.mois}`;
      (result[key] ??= []).push(toEcriture(row));
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
    return toEcriture(data as Row);
  },

  async update(
    id: number,
    patch: Partial<EcritureComptable>,
    societeId: string,
  ): Promise<void> {
    const u: TablesUpdate<"ecritures_comptables"> = {};
    if (patch.statut !== undefined) u.statut = patch.statut;
    if (patch.motifRejet !== undefined) u.motif_rejet = patch.motifRejet ?? null;
    if (patch.validepar !== undefined) u.valide_par = patch.validepar ?? null;
    if (patch.libelle !== undefined) u.libelle = patch.libelle;
    if (patch.lignes !== undefined || patch.date !== undefined) {
      u.lignes = { _date: patch.date, lignes: patch.lignes } as unknown as Json;
    }
    const { error } = await supabase
      .from("ecritures_comptables")
      .update(u)
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