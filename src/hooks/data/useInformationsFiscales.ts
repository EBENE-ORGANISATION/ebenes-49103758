import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { informationsFiscalesRepo } from "@/data/informationsFiscales.repo";
import type { InformationsFiscales } from "@/lib/liasse/resultatFiscal";

/** Valeur stable tant que rien n'est chargé (évite de relancer les effets à chaque rendu). */
const VIDE: InformationsFiscales = {};

const cle = (societeId: string | null, annee: number) => ["informations_fiscales", societeId, annee] as const;

/** Informations fiscales et hors bilan d'un exercice (états financiers). */
export const useInformationsFiscales = (societeId: string | null, annee: number) => {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: cle(societeId, annee),
    queryFn: () => informationsFiscalesRepo.get(societeId!, annee),
    enabled: !!societeId,
  });
  const mutation = useMutation({
    mutationFn: (d: InformationsFiscales) => informationsFiscalesRepo.enregistrer(societeId!, annee, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: cle(societeId, annee) }),
  });
  return {
    informations: query.data ?? VIDE,
    isLoading: query.isLoading,
    enregistrer: mutation.mutateAsync,
    enregistrement: mutation.isPending,
  };
};
