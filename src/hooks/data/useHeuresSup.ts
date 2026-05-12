/**
 * useHeuresSup — Hook TanStack Query pour les heures supplémentaires d'un mois.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { heuresSup as repo } from "@/data/heuresSup.repo";
import type { HeuresSup, StatutValidation } from "@/types/ebene";

export const QK_HEURES_SUP = (
  societeId: string | null,
  annee: number,
  mois: number,
) => ["heures_sup", societeId, annee, mois] as const;

export const useHeuresSup = (
  societeId: string | null,
  annee: number,
  mois: number,
) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_HEURES_SUP(societeId, annee, mois) });

  const query = useQuery({
    queryKey: QK_HEURES_SUP(societeId, annee, mois),
    queryFn: () =>
      societeId ? repo.listByMois(societeId, annee, mois) : {},
    enabled: !!societeId,
    staleTime: 30_000,
  });

  const upsertMutation = useMutation({
    mutationFn: ({
      hs,
      employeId,
    }: {
      hs: HeuresSup;
      employeId: number;
    }) => repo.upsert(hs, employeId, annee, mois, societeId!),
    onSuccess: invalidate,
  });

  const validerMutation = useMutation({
    mutationFn: ({
      id,
      employeId,
    }: {
      id: number;
      employeId: number;
    }) =>
      repo.updateValidation(
        id,
        "valide" as StatutValidation,
        null,
        societeId!,
      ),
    onSuccess: invalidate,
  });

  const rejeterMutation = useMutation({
    mutationFn: ({
      id,
      motif,
    }: {
      id: number;
      motif: string;
    }) =>
      repo.updateValidation(
        id,
        "rejete" as StatutValidation,
        motif,
        societeId!,
      ),
    onSuccess: invalidate,
  });

  return {
    /** Record<employeId, HeuresSup> pour le mois courant. */
    heuresSup: query.data ?? {},
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    setHeuresSup: (employeId: number, hs: HeuresSup) =>
      upsertMutation.mutateAsync({ hs, employeId }),
    validerHeuresSup: (id: number, employeId: number) =>
      validerMutation.mutateAsync({ id, employeId }),
    rejeterHeuresSup: (id: number, motif: string) =>
      rejeterMutation.mutateAsync({ id, motif }),
    mutations: {
      upsert: upsertMutation,
      valider: validerMutation,
      rejeter: rejeterMutation,
    },
  };
};
