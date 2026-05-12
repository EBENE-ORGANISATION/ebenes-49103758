/**
 * useFournisseurs — Hook TanStack Query pour la gestion des fournisseurs.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fournisseurs as repo } from "@/data/fournisseurs.repo";
import type { Fournisseur } from "@/types/ebene";

export const QK_FOURNISSEURS = (societeId: string | null) =>
  ["fournisseurs", societeId] as const;

export const useFournisseurs = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_FOURNISSEURS(societeId) });

  const query = useQuery({
    queryKey: QK_FOURNISSEURS(societeId),
    queryFn: () => (societeId ? repo.list(societeId) : []),
    enabled: !!societeId,
    staleTime: 60_000,
  });

  const addMutation = useMutation({
    mutationFn: (f: Omit<Fournisseur, "id">) => repo.create(f, societeId!),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => repo.remove(id, societeId!),
    onSuccess: invalidate,
  });

  return {
    fournisseurs: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    addFournisseur: (f: Omit<Fournisseur, "id">) => addMutation.mutateAsync(f),
    removeFournisseur: (id: number) => removeMutation.mutateAsync(id),
    mutations: { add: addMutation, remove: removeMutation },
  };
};
