/**
 * usePrimes — Hook TanStack Query pour les primes d'un mois donné.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { primes as repo } from "@/data/primes.repo";
import type { Prime, StatutValidation } from "@/types/ebene";

export const QK_PRIMES = (
  societeId: string | null,
  annee: number,
  mois: number,
) => ["primes", societeId, annee, mois] as const;

export const usePrimes = (
  societeId: string | null,
  annee: number,
  mois: number,
) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_PRIMES(societeId, annee, mois) });

  const query = useQuery({
    queryKey: QK_PRIMES(societeId, annee, mois),
    queryFn: () => (societeId ? repo.listByMois(societeId, annee, mois) : {}),
    enabled: !!societeId,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: ({
      prime,
      employeId,
    }: {
      prime: Omit<Prime, "id">;
      employeId: number;
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
        {
          statutValidation: "rejete" as StatutValidation,
          motifRejet: motif,
        },
        societeId!,
      ),
    onSuccess: invalidate,
  });

  return {
    /** Record<employeId, Prime[]> pour le mois courant. */
    primes: query.data ?? {},
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    addPrime: (employeId: number, prime: Omit<Prime, "id">) =>
      addMutation.mutateAsync({ prime, employeId }),
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
