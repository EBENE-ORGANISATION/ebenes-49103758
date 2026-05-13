/**
 * useEmployes — Hook TanStack Query pour la gestion des employés.
 *
 * Remplace useEbeneStoreRemote pour l'entité `employes`.
 * Fournit les mêmes opérations que le store (add, update, remove, valider,
 * rejeter) mais via des mutations React Query isolées par société.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { employes as repo } from "@/data/employes.repo";
import type { Employe, StatutValidation } from "@/types/ebene";

/** Clé de requête — utilisable pour invalidation externe. */
export const QK_EMPLOYES = (societeId: string | null) =>
  ["employes", societeId] as const;

export const useEmployes = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_EMPLOYES(societeId) });

  const query = useQuery({
    queryKey: QK_EMPLOYES(societeId),
    queryFn: () => (societeId ? repo.list(societeId) : []),
    enabled: !!societeId,
    staleTime: 60_000, // 1 min — les employés changent peu souvent
  });

  const addMutation = useMutation({
    mutationFn: (e: Omit<Employe, "id">) => repo.create(e, societeId!),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: Partial<Omit<Employe, "id">>;
    }) => repo.update(id, patch, societeId!),
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
        { statutValidation: "valide" as StatutValidation },
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

  const restoreMutation = useMutation({
    mutationFn: (id: number) => repo.restore(id, societeId!),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["employes-corbeille", societeId] });
    },
  });

  const purgeMutation = useMutation({
    mutationFn: (id: number) => repo.purge(id, societeId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employes-corbeille", societeId] });
    },
  });

  // ── Corbeille ──────────────────────────────────────────────────────────────
  const corbeilleQuery = useQuery({
    queryKey: ["employes-corbeille", societeId],
    queryFn: () => (societeId ? repo.listDeleted(societeId) : []),
    enabled: !!societeId,
    staleTime: 30_000,
  });

  return {
    employes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    // Corbeille
    employesCorbeille: corbeilleQuery.data ?? [],
    // Mutations — compatible avec la signature du store existant
    addEmploye: (e: Omit<Employe, "id">) => addMutation.mutateAsync(e),
    updateEmploye: (id: number, patch: Partial<Omit<Employe, "id">>) =>
      updateMutation.mutateAsync({ id, patch }),
    removeEmploye: (id: number) => removeMutation.mutateAsync(id),
    validerEmploye: (id: number) => validerMutation.mutateAsync(id),
    rejeterEmploye: (id: number, motif: string) =>
      rejeterMutation.mutateAsync({ id, motif }),
    restoreEmploye: (id: number) => restoreMutation.mutateAsync(id),
    purgeEmploye: (id: number) => purgeMutation.mutateAsync(id),
    // Accès direct aux mutations pour les composants qui veulent gérer isLoading
    mutations: {
      add: addMutation,
      update: updateMutation,
      remove: removeMutation,
      valider: validerMutation,
      rejeter: rejeterMutation,
      restore: restoreMutation,
      purge: purgeMutation,
    },
  };
};
