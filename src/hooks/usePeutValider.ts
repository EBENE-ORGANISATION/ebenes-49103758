import type { AppModule } from "@/lib/permissions";
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
export const usePeutValider = (module: AppModule = "compta") => {
  const { user, isAdmin, isSuperAdmin, estCabinet, can } = useAuth();
  return useCallback(
    (creePar?: string | null) => estCabinet
      ? can(module, "validate") && (!creePar || creePar !== user?.id)
      : can(module, "read") && (isAdmin || isSuperAdmin || !creePar || creePar !== user?.id),
    [user?.id, isAdmin, isSuperAdmin, estCabinet, can, module],
  );
};
