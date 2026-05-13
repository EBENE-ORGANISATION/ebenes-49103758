/**
 * fournisseurs.repo.ts — Couche d'accès Supabase pour la table `fournisseurs`.
 */
import { supabase } from "@/integrations/supabase/client";
import { softRemove } from "@/lib/softDelete";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { Fournisseur } from "@/types/ebene";

type FournisseurRow = Tables<"fournisseurs">;

const n = <T>(v: T | null | undefined): T | undefined =>
  v == null ? undefined : v;

export const toFournisseur = (row: FournisseurRow): Fournisseur => ({
  id: row.id,
  nom: row.nom,
  contact: n(row.contact),
  telephone: n(row.telephone),
  email: n(row.email),
  adresse: n(row.adresse),
});

export const fromFournisseur = (
  f: Omit<Fournisseur, "id">,
  societeId: string,
): TablesInsert<"fournisseurs"> => ({
  societe_id: societeId,
  nom: f.nom,
  contact: f.contact ?? null,
  telephone: f.telephone ?? null,
  email: f.email ?? null,
  adresse: f.adresse ?? null,
});

export const fournisseurs = {
  async list(societeId: string): Promise<Fournisseur[]> {
    const { data, error } = await supabase
      .from("fournisseurs")
      .select("*")
      .eq("societe_id", societeId)
      .is("deleted_at" as never, null)
      .order("nom", { ascending: true });
    if (error) {
      if (error.code === "42703") {
        const fb = await supabase.from("fournisseurs").select("*")
          .eq("societe_id", societeId).order("nom");
        if (fb.error) throw fb.error;
        return (fb.data ?? []).map(toFournisseur);
      }
      throw error;
    }
    return (data ?? []).map(toFournisseur);
  },

  async create(
    f: Omit<Fournisseur, "id">,
    societeId: string,
  ): Promise<Fournisseur> {
    const { data, error } = await supabase
      .from("fournisseurs")
      .insert(fromFournisseur(f, societeId))
      .select()
      .single();
    if (error) throw error;
    return toFournisseur(data);
  },

  async update(
    id: number,
    patch: Partial<Omit<Fournisseur, "id">>,
    societeId: string,
  ): Promise<Fournisseur> {
    const dbPatch: Partial<TablesUpdate<"fournisseurs">> = {
      ...(patch.nom !== undefined && { nom: patch.nom }),
      ...(patch.contact !== undefined && { contact: patch.contact ?? null }),
      ...(patch.telephone !== undefined && { telephone: patch.telephone ?? null }),
      ...(patch.email !== undefined && { email: patch.email ?? null }),
      ...(patch.adresse !== undefined && { adresse: patch.adresse ?? null }),
    };
    const { data, error } = await supabase
      .from("fournisseurs")
      .update(dbPatch)
      .eq("id", id)
      .eq("societe_id", societeId)
      .select()
      .single();
    if (error) throw error;
    return toFournisseur(data);
  },

  async remove(id: number, societeId: string): Promise<void> {
    await softRemove("fournisseurs", id, societeId);
  },

  async restore(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("fournisseurs")
      .update({ deleted_at: null } as never)
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },

  async purge(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("fournisseurs")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
