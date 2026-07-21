/**
 * useActivites — Hook TanStack Query pour les compartiments d'activité d'une
 * société (table `activites`). Fournit la liste + les mutations CRUD.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { activitesRepo as repo } from "@/data/activites.repo";
import type { Activite } from "@/types/ebene";

export const QK_ACTIVITES = (societeId: string | null) =>
  ["activites", societeId] as const;

export const useActivites = (societeId: string | null) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_ACTIVITES(societeId) });

  const query = useQuery({
    queryKey: QK_ACTIVITES(societeId),
    queryFn: () => (societeId ? repo.list(societeId) : []),
    enabled: !!societeId,
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: (input: { nom: string; couleur?: string }) =>
      repo.create(societeId!, input),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<Activite, "nom" | "couleur" | "actif">>;
    }) => repo.update(id, societeId!, patch),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => repo.remove(id, societeId!),
    onSuccess: invalidate,
  });

  const activites = query.data ?? [];
  const activitesActives = activites.filter((a) => a.actif);

  return {
    /** Toutes les activités (actives + inactives). */
    activites,
    /** Uniquement les activités actives — pour les sélecteurs de saisie. */
    activitesActives,
    isLoading: query.isLoading,
    createActivite: (input: { nom: string; couleur?: string }) =>
      createMutation.mutateAsync(input),
    updateActivite: (
      id: string,
      patch: Partial<Pick<Activite, "nom" | "couleur" | "actif">>,
    ) => updateMutation.mutateAsync({ id, patch }),
    removeActivite: (id: string) => removeMutation.mutateAsync(id),
    mutations: {
      create: createMutation,
      update: updateMutation,
      remove: removeMutation,
    },
  };
};
