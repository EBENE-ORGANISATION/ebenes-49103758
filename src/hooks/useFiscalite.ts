import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SocieteInfoFiscale, RegimeFiscal, SecteurActivite } from "@/types/fiscal";

// ─── Clé de query ─────────────────────────────────────────────────────────

export const QK_FISCALITE = (societeId: string | null) =>
  ["fiscalite", societeId] as const;

// ─── Fetch ────────────────────────────────────────────────────────────────

async function fetchFiscalite(societeId: string): Promise<SocieteInfoFiscale> {
  const { data, error } = await supabase
    .from("societes")
    .select("id, nom, regime_fiscal, secteur_activite, assujetti_tva, set_impots, ca_annuel_estime")
    .eq("id", societeId)
    .single();

  if (error) throw new Error(error.message);
  return {
    id:               data.id,
    nom:              data.nom,
    regime_fiscal:    (data.regime_fiscal    ?? "IS")  as RegimeFiscal,
    secteur_activite: (data.secteur_activite ?? "SE")  as SecteurActivite,
    assujetti_tva:    data.assujetti_tva     ?? false,
    set_impots:       (Array.isArray(data.set_impots) ? data.set_impots : []) as unknown as SocieteInfoFiscale["set_impots"],
    ca_annuel_estime: data.ca_annuel_estime  ?? 0,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export const useFiscalite = (societeId: string | null) => {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QK_FISCALITE(societeId),
    queryFn:  () => fetchFiscalite(societeId!),
    enabled:  !!societeId,
    staleTime: 5 * 60_000, // 5 min
  });

  // ── updateFiscal : met à jour régime, secteur, TVA, CA estimé ──────────
  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<{
      regime_fiscal:    RegimeFiscal;
      secteur_activite: SecteurActivite;
      assujetti_tva:    boolean;
      ca_annuel_estime: number;
    }>) => {
      if (!societeId) throw new Error("Aucune société sélectionnée");
      const { error } = await supabase
        .from("societes")
        .update(patch)
        .eq("id", societeId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: QK_FISCALITE(societeId) }),
  });

  return {
    fiscalite:      query.data ?? null,
    isLoading:      query.isLoading,
    isError:        query.isError,
    error:          query.error,
    updateFiscal:   (patch: Parameters<typeof updateMutation.mutateAsync>[0]) =>
                      updateMutation.mutateAsync(patch),
    isUpdating:     updateMutation.isPending,
  };
};
