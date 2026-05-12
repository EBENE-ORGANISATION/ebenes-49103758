/**
 * usePrimes — Hook TanStack Query pour les primes.
 *
 * Charge TOUTES les primes de la société en une seule requête,
 * groupées par moisKey ("YYYY-M") puis par employeId.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { primes as repo } from "@/data/primes.repo";
import type { Prime, StatutValidation } from "@/types/ebene";

export const QK_PRIMES = (societeId: string | null) =>
  ["primes", societeId] as const;

export const usePrimes = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_PRIMES(societeId) });

  const query = useQuery({
    queryKey: QK_PRIMES(societeId),
    queryFn: () =>
      societeId ? repo.listAll(societeId) : {},
    enabled: !!societeId,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: ({
      prime,
      employeId,
      annee,
      mois,
    }: {
      prime: Omit<Prime, "id">;
      employeId: number;
      annee: number;
      mois: number;
    }) => repo.create(prime, employeId, annee, mois, societeId!),
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
    /** Record<moisKey, Record<employeId, Prime[]>> pour toute la société. */
    primes: query.data ?? ({} as Record<string, Record<number, Prime[]>>),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    addPrime: (
      annee: number,
      mois: number,
      employeId: number,
      prime: Omit<Prime, "id">,
    ) => addMutation.mutateAsync({ prime, employeId, annee, mois }),
    removePrime: (id: number) => removeMutation.mutateAsync(id),
    validerPrime: (id: number) => validerMutation.mutateAsync(id),
    rejeterPrime: (id: number, motif: string) =>
      rejeterMutation.mutateAsync({ id, motif }),
    mutations: {
      add: addMutation,
      remove: removeMutation,
      valider: validerMutation,
      rejeter: rejeterMutation,
    },
  };
};
