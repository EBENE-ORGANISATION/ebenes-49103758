/**
 * useTauxHistorique — Hook TanStack Query pour la table `taux_historique`.
 *
 * Remplace le stockage dans `app_state` (JSON blob) par des lignes relationnelles.
 * - Upsert par (societe_id, date_effet) — idempotent.
 * - Si la table est vide pour cette société, le hook renvoie [TAUX_DEFAUT]
 *   pour garantir qu'il y a toujours au moins un jeu de taux actif.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tauxHistorique as repo } from "@/data/tauxHistorique.repo";
import type { TauxFiscaux } from "@/types/ebene";
import { TAUX_DEFAUT } from "@/types/ebene";

export const QK_TAUX_HISTORIQUE = (societeId: string | null) =>
  ["taux_historique", societeId] as const;

export const useTauxHistorique = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_TAUX_HISTORIQUE(societeId) });

  const query = useQuery({
    queryKey: QK_TAUX_HISTORIQUE(societeId),
    queryFn: () => (societeId ? repo.listAll(societeId) : []),
    enabled: !!societeId,
    staleTime: 600_000, // 10 min — les taux changent très rarement
  });

  const upsertMutation = useMutation({
    mutationFn: (t: TauxFiscaux) => repo.upsert(t, societeId!),
    onSuccess: invalidate,
  });

  const upsertBatchMutation = useMutation({
    mutationFn: (list: TauxFiscaux[]) => repo.upsertBatch(list, societeId!),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (dateEffet: string) => repo.remove(dateEffet, societeId!),
    onSuccess: invalidate,
  });

  // Si la table est vide, le hook renvoie toujours [TAUX_DEFAUT]
  const rawList = query.data ?? [];
  const tauxHistorique: TauxFiscaux[] = rawList.length ? rawList : [TAUX_DEFAUT];

  return {
    tauxHistorique,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    upsertTaux: (t: TauxFiscaux) => upsertMutation.mutateAsync(t),
    upsertBatch: (list: TauxFiscaux[]) => upsertBatchMutation.mutateAsync(list),
    removeTaux: (dateEffet: string) => removeMutation.mutateAsync(dateEffet),
    mutations: { upsert: upsertMutation, remove: removeMutation, upsertBatch: upsertBatchMutation },
  };
};
