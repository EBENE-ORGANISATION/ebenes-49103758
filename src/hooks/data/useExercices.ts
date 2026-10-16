import { useQuery } from "@tanstack/react-query";
import { exercicesRepo, type Exercice } from "@/data/exercices.repo";

/** Exercices de la société (même cache que l'écran Exercices comptables). */
export const useExercices = (societeId: string | null) => {
  const { data = [] } = useQuery<Exercice[]>({
    queryKey: ["exercices", societeId],
    queryFn: () => exercicesRepo.list(societeId!),
    enabled: !!societeId,
  });
  const clos = new Set(data.filter((e) => e.statut === "cloture").map((e) => e.annee));
  return { exercices: data, estClos: (annee: number) => clos.has(annee) };
};
