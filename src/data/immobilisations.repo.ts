/**
 * immobilisations.repo.ts — Couche d'accès Supabase pour `immobilisations`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type {
  Immobilisation,
  CategorieImmo,
  MethodeAmortissement,
  ComptesSYSCOHADAImmo,
} from "@/types/ebene";
import { COMPTES_IMMO_DEFAUT } from "@/types/ebene";

type ImmoRow = Tables<"immobilisations">;

const n = <T>(v: T | null | undefined): T | undefined =>
  v == null ? undefined : v;

export const toImmobilisation = (row: ImmoRow): Immobilisation => ({
  id: row.id,
  libelle: row.libelle,
  categorie: n(row.categorie) as CategorieImmo | undefined,
  dateAcquisition: row.date_acquisition,
  valeurOrigine: row.valeur_origine,
  dureeAmortissement: row.duree_amortissement,
  methode: (row.methode as MethodeAmortissement) ?? "lineaire",
  comptesSYSCOHADA:
    (row.comptes_syscohada as unknown as ComptesSYSCOHADAImmo) ??
    (row.categorie ? COMPTES_IMMO_DEFAUT[row.categorie as CategorieImmo] : {
      actif: "21",
      amortissementCumule: "281",
      dotation: "6811",
    }),
  valeurResiduelle: n(row.valeur_residuelle),
  notes: n(row.notes),
  dateCession: n(row.date_cession),
});

export const fromImmobilisation = (
  immo: Omit<Immobilisation, "id">,
  societeId: string,
): TablesInsert<"immobilisations"> => ({
  societe_id: societeId,
  libelle: immo.libelle,
  categorie: immo.categorie ?? null,
  date_acquisition: immo.dateAcquisition,
  valeur_origine: immo.valeurOrigine,
  duree_amortissement: immo.dureeAmortissement,
  methode: immo.methode,
  comptes_syscohada: immo.comptesSYSCOHADA as unknown as
    TablesInsert<"immobilisations">["comptes_syscohada"],
  valeur_residuelle: immo.valeurResiduelle ?? null,
  notes: immo.notes ?? null,
  date_cession: immo.dateCession ?? null,
});

export const immobilisations = {
  async list(societeId: string): Promise<Immobilisation[]> {
    const { data, error } = await supabase
      .from("immobilisations")
      .select("*")
      .eq("societe_id", societeId)
      .order("libelle", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toImmobilisation);
  },

  async create(
    immo: Omit<Immobilisation, "id">,
    societeId: string,
  ): Promise<Immobilisation> {
    const { data, error } = await supabase
      .from("immobilisations")
      .insert(fromImmobilisation(immo, societeId))
      .select()
      .single();
    if (error) throw error;
    return toImmobilisation(data);
  },

  async update(
    id: number,
    patch: Partial<Omit<Immobilisation, "id">>,
    societeId: string,
  ): Promise<Immobilisation> {
    const dbPatch: Partial<TablesUpdate<"immobilisations">> = {
      ...(patch.libelle !== undefined && { libelle: patch.libelle }),
      ...(patch.categorie !== undefined && { categorie: patch.categorie ?? null }),
      ...(patch.dateAcquisition !== undefined && {
        date_acquisition: patch.dateAcquisition,
      }),
      ...(patch.valeurOrigine !== undefined && {
        valeur_origine: patch.valeurOrigine,
      }),
      ...(patch.dureeAmortissement !== undefined && {
        duree_amortissement: patch.dureeAmortissement,
      }),
      ...(patch.methode !== undefined && { methode: patch.methode }),
      ...(patch.comptesSYSCOHADA !== undefined && {
        comptes_syscohada:
          patch.comptesSYSCOHADA as unknown as TablesUpdate<"immobilisations">["comptes_syscohada"],
      }),
      ...(patch.valeurResiduelle !== undefined && {
        valeur_residuelle: patch.valeurResiduelle ?? null,
      }),
      ...(patch.notes !== undefined && { notes: patch.notes ?? null }),
      ...(patch.dateCession !== undefined && {
        date_cession: patch.dateCession ?? null,
      }),
    };
    const { data, error } = await supabase
      .from("immobilisations")
      .update(dbPatch)
      .eq("id", id)
      .eq("societe_id", societeId)
      .select()
      .single();
    if (error) throw error;
    return toImmobilisation(data);
  },

  async remove(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("immobilisations")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
