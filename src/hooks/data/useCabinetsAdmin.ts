import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { callSuperAdmin } from "@/lib/superAdminApi";
import { cabinetOps } from "@/lib/cabinetOps";
import { useAuth } from "@/hooks/useAuth";
import { messageErreur } from "@/lib/ebene-utils";
import { toast } from "sonner";

export interface CompteCabinetAdmin {
  id: string;
  email: string | null;
  profile: { nom: string | null } | null;
  roles: string[];
  societes: { societe_id: string }[];
}

/** Toutes les pages sont nécessaires pour ne pas manquer un administrateur ou un double accès. */
export async function lireComptesCabinets() {
  const comptes: CompteCabinetAdmin[] = [];
  for (let page = 1; ; page++) {
    const resultat = await callSuperAdmin<{ users: CompteCabinetAdmin[] }>("list_users", { page, perPage: 200 });
    comptes.push(...resultat.users);
    if (resultat.users.length < 200) return comptes;
  }
}

export function useCabinetsAdmin() {
  const { user, isSuperAdmin } = useAuth();
  const cache = useQueryClient();
  const lecture = useQuery({
    queryKey: ["cabinets_admin", user?.id], enabled: !!user && isSuperAdmin,
    staleTime: 0, refetchInterval: 30_000, refetchOnMount: "always",
    queryFn: async () => {
      const [cabinets, dossiers, societes, comptes] = await Promise.all([
        supabase.from("cabinets").select("*"), supabase.from("cabinet_dossiers").select("*"),
        supabase.from("societes").select("id, nom"), lireComptesCabinets(),
      ]);
      for (const resultat of [cabinets, dossiers, societes]) if (resultat.error) throw resultat.error;
      const equipes = await Promise.all((cabinets.data ?? []).map(async cabinet => ({ cabinetId: cabinet.id, membres: await cabinetOps.equipe(cabinet.id) })));
      return { cabinets: cabinets.data ?? [], dossiers: dossiers.data ?? [], societes: societes.data ?? [], comptes, equipes };
    },
  });
  const mutation = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => { await Promise.all(["cabinets_admin", "cabinet_client", "cabinet", "dossiers_cabinet", "societes", "acces_directs"].map(cle => cache.invalidateQueries({ queryKey: [cle] }))); },
    onError: erreur => toast.error(messageErreur(erreur, "L’opération a échoué.")),
  });
  return { donnees: isSuperAdmin && !lecture.isError ? lecture.data : undefined, erreur: lecture.isError, chargement: lecture.isPending, executer: mutation.mutateAsync, enCours: mutation.isPending };
}
