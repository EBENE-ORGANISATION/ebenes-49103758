import { useTenant } from "@/hooks/useTenant";
import type { SocieteDocument } from "./styleDocument";

/** Identité de la société ouverte telle qu'elle s'imprime sur les documents. */
export const useSocieteDocument = (): SocieteDocument => {
  const { currentSociete, societeConfig } = useTenant();
  return {
    nom: currentSociete?.nom || "Société",
    adresse: societeConfig?.adresse || currentSociete?.adresse || null,
    telephone: societeConfig?.telephone || null,
    email: societeConfig?.email || null,
    nif: societeConfig?.nif || currentSociete?.nif || null,
    rccm: societeConfig?.rccm || null,
    logoUrl: societeConfig?.logo_url || null,
    couleur: societeConfig?.couleur_primaire || null,
  };
};
