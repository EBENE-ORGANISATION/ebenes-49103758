/**
 * useTransactions — Hook TanStack Query pour les transactions comptables.
 * Charge TOUTES les transactions de la société, groupées par moisKey.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { transactions as repo } from "@/data/transactions.repo";
import type { Transaction, StatutValidation } from "@/types/ebene";

export const QK_TRANSACTIONS = (societeId: string | null) =>
  ["transactions", societeId] as const;

export const useTransactions = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_TRANSACTIONS(societeId) });

  const query = useQuery({
    queryKey: QK_TRANSACTIONS(societeId),
    queryFn: () => (societeId ? repo.listAll(societeId) : {}),
    enabled: !!societeId,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: ({
      t,
      annee,
      mois,
    }: {
      t: Omit<Transaction, "id">;
      annee: number;
      mois: number;
    }) => repo.create(t, annee, mois, societeId!),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: Partial<Pick<Transaction, "statut" | "motifRejet" | "factureId">>;
    }) => repo.update(id, patch, societeId!),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => repo.remove(id, societeId!),
    onSuccess: invalidate,
  });

  return {
    /** Record<moisKey, Transaction[]> pour toute la société. */
    transactions: query.data ?? ({} as Record<string, Transaction[]>),
    isLoading: query.isLoading,
    addTransaction: (annee: number, mois: number, t: Omit<Transaction, "id">) =>
      addMutation.mutateAsync({ t, annee, mois }),
    updateTransaction: (
      id: number,
      patch: Partial<Pick<Transaction, "statut" | "motifRejet" | "factureId">>,
    ) => updateMutation.mutateAsync({ id, patch }),
    removeTransaction: (id: number) => removeMutation.mutateAsync(id),
    validerTransaction: (id: number) =>
      updateMutation.mutateAsync({
        id,
        patch: { statut: "valide" as StatutValidation, motifRejet: undefined },
      }),
    rejeterTransaction: (id: number, motif: string) =>
      updateMutation.mutateAsync({
        id,
        patch: { statut: "rejete" as StatutValidation, motifRejet: motif },
      }),
    mutations: { add: addMutation, update: updateMutation, remove: removeMutation },
  };
};
