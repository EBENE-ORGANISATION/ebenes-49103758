/**
 * useSanctions — Hook TanStack Query pour les sanctions disciplinaires.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sanctions as repo } from "@/data/sanctions.repo";
import type { Sanction, StatutValidation } from "@/types/ebene";

export const QK_SANCTIONS = (societeId: string | null) =>
  ["sanctions", societeId] as const;

export const useSanctions = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_SANCTIONS(societeId) });

  const query = useQuery({
    queryKey: QK_SANCTIONS(societeId),
    queryFn: () => (societeId ? repo.list(societeId) : []),
    enabled: !!societeId,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: (s: Omit<Sanction, "id">) => repo.create(s, societeId!),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => repo.remove(id, societeId!),
    onSuccess: invalidate,
  });

  const validerMutation = useMutation({
    mutationFn: (id: number) =>
      repo.update(
        id,
        { statutValidation: "valide" as StatutValidation, motifRejet: null },
        societeId!,
      ),
    onSuccess: invalidate,
  });

  const rejeterMutation = useMutation({
    mutationFn: ({ id, motif }: { id: number; motif: string }) =>
      repo.update(
        id,
        { statutValidation: "rejete" as StatutValidation, motifRejet: motif },
        societeId!,
      ),
    onSuccess: invalidate,
  });

  return {
    sanctions: query.data ?? [],
    isLoading: query.isLoading,
    addSanction: (s: Omit<Sanction, "id">) => addMutation.mutateAsync(s),
    removeSanction: (id: number) => removeMutation.mutateAsync(id),
    validerSanction: (id: number) => validerMutation.mutateAsync(id),
    rejeterSanction: (id: number, motif: string) =>
      rejeterMutation.mutateAsync({ id, motif }),
    mutations: {
      add: addMutation,
      remove: removeMutation,
      valider: validerMutation,
      rejeter: rejeterMutation,
    },
  };
};
