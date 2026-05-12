/**
 * useParamsAnnuels — Hook TanStack Query pour les paramètres annuels.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { paramsAnnuels as repo } from "@/data/paramsAnnuels.repo";
import type { ParamsAnnuels } from "@/types/ebene";

export const QK_PARAMS_ANNUELS = (societeId: string | null) =>
  ["params_annuels", societeId] as const;

/**
 * Charge TOUS les paramètres annuels d'une société (Record<année, params>).
 * Utilisé pour avoir l'accès à toutes les années en une seule requête.
 */
export const useParamsAnnuels = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_PARAMS_ANNUELS(societeId) });

  const query = useQuery({
    queryKey: QK_PARAMS_ANNUELS(societeId),
    queryFn: () => (societeId ? repo.listAll(societeId) : {}),
    enabled: !!societeId,
    staleTime: 300_000, // 5 min — les params annuels changent très rarement
  });

  const upsertMutation = useMutation({
    mutationFn: ({ p, annee }: { p: ParamsAnnuels; annee: number }) =>
      repo.upsert(p, annee, societeId!),
    onSuccess: invalidate,
  });

  return {
    paramsAnnuels: query.data ?? {},
    /** Retourne les params d'une année (ou {} si inexistants). */
    getParamAnnuel: (annee: number): ParamsAnnuels =>
      (query.data ?? {})[annee] ?? {},
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    setParamAnnuel: (annee: number, p: ParamsAnnuels) =>
      upsertMutation.mutateAsync({ p, annee }),
    mutations: { upsert: upsertMutation },
  };
};
