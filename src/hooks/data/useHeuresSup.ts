/**
 * useHeuresSup — Hook TanStack Query pour les heures supplémentaires.
 *
 * Charge TOUTES les heures sup de la société en une seule requête,
 * groupées par moisKey ("YYYY-M") puis par employeId.
 *
 * La validation/rejet passe par updateValidationByEmploye (filtre sur
 * employe_id+annee+mois) car HeuresSup n'expose pas son id DB dans l'UI.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { heuresSup as repo } from "@/data/heuresSup.repo";
import type { HeuresSup, StatutValidation } from "@/types/ebene";

export const QK_HEURES_SUP = (societeId: string | null) =>
  ["heures_sup", societeId] as const;

export const useHeuresSup = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_HEURES_SUP(societeId) });

  const query = useQuery({
    queryKey: QK_HEURES_SUP(societeId),
    queryFn: () => (societeId ? repo.listAll(societeId) : {}),
    enabled: !!societeId,
    staleTime: 30_000,
  });

  const upsertMutation = useMutation({
    mutationFn: ({
      hs,
      employeId,
      annee,
      mois,
    }: {
      hs: HeuresSup;
      employeId: number;
      annee: number;
      mois: number;
    }) => repo.upsert(hs, employeId, annee, mois, societeId!),
    onSuccess: invalidate,
  });

  const validerMutation = useMutation({
    mutationFn: ({
      employeId,
      annee,
      mois,
    }: {
      employeId: number;
      annee: number;
      mois: number;
    }) =>
      repo.updateValidationByEmploye(
        employeId,
        annee,
        mois,
        "valide" as StatutValidation,
        null,
        societeId!,
      ),
    onSuccess: invalidate,
  });

  const rejeterMutation = useMutation({
    mutationFn: ({
      employeId,
      annee,
      mois,
      motif,
    }: {
      employeId: number;
      annee: number;
      mois: number;
      motif: string;
    }) =>
      repo.updateValidationByEmploye(
        employeId,
        annee,
        mois,
        "rejete" as StatutValidation,
        motif,
        societeId!,
      ),
    onSuccess: invalidate,
  });

  return {
    /** Record<moisKey, Record<employeId, HeuresSup>> pour toute la société. */
    heuresSup: query.data ?? ({} as Record<string, Record<number, HeuresSup>>),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    setHeuresSup: (annee: number, mois: number, employeId: number, hs: HeuresSup) =>
      upsertMutation.mutateAsync({ hs, employeId, annee, mois }),
    validerHeuresSup: (annee: number, mois: number, employeId: number) =>
      validerMutation.mutateAsync({ employeId, annee, mois }),
    rejeterHeuresSup: (
      annee: number,
      mois: number,
      employeId: number,
      motif: string,
    ) => rejeterMutation.mutateAsync({ employeId, annee, mois, motif }),
    mutations: {
      upsert: upsertMutation,
      valider: validerMutation,
      rejeter: rejeterMutation,
    },
  };
};
