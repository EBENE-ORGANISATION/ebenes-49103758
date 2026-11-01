import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { messageErreur } from "@/lib/ebene-utils";
import type { MarquerDeclaration, TableauCabinetResultat } from "@/lib/tableauCabinet";

export function useTableauCabinet(annee: number, mois: number) {
  return useQuery({
    queryKey: ["tableau_cabinet", annee, mois],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tableau_cabinet", { _annee: annee, _mois: mois });
      if (error) throw error;
      return data as unknown as TableauCabinetResultat;
    },
  });
}

export function useMarquerDeclaration() {
  const cache = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async ({ societe_id, annee, mois, type, statut }: MarquerDeclaration) => {
      // Le trigger renseigne l’auteur ; ne jamais transmettre le champ par.
      const { error } = await supabase.from("suivi_declarations").upsert(
        { societe_id, annee, mois, type, statut },
        { onConflict: "societe_id,annee,mois,type" },
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["tableau_cabinet"] });
      toast.success(t("tableau_cabinet.succes"));
    },
    onError: erreur => toast.error(messageErreur(erreur, t("tableau_cabinet.erreur_marquer"))),
  });
}
