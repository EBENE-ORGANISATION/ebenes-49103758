/**
 * useMouvementsStock — Hook TanStack Query pour les mouvements de stock.
 * Charge TOUS les mouvements de la société, groupés par moisKey.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mouvementsStock as repo } from "@/data/mouvementsStock.repo";
import type { MouvementStock } from "@/types/ebene";

export const QK_MOUVEMENTS_STOCK = (societeId: string | null) =>
  ["mouvements_stock", societeId] as const;

export const useMouvementsStock = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_MOUVEMENTS_STOCK(societeId) });

  const query = useQuery({
    queryKey: QK_MOUVEMENTS_STOCK(societeId),
    queryFn: () => (societeId ? repo.listAll(societeId) : {}),
    enabled: !!societeId,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: ({
      m,
      annee,
      mois,
    }: {
      m: Omit<MouvementStock, "id">;
      annee: number;
      mois: number;
    }) => repo.create(m, annee, mois, societeId!),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => repo.remove(id, societeId!),
    onSuccess: invalidate,
  });

  return {
    /** Record<moisKey, MouvementStock[]> pour toute la société. */
    mouvementsStock: query.data ?? ({} as Record<string, MouvementStock[]>),
    isLoading: query.isLoading,
    createMouvement: (
      annee: number,
      mois: number,
      m: Omit<MouvementStock, "id">,
    ) => addMutation.mutateAsync({ m, annee, mois }),
    removeMouvement: (id: number) => removeMutation.mutateAsync(id),
    mutations: { add: addMutation, remove: removeMutation },
  };
};
