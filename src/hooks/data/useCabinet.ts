import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { messageErreur } from "@/lib/ebene-utils";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

type Ligne<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type MembreCabinet = Ligne<"cabinet_membres"> & { nom: string };
export type DossierGestion = Ligne<"cabinet_dossiers"> & { nom: string };
export type AttributionCabinet = Ligne<"cabinet_attributions">;

/** Lecture bornée à l'appartenance, même si l'utilisateur administre aussi un client. */
export function useCabinet() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const requete = useQuery({
    queryKey: ["cabinet", user?.id], enabled: !!user, staleTime: 0,
    refetchInterval: 30_000, refetchOnMount: "always",
    queryFn: async () => {
      const appartenance = await supabase.from("cabinet_membres").select("*").eq("user_id", user!.id).eq("actif", true).maybeSingle();
      if (appartenance.error) throw appartenance.error;
      if (!appartenance.data) return null;
      const moi = appartenance.data;
      const [cabinet, membres, dossiers] = await Promise.all([
        supabase.from("cabinets").select("*").eq("id", moi.cabinet_id).eq("actif", true).maybeSingle(),
        supabase.from("cabinet_membres").select("*").eq("cabinet_id", moi.cabinet_id),
        supabase.from("cabinet_dossiers").select("*, societes(nom)").eq("cabinet_id", moi.cabinet_id),
      ]);
      for (const resultat of [cabinet, membres, dossiers]) if (resultat.error) throw resultat.error;
      if (!cabinet.data) return null;
      const liens = dossiers.data ?? [];
      const equipe = membres.data ?? [];
      const [attributions, profils] = await Promise.all([
        liens.length ? supabase.from("cabinet_attributions").select("*").in("dossier_id", liens.map(d => d.id)) : Promise.resolve({ data: [], error: null }),
        equipe.length ? supabase.from("profiles").select("user_id, nom, email").in("user_id", equipe.map(m => m.user_id)) : Promise.resolve({ data: [], error: null }),
      ]);
      if (attributions.error) throw attributions.error;
      if (profils.error) throw profils.error;
      return {
        cabinet: cabinet.data, role: moi.role,
        membres: equipe.map(m => { const profil = profils.data?.find(p => p.user_id === m.user_id); return { ...m, nom: profil?.nom || profil?.email || m.user_id }; }),
        dossiers: liens.filter(d => moi.role === "responsable" || attributions.data?.some(a => a.dossier_id === d.id && a.user_id === moi.user_id)).map(d => ({ ...d, nom: d.societes?.nom ?? d.societe_id })),
        attributions: attributions.data ?? [],
      };
    },
  });
  const mutation = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => {
      await Promise.all(["cabinet", "dossiers_cabinet", "societes", "acces_directs"].map(cle => cache.invalidateQueries({ queryKey: [cle] })));
    },
    onError: erreur => toast.error(messageErreur(erreur, erreur instanceof Error ? erreur.message : "L’opération a échoué.")),
  });
  const donnees = !requete.isError && user ? requete.data : null;
  return { cabinet: donnees?.cabinet, role: donnees?.role, membres: donnees?.membres ?? [], dossiers: donnees?.dossiers ?? [], attributions: donnees?.attributions ?? [], isLoading: !!user && requete.isPending, isError: requete.isError, enCours: mutation.isPending, executer: mutation.mutateAsync };
}
