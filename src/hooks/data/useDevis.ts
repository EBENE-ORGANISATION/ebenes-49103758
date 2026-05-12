/**
 * useDevis — Hook TanStack Query pour les devis.
 * Charge TOUS les devis de la société, groupés par moisKey.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { devis as repo } from "@/data/devis.repo";
import type { Devis } from "@/types/ebene";

export const QK_DEVIS = (societeId: string | null) =>
  ["devis", societeId] as const;

export const useDevis = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_DEVIS(societeId) });

  const query = useQuery({
    queryKey: QK_DEVIS(societeId),
    queryFn: () => (societeId ? repo.listAll(societeId) : {}),
    enabled: !!societeId,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: ({
      d,
      annee,
      mois,
    }: {
      d: Omit<Devis, "id">;
      annee: number;
      mois: number;
    }) => repo.create(d, annee, mois, societeId!),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: Parameters<typeof repo.update>[1];
    }) => repo.update(id, patch, societeId!),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => repo.remove(id, societeId!),
    onSuccess: invalidate,
  });

  return {
    /** Record<moisKey, Devis[]> pour toute la société. */
    devis: query.data ?? ({} as Record<string, Devis[]>),
    isLoading: query.isLoading,
    createDevis: (annee: number, mois: number, d: Omit<Devis, "id">) =>
      addMutation.mutateAsync({ d, annee, mois }),
    updateDevis: (id: number, patch: Parameters<typeof repo.update>[1]) =>
      updateMutation.mutateAsync({ id, patch }),
    removeDevis: (id: number) => removeMutation.mutateAsync(id),
    mutations: { add: addMutation, update: updateMutation, remove: removeMutation },
  };
};
