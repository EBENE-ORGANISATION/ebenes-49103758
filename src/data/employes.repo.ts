/**
 * employes.repo.ts — Couche d'accès Supabase pour la table `employes`.
 * Gère le mapping bidirectionnel snake_case ↔ camelCase.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type {
  Employe,
  TypeContrat,
  CategorieProf,
  StatutValidation,
} from "@/types/ebene";

type EmployeRow = Tables<"employes">;

// null → undefined (le DB stocke null, le TS préfère undefined pour les optionnels)
const n = <T>(v: T | null | undefined): T | undefined =>
  v == null ? undefined : v;

/** Convertit une ligne DB en type métier `Employe`. */
export const toEmploye = (row: EmployeRow): Employe => ({
  id: row.id,
  nom: row.nom,
  poste: row.poste,
  salaire: row.salaire,
  situation: row.situation as "celibataire" | "marie",
  enfants: row.enfants,
  matricule: n(row.matricule),
  dateNaissance: n(row.date_naissance),
  lieuNaissance: n(row.lieu_naissance),
  sexe: n(row.sexe) as "M" | "F" | undefined,
  nationalite: n(row.nationalite),
  adresse: n(row.adresse),
  telephone: n(row.telephone),
  email: n(row.email),
  numCnss: n(row.num_cnss),
  cni: n(row.cni),
  typeContrat: n(row.type_contrat) as TypeContrat | undefined,
  dateEmbauche: n(row.date_embauche),
  dateFinContrat: n(row.date_fin_contrat),
  categorie: n(row.categorie) as CategorieProf | undefined,
  echelon: n(row.echelon),
  qualification: n(row.qualification),
  indemniteTransport: n(row.indemnite_transport),
  indemniteLogement: n(row.indemnite_logement),
  indemniteFonction: n(row.indemnite_fonction),
  sursalaire: n(row.sursalaire),
  soldeConges: n(row.solde_conges),
  userId: n(row.user_id),
  statutValidation: n(row.statut_validation) as StatutValidation | undefined,
  motifRejet: n(row.motif_rejet),
});

/** Convertit un objet `Employe` partiel en payload d'insertion Supabase. */
export const fromEmploye = (
  e: Omit<Employe, "id">,
  societeId: string,
): TablesInsert<"employes"> => ({
  societe_id: societeId,
  nom: e.nom,
  poste: e.poste,
  salaire: e.salaire,
  situation: e.situation,
  enfants: e.enfants,
  matricule: e.matricule ?? null,
  date_naissance: e.dateNaissance ?? null,
  lieu_naissance: e.lieuNaissance ?? null,
  sexe: e.sexe ?? null,
  nationalite: e.nationalite ?? null,
  adresse: e.adresse ?? null,
  telephone: e.telephone ?? null,
  email: e.email ?? null,
  num_cnss: e.numCnss ?? null,
  cni: e.cni ?? null,
  type_contrat: e.typeContrat ?? null,
  date_embauche: e.dateEmbauche ?? null,
  date_fin_contrat: e.dateFinContrat ?? null,
  categorie: e.categorie ?? null,
  echelon: e.echelon ?? null,
  qualification: e.qualification ?? null,
  indemnite_transport: e.indemniteTransport ?? null,
  indemnite_logement: e.indemniteLogement ?? null,
  indemnite_fonction: e.indemniteFonction ?? null,
  sursalaire: e.sursalaire ?? null,
  solde_conges: e.soldeConges ?? null,
  user_id: e.userId ?? null,
  statut_validation: e.statutValidation ?? null,
  motif_rejet: e.motifRejet ?? null,
});

// ─── CRUD ────────────────────────────────────────────────────────────────────

export const employes = {
  /** Charge tous les employés d'une société. */
  async list(societeId: string): Promise<Employe[]> {
    const { data, error } = await supabase
      .from("employes")
      .select("*")
      .eq("societe_id", societeId)
      .order("nom", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toEmploye);
  },

  /** Crée un employé et retourne l'entité complète (avec id généré). */
  async create(e: Omit<Employe, "id">, societeId: string): Promise<Employe> {
    const { data, error } = await supabase
      .from("employes")
      .insert(fromEmploye(e, societeId))
      .select()
      .single();
    if (error) throw error;
    return toEmploye(data);
  },

  /** Met à jour un employé et retourne l'entité mise à jour. */
  async update(
    id: number,
    patch: Partial<Omit<Employe, "id">>,
    societeId: string,
  ): Promise<Employe> {
    // On ne met à jour que les champs fournis (partial update).
    const dbPatch: Partial<TablesUpdate<"employes">> = {
      ...(patch.nom !== undefined && { nom: patch.nom }),
      ...(patch.poste !== undefined && { poste: patch.poste }),
      ...(patch.salaire !== undefined && { salaire: patch.salaire }),
      ...(patch.situation !== undefined && { situation: patch.situation }),
      ...(patch.enfants !== undefined && { enfants: patch.enfants }),
      ...(patch.matricule !== undefined && { matricule: patch.matricule ?? null }),
      ...(patch.dateNaissance !== undefined && {
        date_naissance: patch.dateNaissance ?? null,
      }),
      ...(patch.lieuNaissance !== undefined && {
        lieu_naissance: patch.lieuNaissance ?? null,
      }),
      ...(patch.sexe !== undefined && { sexe: patch.sexe ?? null }),
      ...(patch.nationalite !== undefined && { nationalite: patch.nationalite ?? null }),
      ...(patch.adresse !== undefined && { adresse: patch.adresse ?? null }),
      ...(patch.telephone !== undefined && { telephone: patch.telephone ?? null }),
      ...(patch.email !== undefined && { email: patch.email ?? null }),
      ...(patch.numCnss !== undefined && { num_cnss: patch.numCnss ?? null }),
      ...(patch.cni !== undefined && { cni: patch.cni ?? null }),
      ...(patch.typeContrat !== undefined && { type_contrat: patch.typeContrat ?? null }),
      ...(patch.dateEmbauche !== undefined && {
        date_embauche: patch.dateEmbauche ?? null,
      }),
      ...(patch.dateFinContrat !== undefined && {
        date_fin_contrat: patch.dateFinContrat ?? null,
      }),
      ...(patch.categorie !== undefined && { categorie: patch.categorie ?? null }),
      ...(patch.echelon !== undefined && { echelon: patch.echelon ?? null }),
      ...(patch.qualification !== undefined && { qualification: patch.qualification ?? null }),
      ...(patch.indemniteTransport !== undefined && {
        indemnite_transport: patch.indemniteTransport ?? null,
      }),
      ...(patch.indemniteLogement !== undefined && {
        indemnite_logement: patch.indemniteLogement ?? null,
      }),
      ...(patch.indemniteFonction !== undefined && {
        indemnite_fonction: patch.indemniteFonction ?? null,
      }),
      ...(patch.sursalaire !== undefined && { sursalaire: patch.sursalaire ?? null }),
      ...(patch.soldeConges !== undefined && { solde_conges: patch.soldeConges ?? null }),
      ...(patch.userId !== undefined && { user_id: patch.userId ?? null }),
      ...(patch.statutValidation !== undefined && {
        statut_validation: patch.statutValidation ?? null,
      }),
      ...(patch.motifRejet !== undefined && { motif_rejet: patch.motifRejet ?? null }),
    };
    const { data, error } = await supabase
      .from("employes")
      .update(dbPatch)
      .eq("id", id)
      .eq("societe_id", societeId)
      .select()
      .single();
    if (error) throw error;
    return toEmploye(data);
  },

  /** Supprime un employé (RLS garantit l'accès société). */
  async remove(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("employes")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
