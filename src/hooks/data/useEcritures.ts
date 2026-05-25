/**
 * useEcritures — TanStack Query hook pour les écritures comptables SYSCOHADA.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ecritures as repo } from "@/data/ecritures.repo";
import type { EcritureComptable } from "@/types/ebene";

export const QK_ECRITURES = (societeId: string | null) =>
  ["ecritures_comptables", societeId] as const;

export const useEcritures = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_ECRITURES(societeId) });

  const query = useQuery({
    queryKey: QK_ECRITURES(societeId),
    queryFn: () => (societeId ? repo.listAll(societeId) : {}),
    enabled: !!societeId,
    staleTime: 30_000,
  });

  const addM = useMutation({
    mutationFn: ({
      e,
      annee,
      mois,
    }: {
      e: Omit<EcritureComptable, "id">;
      annee: number;
      mois: number;
    }) => repo.create(e, annee, mois, societeId!),
    onSuccess: invalidate,
  });

  const updateM = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<EcritureComptable> }) =>
      repo.update(id, patch, societeId!),
    onSuccess: invalidate,
  });

  const removeM = useMutation({
    mutationFn: (id: number) => repo.remove(id, societeId!),
    onSuccess: invalidate,
  });

  return {
    ecritures: query.data ?? ({} as Record<string, EcritureComptable[]>),
    isLoading: query.isLoading,
    addEcriture: (annee: number, mois: number, e: Omit<EcritureComptable, "id">) =>
      addM.mutateAsync({ e, annee, mois }),
    updateEcriture: (id: number, patch: Partial<EcritureComptable>) =>
      updateM.mutateAsync({ id, patch }),
    removeEcriture: (id: number) => removeM.mutateAsync(id),
    validerEcriture: (id: number) =>
      updateM.mutateAsync({ id, patch: { statut: "valide", motifRejet: undefined } }),
    rejeterEcriture: (id: number, motif: string) =>
      updateM.mutateAsync({ id, patch: { statut: "brouillon", motifRejet: motif } }),
  };
};