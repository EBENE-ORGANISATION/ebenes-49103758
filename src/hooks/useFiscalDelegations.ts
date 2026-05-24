import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { FiscalDelegation } from "@/types/fiscal";

export const QK_FISCAL_DELEGATIONS = (societeId: string | null) =>
  ["fiscal_delegations", societeId] as const;

// ─── Fetch ────────────────────────────────────────────────────────────────

async function fetchDelegations(societeId: string): Promise<FiscalDelegation[]> {
  const { data, error } = await supabase
    .from("fiscal_delegations")
    .select("*")
    .eq("societe_id", societeId)
    .order("granted_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as FiscalDelegation[];
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export const useFiscalDelegations = (
  societeId: string | null,
  currentUserId: string | null,
) => {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QK_FISCAL_DELEGATIONS(societeId) });

  const query = useQuery({
    queryKey: QK_FISCAL_DELEGATIONS(societeId),
    queryFn:  () => fetchDelegations(societeId!),
    enabled:  !!societeId,
    staleTime: 60_000,
  });

  // ── Ajouter une délégation par email ──────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async ({ email, note, expiresAt }: {
      email: string;
      note?: string;
      expiresAt?: string | null;
    }) => {
      if (!societeId || !currentUserId) throw new Error("Paramètres manquants");

      // Résoudre l'user_id depuis l'email via une requête profils
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email.trim().toLowerCase())
        .single();

      if (profErr || !profile)
        throw new Error(`Aucun utilisateur EBENE trouvé pour l'email : ${email}`);

      const { error } = await supabase
        .from("fiscal_delegations")
        .upsert({
          societe_id:      societeId,
          delegue_user_id: profile.id,
          granted_by:      currentUserId,
          note:            note ?? null,
          expires_at:      expiresAt ?? null,
          is_active:       true,
        }, { onConflict: "societe_id,delegue_user_id" });

      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  // ── Activer / désactiver ───────────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("fiscal_delegations")
        .update({ is_active: isActive })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  // ── Supprimer ─────────────────────────────────────────────────────────
  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("fiscal_delegations")
        .delete()
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return {
    delegations: query.data ?? [],
    isLoading:   query.isLoading,
    addDelegation:    (p: Parameters<typeof addMutation.mutateAsync>[0]) =>
                        addMutation.mutateAsync(p),
    toggleDelegation: (p: Parameters<typeof toggleMutation.mutateAsync>[0]) =>
                        toggleMutation.mutateAsync(p),
    removeDelegation: (id: string) => removeMutation.mutateAsync(id),
    isAdding:   addMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
};
