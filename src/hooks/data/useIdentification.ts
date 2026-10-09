import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { identificationRepo, type IdentificationSociete } from "@/data/identification.repo";

const cle = (societeId: string | null) => ["societe_identification", societeId] as const;

/** Identification complète de la société (états financiers). */
export const useIdentification = (societeId: string | null) => {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: cle(societeId),
    queryFn: () => identificationRepo.get(societeId!),
    enabled: !!societeId,
  });
  const mutation = useMutation({
    mutationFn: (d: IdentificationSociete) => identificationRepo.enregistrer(societeId!, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: cle(societeId) }),
  });
  return {
    identification: query.data ?? {},
    isLoading: query.isLoading,
    enregistrer: mutation.mutateAsync,
    enregistrement: mutation.isPending,
  };
};
