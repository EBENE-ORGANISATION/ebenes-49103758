/**
 * useAbsences — Hook TanStack Query pour les absences.
 *
 * Charge TOUTES les absences de la société en une seule requête,
 * groupées par moisKey ("YYYY-M"). Le store utilise cette map pour
 * injecter les données dans getMois(annee, mois), ce qui permet la
 * navigation multi-mois (bulletins historiques, récap annuel…).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { absences as repo } from "@/data/absences.repo";
import type { Absence, StatutValidation } from "@/types/ebene";

export const QK_ABSENCES = (societeId: string | null) =>
  ["absences", societeId] as const;

export const useAbsences = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_ABSENCES(societeId) });

  const query = useQuery({
    queryKey: QK_ABSENCES(societeId),
    queryFn: () => (societeId ? repo.listAll(societeId) : {}),
    enabled: !!societeId,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: ({
      a,
      annee,
      mois,
    }: {
      a: Omit<Absence, "id">;
      annee: number;
      mois: number;
    }) => repo.create(a, annee, mois, societeId!),
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
    /** Record<moisKey, Absence[]> pour toute la société. */
    absences: query.data ?? ({} as Record<string, Absence[]>),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    addAbsence: (annee: number, mois: number, a: Omit<Absence, "id">) =>
      addMutation.mutateAsync({ a, annee, mois }),
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
