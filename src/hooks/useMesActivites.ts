import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { userActivitesRepo } from "@/data/userActivites.repo";

/**
 * Activités auxquelles l'utilisateur connecté est limité dans la société, ou
 * `null` s'il n'est pas limité (toutes les activités, administrateurs).
 */
export const useMesActivites = (societeId: string | null): string[] | null => {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const { data } = useQuery({
    queryKey: ["user_activites", societeId, user?.id],
    queryFn: () => userActivitesRepo.listParSociete(societeId!),
    enabled: !!societeId && !!user?.id && !isAdmin && !isSuperAdmin,
    staleTime: 60_000,
  });
  if (isAdmin || isSuperAdmin || !user?.id) return null;
  const miennes = data?.[user.id];
  return miennes && miennes.length > 0 ? miennes : null;
};
