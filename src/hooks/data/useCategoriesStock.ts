/**
 * useCategoriesStock — Hook TanStack Query pour les catégories de stock.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { categoriesStock as repo } from "@/data/categoriesStock.repo";
import type { CategorieArticle } from "@/types/ebene";

export const QK_CATEGORIES_STOCK = (societeId: string | null) =>
  ["categories_stock", societeId] as const;

export const useCategoriesStock = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_CATEGORIES_STOCK(societeId) });

  const query = useQuery({
    queryKey: QK_CATEGORIES_STOCK(societeId),
    queryFn: () => (societeId ? repo.list(societeId) : []),
    enabled: !!societeId,
    staleTime: 60_000,
  });

  const addMutation = useMutation({
    mutationFn: (c: Omit<CategorieArticle, "id">) =>
      repo.create(c, societeId!),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => repo.remove(id, societeId!),
    onSuccess: invalidate,
  });

  return {
    categoriesStock: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    addCategorieStock: (c: Omit<CategorieArticle, "id">) =>
      addMutation.mutateAsync(c),
    removeCategorieStock: (id: number) => removeMutation.mutateAsync(id),
    mutations: { add: addMutation, remove: removeMutation },
  };
};
