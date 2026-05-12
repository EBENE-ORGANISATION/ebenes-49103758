/**
 * useArticles — Hook TanStack Query pour la gestion des articles (stock).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { articles as repo } from "@/data/articles.repo";
import type { Article } from "@/types/ebene";

export const QK_ARTICLES = (societeId: string | null) =>
  ["articles", societeId] as const;

export const useArticles = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_ARTICLES(societeId) });

  const query = useQuery({
    queryKey: QK_ARTICLES(societeId),
    queryFn: () => (societeId ? repo.list(societeId) : []),
    enabled: !!societeId,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: (a: Omit<Article, "id">) => repo.create(a, societeId!),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: Partial<Omit<Article, "id">>;
    }) => repo.update(id, patch, societeId!),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => repo.remove(id, societeId!),
    onSuccess: invalidate,
  });

  return {
    articles: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    addArticle: (a: Omit<Article, "id">) => addMutation.mutateAsync(a),
    updateArticle: (id: number, patch: Partial<Omit<Article, "id">>) =>
      updateMutation.mutateAsync({ id, patch }),
    removeArticle: (id: number) => removeMutation.mutateAsync(id),
    mutations: { add: addMutation, update: updateMutation, remove: removeMutation },
  };
};
