import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";
import { applyTheme, resetTheme } from "@/lib/theme";

export type Societe = Tables<"societes">;
export type SocieteConfig = Tables<"societe_config">;

// ─── URL helpers (purs, sans effets de bord) ────────────────────────────────

/** Lit le ?sid= dans le hash courant de l'URL. */
const getSidFromHash = (): string | null => {
  try {
    const m = window.location.hash.match(/[?&]sid=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
};

/** Abonnement aux événements de changement d'URL (sans rechargement). */
const subscribeToHash = (cb: () => void): (() => void) => {
  window.addEventListener("hashchange", cb);
  window.addEventListener("popstate", cb);
  return () => {
    window.removeEventListener("hashchange", cb);
    window.removeEventListener("popstate", cb);
  };
};

/**
 * Navigue vers une société (ou l'Appli mère si `null`) sans recharger la page.
 * Pousse un nouvel état dans l'historique du navigateur → retour arrière fonctionnel.
 */
export const navigateToSociete = (societeId: string | null): void => {
  const base = window.location.pathname;
  const url = societeId
    ? `${base}#/?sid=${encodeURIComponent(societeId)}`
    : `${base}#/`;
  window.history.pushState(null, "", url);
  // popstate n'est pas déclenché par pushState — on le dispatch manuellement
  // pour que useSyncExternalStore (et tout abonné) reçoive la mise à jour.
  window.dispatchEvent(new PopStateEvent("popstate"));
};

/**
 * Hook utilitaire — retourne une fonction de navigation tenant stable.
 * Remplace l'ancien `setCurrentSocieteId` de `useTenant` dans les composants
 * qui n'ont pas besoin du reste du contexte tenant.
 */
export const useTenantNavigate = (): ((societeId: string | null) => void) =>
  useCallback((societeId: string | null) => navigateToSociete(societeId), []);

// ─── Types ───────────────────────────────────────────────────────────────────

interface TenantState {
  /** Société active selon le ?sid= dans l'URL. */
  currentSociete: Societe | null;
  /** Config de la société active (modules actifs, branding…). */
  societeConfig: SocieteConfig | null;
  /** Toutes les sociétés accessibles à l'utilisateur courant. */
  societes: Societe[];
  /**
   * Change la société active.
   * @deprecated Préférer `useTenantNavigate()` ou `navigateToSociete()` directement.
   * Conservé pour la rétrocompatibilité des composants existants.
   */
  setCurrentSocieteId: (id: string | null) => void;
  isLoading: boolean;
  /** L'utilisateur est-il super-admin (= bypass multi-société). */
  isSuperAdmin: boolean;
  /** Recharge la liste + la config. */
  refresh: () => Promise<void>;
}

// ─── Hook principal ──────────────────────────────────────────────────────────

/**
 * Hook de contexte tenant — Version 2 (URL comme source de vérité).
 *
 * Stratégie :
 *  - Le `?sid=<uuid>` dans le hash est la **seule** source de vérité pour la
 *    société courante. Chaque onglet a sa propre URL → isolation native.
 *  - `useSyncExternalStore` rend le hook réactif aux changements d'URL sans
 *    aucun état React intermédiaire ni localStorage.
 *  - `setCurrentSocieteId` est conservé comme wrapper de `navigateToSociete`
 *    pour la rétrocompatibilité (aucun refactoring forcé des composants existants).
 *  - Au premier montage, les anciennes clés localStorage de sélection de société
 *    (`ebene:current_societe_id*`, `ebene:appli_mere*`) sont purgées.
 */
export const useTenant = (): TenantState => {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();

  // ── Source de vérité : URL ───────────────────────────────────────────────
  // Synchrone, réactif, partagé par aucun onglet.
  const sidFromUrl = useSyncExternalStore(
    subscribeToHash,
    getSidFromHash,
    () => null, // snapshot SSR (jamais déclenché ici, mais requis par l'API)
  );

  const [societes, setSocietes] = useState<Societe[]>([]);
  const [config, setConfig] = useState<SocieteConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // setCurrentSocieteId — rétrocompatibilité : délègue à navigateToSociete.
  const setCurrentSocieteId = useCallback(
    (id: string | null) => navigateToSociete(id),
    [],
  );

  // ── Purge one-shot des anciennes clés localStorage ──────────────────────
  // À supprimer dans ~6 mois une fois tous les navigateurs migrés.
  const purgeDoneRef = useRef(false);
  useEffect(() => {
    if (purgeDoneRef.current) return;
    purgeDoneRef.current = true;
    try {
      const toDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (
          k &&
          (k.startsWith("ebene:current_societe_id") ||
            k.startsWith("ebene:appli_mere"))
        ) {
          toDelete.push(k);
        }
      }
      toDelete.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  }, []);

  // ── Reset du contexte au changement d'utilisateur ───────────────────────
  const lastUidRef = useRef<string | null>(null);
  const currentUid = user?.id ?? null;
  useEffect(() => {
    if (lastUidRef.current === currentUid) return;
    lastUidRef.current = currentUid;
    setSocietes([]);
    setConfig(null);
  }, [currentUid]);

  // ── Chargement de la liste des sociétés accessibles ─────────────────────
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

      // Exclure la société technique "_modele" (modèle de défauts globaux).
      const list = ((data || []) as Societe[]).filter(
        (s) => s.slug !== "_modele",
      );
      setSocietes(list);

      // Auto-sélection pour les utilisateurs normaux (non super-admin) :
      // si l'URL ne contient pas encore de ?sid=, on navigue vers la première
      // société accessible. Le super-admin commence toujours sur l'Appli mère.
      if (!isSuperAdmin && !getSidFromHash() && list.length > 0) {
        navigateToSociete(list[0].id);
      }
    } catch {
      setSocietes([]);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [user, isSuperAdmin]);

  // ── Chargement de la config de la société courante ───────────────────────
  const loadConfig = useCallback(async (societeId: string | null) => {
    if (!societeId) {
      setConfig(null);
      return;
    }
    const { data, error } = await supabase
      .from("societe_config")
      .select("*")
      .eq("societe_id", societeId)
      .maybeSingle();
    if (error) {
      setConfig(null);
      return;
    }
    setConfig((data || null) as SocieteConfig | null);
  }, []);

  // Déclenche loadSocietes dès que l'auth est résolue.
  useEffect(() => {
    if (authLoading) return;
    void loadSocietes();
  }, [authLoading, loadSocietes]);

  // ── ID courant validé ────────────────────────────────────────────────────
  // On ne retient le sid que s'il correspond à une société de la liste
  // accessible à l'utilisateur. Toute valeur périmée ou falsifiée est ignorée.
  const currentId = useMemo((): string | null => {
    if (!sidFromUrl) return null;
    if (societes.length === 0) return null; // liste pas encore chargée
    return societes.some((s) => s.id === sidFromUrl) ? sidFromUrl : null;
  }, [sidFromUrl, societes]);

  // Charge la config dès que currentId ou la liste de sociétés change.
  useEffect(() => {
    if (loading) return; // attendre la fin du chargement initial
    void loadConfig(currentId);
  }, [currentId, loading, loadConfig]);

  // ── Thème dynamique ──────────────────────────────────────────────────────
  useEffect(() => {
    if (config) {
      const nom =
        societes.find((s) => s.id === config.societe_id)?.nom ?? null;
      applyTheme({ ...config, nom });
    } else {
      resetTheme();
    }
  }, [config, societes]);

  // ── Valeurs dérivées ─────────────────────────────────────────────────────
  const currentSociete = useMemo(
    () => societes.find((s) => s.id === currentId) ?? null,
    [societes, currentId],
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
