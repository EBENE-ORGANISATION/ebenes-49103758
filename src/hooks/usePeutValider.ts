import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";

/** Infobulle d'un bouton « Valider » désactivé par le contrôle quatre yeux. */
export const MESSAGE_QUATRE_YEUX =
  "Vous avez saisi cet élément : sa validation revient à une autre personne (ou à l'administrateur).";

/**
 * Contrôle « quatre yeux » : on ne valide pas sa propre saisie, sauf
 * l'administrateur. Le même contrôle est appliqué en base (trigger
 * controle_quatre_yeux) ; ici, il sert à griser le bouton.
 */
export const usePeutValider = () => {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  return useCallback(
    (creePar?: string | null) => isAdmin || isSuperAdmin || !creePar || creePar !== user?.id,
    [user?.id, isAdmin, isSuperAdmin],
  );
};
