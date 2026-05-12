/**
 * useFactures — Hook TanStack Query pour les factures.
 * Charge TOUTES les factures de la société, groupées par moisKey.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { factures as repo } from "@/data/factures.repo";
import type { Facture, StatutValidation } from "@/types/ebene";

export const QK_FACTURES = (societeId: string | null) =>
  ["factures", societeId] as const;

export const useFactures = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_FACTURES(societeId) });

  const query = useQuery({
    queryKey: QK_FACTURES(societeId),
    queryFn: () => (societeId ? repo.listAll(societeId) : {}),
    enabled: !!societeId,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: ({
      f,
      annee,
      mois,
    }: {
      f: Omit<Facture, "id">;
      annee: number;
      mois: number;
    }) => repo.create(f, annee, mois, societeId!),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: Partial<
        Pick<
          Facture,
          | "statut"
          | "transactionId"
          | "statutValidation"
          | "motifRejet"
          | "numero"
          | "lignes"
          | "reduction"
          | "avecTva"
          | "totalHT"
          | "totalTva"
          | "totalTtc"
        >
      >;
    }) => repo.update(id, patch, societeId!),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => repo.remove(id, societeId!),
    onSuccess: invalidate,
  });

  return {
    /** Record<moisKey, Facture[]> pour toute la société. */
    factures: query.data ?? ({} as Record<string, Facture[]>),
    isLoading: query.isLoading,
    createFacture: (annee: number, mois: number, f: Omit<Facture, "id">) =>
      addMutation.mutateAsync({ f, annee, mois }),
    updateFacture: (
      id: number,
      patch: Parameters<typeof repo.update>[1],
    ) => updateMutation.mutateAsync({ id, patch }),
    removeFacture: (id: number) => removeMutation.mutateAsync(id),
    validerFacture: (id: number) =>
      updateMutation.mutateAsync({
        id,
        patch: { statutValidation: "valide" as StatutValidation },
      }),
    rejeterFacture: (id: number, motif: string) =>
      updateMutation.mutateAsync({
        id,
        patch: { statutValidation: "rejete" as StatutValidation, motifRejet: motif },
      }),
    mutations: { add: addMutation, update: updateMutation, remove: removeMutation },
  };
};
