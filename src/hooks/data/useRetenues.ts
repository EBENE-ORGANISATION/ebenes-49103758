/**
 * useRetenues — Hook TanStack Query pour les retenues sur salaire.
 *
 * Charge TOUTES les retenues de la société en une seule requête,
 * groupées par moisKey ("YYYY-M") puis par employeId.
 *
 * Structure MoisData : retenues?: Record<employeId, montant>
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { retenues as repo } from "@/data/retenues.repo";

export const QK_RETENUES = (societeId: string | null) =>
  ["retenues", societeId] as const;

export const useRetenues = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_RETENUES(societeId) });

  const query = useQuery({
    queryKey: QK_RETENUES(societeId),
    queryFn: () => (societeId ? repo.listAll(societeId) : {}),
    enabled: !!societeId,
    staleTime: 30_000,
  });

  const upsertMutation = useMutation({
    mutationFn: ({
      employeId,
      annee,
      mois,
      montant,
    }: {
      employeId: number;
      annee: number;
      mois: number;
      montant: number;
    }) => repo.upsert(employeId, annee, mois, montant, societeId!),
    onSuccess: invalidate,
  });

  return {
    /** Record<moisKey, Record<employeId, montant>> pour toute la société. */
    retenues: query.data ?? ({} as Record<string, Record<number, number>>),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    setRetenue: (
      annee: number,
      mois: number,
      employeId: number,
      montant: number,
    ) => upsertMutation.mutateAsync({ employeId, annee, mois, montant }),
    mutations: { upsert: upsertMutation },
  };
};
