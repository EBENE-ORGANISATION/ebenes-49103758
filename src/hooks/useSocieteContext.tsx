import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Societe } from "@/types/ebene";

const LS_SELECTED = "ebene:selectedSocieteId";

interface SocieteContextValue {
  /** Sociétés auxquelles l'utilisateur a accès (toutes pour admin général). */
  societes: Societe[];
  /** Société active pour les écritures + lectures normales. */
  societeId: string | null;
  /** Définit la société active. */
  setSocieteId: (id: string | null) => void;
  /** True si admin général (peut basculer entre toutes les sociétés). */
  isAdminGeneral: boolean;
  /** Mode consolidé activé (lecture seule, agrège toutes les sociétés). */
  consolide: boolean;
  setConsolide: (v: boolean) => void;
  /** Recharge la liste depuis Supabase (après création / liaison). */
  refresh: () => Promise<void>;
  loading: boolean;
}

const SocieteContext = createContext<SocieteContextValue | null>(null);

export const SocieteProvider = ({ children }: { children: ReactNode }) => {
  const { user, roles } = useAuth();
  const isAdminGeneral = roles.includes("admin_general" as never);

  const [societes, setSocietes] = useState<Societe[]>([]);
  const [societeId, setSocieteIdState] = useState<string | null>(null);
  const [consolide, setConsolide] = useState(false);
  const [loading, setLoading] = useState(true);

  const setSocieteId = useCallback((id: string | null) => {
    setSocieteIdState(id);
    try {
      if (id) localStorage.setItem(LS_SELECTED, id);
      else localStorage.removeItem(LS_SELECTED);
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setSocietes([]);
      setSocieteIdState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("societes")
        .select("id,nom,nif,rccm,adresse")
        .order("nom", { ascending: true });
      if (error) throw error;
      const list: Societe[] = (data ?? []).map((s) => ({
        id: s.id,
        nom: s.nom ?? "",
        nif: s.nif ?? "",
        rccm: s.rccm ?? "",
        adresse: s.adresse ?? "",
      }));
      setSocietes(list);
      // Restaurer la sélection (ou prendre la première)
      const stored = (() => {
        try { return localStorage.getItem(LS_SELECTED); } catch { return null; }
      })();
      const valid = stored && list.some((s) => s.id === stored) ? stored : list[0]?.id ?? null;
      setSocieteIdState(valid);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[SocieteProvider] refresh failed", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<SocieteContextValue>(() => ({
    societes,
    societeId,
    setSocieteId,
    isAdminGeneral,
    consolide,
    setConsolide,
    refresh,
    loading,
  }), [societes, societeId, setSocieteId, isAdminGeneral, consolide, refresh, loading]);

  return <SocieteContext.Provider value={value}>{children}</SocieteContext.Provider>;
};

export const useSociete = (): SocieteContextValue => {
  const ctx = useContext(SocieteContext);
  if (!ctx) throw new Error("useSociete must be used within SocieteProvider");
  return ctx;
};

/** Construit une clé app_state préfixée par société. Si societeId est null,
 *  retourne la clé legacy (compat avec données existantes pré-multi-société). */
export const societeKey = (societeId: string | null, baseKey: string): string =>
  societeId ? `s:${societeId}:${baseKey}` : baseKey;
