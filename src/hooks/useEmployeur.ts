import { useTenant } from "@/hooks/useTenant";

/** Identité de l'employeur imprimée sur les documents RH (contrat, bulletin, décompte). */
export interface InfosEmployeur {
  nom: string;
  nif: string;
  adresse: string;
  representant: string;
  fonctionRepresentant: string;
}

/**
 * Identité de la société ouverte. Le NIF et l'adresse viennent des paramètres
 * société (societe_config), à défaut de la fiche société ; le représentant
 * légal et sa fonction viennent de la fiche société.
 */
export const useEmployeur = (): InfosEmployeur => {
  const { currentSociete, societeConfig } = useTenant();
  return {
    nom: currentSociete?.nom ?? "",
    nif: societeConfig?.nif || currentSociete?.nif || "",
    adresse: societeConfig?.adresse || currentSociete?.adresse || "",
    representant: currentSociete?.representant ?? "",
    fonctionRepresentant: currentSociete?.fonction_representant ?? "",
  };
};
