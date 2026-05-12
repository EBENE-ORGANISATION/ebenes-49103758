/**
 * useImmobilisations — Hook TanStack Query pour les immobilisations.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { immobilisations as repo } from "@/data/immobilisations.repo";
import type { Immobilisation } from "@/types/ebene";

export const QK_IMMOBILISATIONS = (societeId: string | null) =>
  ["immobilisations", societeId] as const;

export const useImmobilisations = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_IMMOBILISATIONS(societeId) });

  const query = useQuery({
    queryKey: QK_IMMOBILISATIONS(societeId),
    queryFn: () => (societeId ? repo.list(societeId) : []),
    enabled: !!societeId,
    staleTime: 120_000, // 2 min — les immos changent rarement
  });

  const addMutation = useMutation({
    mutationFn: (immo: Omit<Immobilisation, "id">) =>
      repo.create(immo, societeId!),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: Partial<Omit<Immobilisation, "id">>;
    }) => repo.update(id, patch, societeId!),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => repo.remove(id, societeId!),
    onSuccess: invalidate,
  });

  return {
    immobilisations: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    addImmobilisation: (immo: Omit<Immobilisation, "id">) =>
      addMutation.mutateAsync(immo),
    updateImmobilisation: (
      id: number,
      patch: Partial<Omit<Immobilisation, "id">>,
    ) => updateMutation.mutateAsync({ id, patch }),
    removeImmobilisation: (id: number) => removeMutation.mutateAsync(id),
    mutations: { add: addMutation, update: updateMutation, remove: removeMutation },
  };
};
