import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";

export type Societe = Tables<"societes">;
export type SocieteConfig = Tables<"societe_config">;

interface TenantState {
  /** Société active (slug d'URL ou première société liée à l'utilisateur). */
  currentSociete: Societe | null;
  /** Config de la société active (modules actifs, branding…). */
  societeConfig: SocieteConfig | null;
  /** Toutes les sociétés accessibles à l'utilisateur courant. */
  societes: Societe[];
  /** Change manuellement la société active. */
  setCurrentSocieteId: (id: string | null) => void;
  isLoading: boolean;
  /** L'utilisateur est-il super-admin (= bypass multi-société). */
  isSuperAdmin: boolean;
  /** Recharge la liste + la config. */
  refresh: () => Promise<void>;
}

const LS_KEY = "ebene:current_societe_id";

/**
 * Hook de contexte tenant.
 *
 * Stratégie minimaliste, compatible avec l'architecture existante :
 *  - On charge toutes les sociétés accessibles via les RLS de `societes`
 *    (super-admin voit tout, les autres voient leurs sociétés liées).
 *  - On expose la société "courante" choisie par l'utilisateur (persistée
 *    en localStorage) ou la première de la liste par défaut.
 *  - On expose la `societe_config` correspondante (modules actifs, branding).
 *
 * NB : Le store métier (useEbeneStoreRemote) reste pour l'instant indépendant
 * de ce hook — la sélection de société sert au branding et au contrôle des
 * modules visibles. Pour scoper réellement les données par société, il faudra
 * faire évoluer le store dans une étape ultérieure.
 */
export const useTenant = (): TenantState => {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [config, setConfig] = useState<SocieteConfig | null>(null);
  const [currentId, setCurrentIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(LS_KEY); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  const setCurrentSocieteId = useCallback((id: string | null) => {
    setCurrentIdState(id);
    try {
      if (id) localStorage.setItem(LS_KEY, id);
      else localStorage.removeItem(LS_KEY);
    } catch { /* ignore */ }
  }, []);

  const loadSocietes = useCallback(async () => {
    if (!user) {
      setSocietes([]);
      setConfig(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("societes")
        .select("*")
        .order("nom", { ascending: true });
      if (error) throw error;
      const list = (data || []) as Societe[];
      setSocietes(list);

      // Sélection de la société courante :
      // 1) celle persistée en LS si elle est dans la liste
      // 2) sinon la première de la liste
      let nextId = currentId;
      if (!nextId || !list.some((s) => s.id === nextId)) {
        nextId = list[0]?.id ?? null;
        if (nextId) setCurrentSocieteId(nextId);
        else setCurrentSocieteId(null);
      }
    } catch {
      setSocietes([]);
    } finally {
      setLoading(false);
    }
  }, [user, currentId, setCurrentSocieteId]);

  const loadConfig = useCallback(async (societeId: string | null) => {
    if (!societeId) { setConfig(null); return; }
    const { data, error } = await supabase
      .from("societe_config")
      .select("*")
      .eq("societe_id", societeId)
      .maybeSingle();
    if (error) { setConfig(null); return; }
    setConfig((data || null) as SocieteConfig | null);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void loadSocietes();
  }, [authLoading, loadSocietes]);

  useEffect(() => {
    if (currentId) void loadConfig(currentId);
    else setConfig(null);
  }, [currentId, loadConfig]);

  const currentSociete = useMemo(
    () => societes.find((s) => s.id === currentId) ?? null,
    [societes, currentId]
  );

  const refresh = useCallback(async () => {
    await loadSocietes();
    if (currentId) await loadConfig(currentId);
  }, [loadSocietes, loadConfig, currentId]);

  return {
    currentSociete,
    societeConfig: config,
    societes,
    setCurrentSocieteId,
    isLoading: loading,
    isSuperAdmin,
    refresh,
  };
};
