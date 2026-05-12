/**
 * useAbsences — Hook TanStack Query pour les absences d'un mois donné.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { absences as repo } from "@/data/absences.repo";
import type { Absence, StatutValidation } from "@/types/ebene";

export const QK_ABSENCES = (
  societeId: string | null,
  annee: number,
  mois: number,
) => ["absences", societeId, annee, mois] as const;

export const useAbsences = (
  societeId: string | null,
  annee: number,
  mois: number,
) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_ABSENCES(societeId, annee, mois) });

  const query = useQuery({
    queryKey: QK_ABSENCES(societeId, annee, mois),
    queryFn: () =>
      societeId ? repo.listByMois(societeId, annee, mois) : [],
    enabled: !!societeId,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: (a: Omit<Absence, "id">) =>
      repo.create(a, annee, mois, societeId!),
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
    absences: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    addAbsence: (a: Omit<Absence, "id">) => addMutation.mutateAsync(a),
    removeAbsence: (id: number) => removeMutation.mutateAsync(id),
    validerAbsence: (id: number) => validerMutation.mutateAsync(id),
    rejeterAbsence: (id: number, motif: string) =>
      rejeterMutation.mutateAsync({ id, motif }),
    mutations: {
      add: addMutation,
      remove: removeMutation,
      valider: validerMutation,
      rejeter: rejeterMutation,
    },
  };
};
