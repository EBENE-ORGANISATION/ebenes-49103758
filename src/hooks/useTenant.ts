import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";
import { applyTheme, resetTheme } from "@/lib/theme";

export type Societe = Tables<"societes">;
export type SocieteConfig = Tables<"societe_config">;

// ─── URL helpers (purs, sans effets de bord) ────────────────────────────────

/** Lit le ?sid= dans le hash courant de l'URL (lecture directe window.location). */
const getSidFromHash = (): string | null => {
  try {
    const m = window.location.hash.match(/[?&]sid=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
};

/**
 * Navigue vers une société (ou l'Appli mère si `null`) sans recharger la page.
 *
 * ⚠️ Cette fonction contourne React Router (pushState direct).
 * À utiliser UNIQUEMENT dans des contextes hors-composant ou pour
 * l'auto-sélection initiale. Dans les composants React, préférer
 * `useTenantNavigate()` qui passe par React Router et génère des
 * entrées d'historique correctement identifiées (Back/Forward).
 */
export const navigateToSociete = (societeId: string | null): void => {
  const base = window.location.pathname;
  const url = societeId
    ? `${base}#/?sid=${encodeURIComponent(societeId)}`
    : `${base}#/`;
  window.history.pushState(null, "", url);
  // pushState ne déclenche pas popstate — dispatch manuel pour React Router.
  window.dispatchEvent(new PopStateEvent("popstate"));
};

/**
 * Hook utilitaire — retourne une fonction de navigation vers une société.
 * ✅ Passe par React Router → entries correctement keyed → Back/Forward fonctionnel.
 */
export const useTenantNavigate = (): ((societeId: string | null) => void) => {
  const navigate = useNavigate();
  return useCallback(
    (societeId: string | null) =>
      navigate({
        pathname: "/",
        search: societeId ? `sid=${encodeURIComponent(societeId)}` : "",
      }),
    [navigate],
  );
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface TenantState {
  /** Société active selon le ?sid= dans l'URL. */
  currentSociete: Societe | null;
  /** Config de la société active (modules actifs, branding…). */
  societeConfig: SocieteConfig | null;
  /** Toutes les sociétés accessibles à l'utilisateur courant. */
  societes: Societe[];
  /**
   * Change la société active via React Router.
   * @deprecated Préférer `useTenantNavigate()` dans les nouveaux composants.
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
 * Hook de contexte tenant — Version 3 (React Router comme source de vérité).
 *
 * Stratégie :
 *  - `useLocation()` de React Router est la source de vérité pour le `?sid=`.
 *    Il est réactif à toutes les navigations React Router (Links, navigate,
 *    boutons Back/Forward) et aux pushState externes (via popstate dispatch).
 *  - `useTenantNavigate()` et `setCurrentSocieteId` passent par `useNavigate()`
 *    → les entrées d'historique sont correctement identifiées par React Router
 *    → le bouton Back fonctionne correctement depuis n'importe quel onglet.
 *  - `navigateToSociete` (fonction standalone) est conservée pour l'auto-sélection
 *    initiale uniquement (hors composant). Elle dispatch popstate pour que
 *    React Router mette à jour useLocation().
 */
export const useTenant = (): TenantState => {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // ── Source de vérité : React Router location ─────────────────────────────
  // useLocation() se met à jour automatiquement sur :
  //  - navigate() / <Link> (React Router)
  //  - Back / Forward navigateur
  //  - pushState externe + popstate dispatch (navigateToSociete)
  const location = useLocation();
  const sidFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("sid");
  }, [location.search]);

  const [societes, setSocietes] = useState<Societe[]>([]);
  const [config, setConfig] = useState<SocieteConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // setCurrentSocieteId — passe par React Router pour un historique correct.
  const setCurrentSocieteId = useCallback(
    (id: string | null) =>
      navigate({
        pathname: "/",
        search: id ? `sid=${encodeURIComponent(id)}` : "",
      }),
    [navigate],
  );

  // ── Purge one-shot des anciennes clés localStorage ──────────────────────
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

      const list = ((data || []) as Societe[]).filter(
        (s) => s.slug !== "_modele",
      );
      setSocietes(list);

      // Auto-sélection pour les utilisateurs normaux (non super-admin) :
      // si l'URL ne contient pas encore de ?sid=, on navigue vers la première
      // société accessible. On utilise navigateToSociete (pushState + popstate)
      // car ce useCallback ne peut pas utiliser navigate (dépendance instable).
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
  // Token monotone pour ignorer les réponses obsolètes lors de switchs rapides.
  const configReqIdRef = useRef(0);
  const loadConfig = useCallback(async (societeId: string | null) => {
    const reqId = ++configReqIdRef.current;
    if (!societeId) {
      setConfig(null);
      return;
    }
    const { data, error } = await supabase
      .from("societe_config")
      .select("*")
      .eq("societe_id", societeId)
      .maybeSingle();
    // Si une requête plus récente a démarré entre-temps, on jette le résultat.
    if (reqId !== configReqIdRef.current) return;
    if (error) {
      setConfig(null);
      return;
    }
    setConfig((data || null) as SocieteConfig | null);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void loadSocietes();
  }, [authLoading, loadSocietes]);

  // ── ID courant validé ────────────────────────────────────────────────────
  const currentId = useMemo((): string | null => {
    if (!sidFromUrl) return null;
    if (societes.length === 0) return null;
    return societes.some((s) => s.id === sidFromUrl) ? sidFromUrl : null;
  }, [sidFromUrl, societes]);

  useEffect(() => {
    if (loading) return;
    // Purge immédiate de l'ancienne config pour éviter le « flash » du thème
    // de la société précédente pendant le chargement de la nouvelle.
    setConfig((prev) =>
      prev && prev.societe_id !== currentId ? null : prev,
    );
    void loadConfig(currentId);
  }, [currentId, loading, loadConfig]);

  // ── Thème dynamique ──────────────────────────────────────────────────────
  useEffect(() => {
    // On n'applique le thème QUE si la config correspond à la société courante.
    // Cela évite tout affichage transitoire du thème d'une autre société.
    if (config && config.societe_id === currentId) {
      const nom =
        societes.find((s) => s.id === config.societe_id)?.nom ?? null;
      applyTheme({ ...config, nom });
    } else if (!currentId) {
      resetTheme();
    }
    // Si currentId existe mais config pas encore chargée (ou stale) :
    // on ne touche pas au thème → on garde le précédent jusqu'à la nouvelle config.
    // Combiné à la purge ci-dessus, ça évite tout flash inter-sociétés.
  }, [config, societes, currentId]);

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
