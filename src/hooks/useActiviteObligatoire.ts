import { useTenant } from "@/hooks/useTenant";
import { useActivites } from "@/hooks/data/useActivites";

/** Message quand une saisie doit être rattachée à une activité. */
export const MESSAGE_ACTIVITE_OBLIGATOIRE = "Choisissez l'activité concernée.";

/**
 * Vrai si la société a au moins deux activités actives : les saisies qui
 * relèvent d'une activité (facture, devis, opération, article,
 * immobilisation) doivent alors en indiquer une — rien n'est rattaché
 * d'office.
 */
export const useActiviteObligatoire = (): boolean => {
  const { currentSociete } = useTenant();
  const { activitesActives } = useActivites(currentSociete?.id ?? null);
  return activitesActives.length >= 2;
};
