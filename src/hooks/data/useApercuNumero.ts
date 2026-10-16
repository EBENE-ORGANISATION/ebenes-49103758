import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/hooks/useTenant";
import {
  DEFAULT_FORMAT_DEVIS,
  DEFAULT_FORMAT_FACTURE,
  cleAnneeNumero,
  formaterNumero,
  prochainCompteur,
} from "@/lib/numerotation";

/**
 * Aperçu du prochain numéro de facture ou de devis pour une année, lu sur le
 * compteur annuel en base. null tant qu'il n'est pas connu (ou si la migration
 * des compteurs annuels n'est pas appliquée) : l'appelant garde alors l'ancien aperçu.
 */
export const useApercuNumero = (type: "facture" | "devis", annee: number) => {
  const { currentSociete, societeConfig } = useTenant();
  const sid = currentSociete?.id ?? null;
  const format = (type === "facture" ? societeConfig?.format_facture : societeConfig?.format_devis)
    || (type === "facture" ? DEFAULT_FORMAT_FACTURE : DEFAULT_FORMAT_DEVIS);
  const cle = cleAnneeNumero(format, annee);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["apercu-numero", sid, type, cle],
    queryFn: () => prochainCompteur(sid!, type, cle),
    enabled: !!sid,
    staleTime: 0,
  });
  return {
    apercu: data != null ? formaterNumero(format, annee, data) : null,
    /** Prochain compteur de l'année (null si inconnu). */
    compteur: data ?? null,
    /** À appeler après une réservation : le compteur a avancé. */
    rafraichir: () => qc.invalidateQueries({ queryKey: ["apercu-numero", sid] }),
  };
};
