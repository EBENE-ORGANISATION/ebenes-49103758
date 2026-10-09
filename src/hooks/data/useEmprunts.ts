import { useQuery } from "@tanstack/react-query";
import { empruntsRepo } from "@/data/emprunts.repo";

export const QK_EMPRUNTS = (societeId: string | null) => ["emprunts", societeId] as const;

/** Emprunts de la société (échéanciers, garanties). */
export const useEmprunts = (societeId: string | null) => {
  const query = useQuery({
    queryKey: QK_EMPRUNTS(societeId),
    queryFn: () => empruntsRepo.list(societeId!),
    enabled: !!societeId,
  });
  return { emprunts: query.data ?? [], isLoading: query.isLoading };
};
