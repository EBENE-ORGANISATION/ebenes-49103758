import { useQuery } from "@tanstack/react-query";
import { cabinetOps } from "@/lib/cabinetOps";
import { useAuth } from "./useAuth";

/** Version sans dépendance au contexte, utilisable pendant sa construction. */
export const useDossiersCabinetUtilisateur = (userId: string | undefined) => {
  const requete = useQuery({
    queryKey: ["dossiers_cabinet", userId],
    queryFn: () => cabinetOps.mesDossiers(),
    enabled: !!userId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30_000,
  });
  // Une erreur de rafraîchissement ne doit pas conserver des droits périmés.
  return { dossiers: userId && !requete.isError ? requete.data ?? [] : [], isLoading: !!userId && requete.isPending, isError: requete.isError };
};

export const useDossiersCabinet = () => {
  const { user } = useAuth();
  return useDossiersCabinetUtilisateur(user?.id);
};
