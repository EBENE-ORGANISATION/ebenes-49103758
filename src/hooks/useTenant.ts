import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";
import { applyTheme, resetTheme } from "@/lib/theme";

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

// Les clés sont scopées par utilisateur pour éviter toute fuite de contexte
// d'un compte à l'autre sur le même navigateur (ex. EBENE qui s'affiche pour
// un nouveau compte connecté). Format : `ebene:current_societe_id:<userId>`.
const LS_KEY_PREFIX = "ebene:current_societe_id";
const LS_HOME_PREFIX = "ebene:appli_mere";
const lsKey = (userId: string | null | undefined) =>
  userId ? `${LS_KEY_PREFIX}:${userId}` : LS_KEY_PREFIX;
const lsHomeKey = (userId: string | null | undefined) =>
  userId ? `${LS_HOME_PREFIX}:${userId}` : LS_HOME_PREFIX;

// Anciennes clés non scopées : on les purge au montage pour ne pas hériter
// d'un contexte d'un autre utilisateur.
const LEGACY_LS_KEY = "ebene:current_societe_id";
const LEGACY_LS_HOME_KEY = "ebene:appli_mere";

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
  const [currentId, setCurrentIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastUserIdRef = useRef<string | null>(null);

  const setCurrentSocieteId = useCallback((id: string | null) => {
    setCurrentIdState(id);
    const uid = user?.id ?? null;
    try {
      if (id) {
        localStorage.setItem(lsKey(uid), id);
        localStorage.removeItem(lsHomeKey(uid));
      } else {
        localStorage.removeItem(lsKey(uid));
        // Marque explicitement le choix "Appli mère" pour ne pas auto-sélectionner
        // une société au prochain chargement.
        localStorage.setItem(lsHomeKey(uid), "1");
      }
    } catch { /* ignore */ }
  }, [user?.id]);

  // Au changement d'utilisateur (login/logout/switch), on remet tout le
  // contexte à zéro AVANT toute nouvelle requête, pour qu'aucun header ou
  // thème de l'utilisateur précédent ne reste affiché.
  const currentUid = user?.id ?? null;
  useEffect(() => {
    if (lastUserIdRef.current === currentUid) return;
    lastUserIdRef.current = currentUid;
    setSocietes([]);
    setConfig(null);
    try {
      localStorage.removeItem(LEGACY_LS_KEY);
      localStorage.removeItem(LEGACY_LS_HOME_KEY);
    } catch { /* ignore */ }
    if (currentUid) {
      try {
        setCurrentIdState(localStorage.getItem(lsKey(currentUid)));
      } catch {
        setCurrentIdState(null);
      }
    } else {
      setCurrentIdState(null);
    }
  }, [currentUid]);

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
      // La société technique "_modele" sert uniquement de modèle de défauts globaux
      // (paramétrée par le super-admin). Elle ne doit jamais être proposée comme tenant.
      const list = ((data || []) as Societe[]).filter((s) => s.slug !== "_modele");
      setSocietes(list);

      // Sélection de la société courante :
      // 1) si l'utilisateur a explicitement choisi "Appli mère" (super-admin), on respecte
      // 2) celle persistée en LS si elle est dans la liste
      // 3) sinon la première de la liste
      let homeChosen = false;
      try { homeChosen = localStorage.getItem(lsHomeKey(user.id)) === "1"; } catch { /* ignore */ }
      if (homeChosen && isSuperAdmin) {
        setCurrentIdState(null);
      } else {
        let nextId = currentId;
        if (!nextId || !list.some((s) => s.id === nextId)) {
          nextId = list[0]?.id ?? null;
          if (nextId) setCurrentSocieteId(nextId);
          else setCurrentSocieteId(null);
        }
      }
    } catch {
      setSocietes([]);
      setConfig(null);
      setCurrentIdState(null);
    } finally {
      setLoading(false);
    }
  // currentId est lu via la fonction; ne pas l'inclure pour éviter les recharges en boucle
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, setCurrentSocieteId, isSuperAdmin]);

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
    // Sécurité : on ne charge la config d'une société QUE si l'ID est dans
    // la liste des sociétés accessibles à l'utilisateur. Sinon on reset.
    // Cela empêche d'afficher l'en-tête d'EBENE pour un user qui n'y a
    // pas accès, juste parce qu'un ID périmé traîne dans le state.
    if (!currentId) {
      setConfig(null);
      return;
    }
    if (societes.length === 0) {
      // Liste pas encore chargée : on attend `loadSocietes` pour valider l'ID
      return;
    }
    if (!societes.some((s) => s.id === currentId)) {
      setConfig(null);
      return;
    }
    void loadConfig(currentId);
  }, [currentId, societes, loadConfig]);

  // Applique le thème dynamique dès qu'une nouvelle config est chargée
  useEffect(() => {
    if (config) {
      // On enrichit la config avec le nom de la société (table societes)
      // pour que le moteur de thème puisse mettre à jour <title> et favicon.
      const currentNom =
        societes.find((s) => s.id === config.societe_id)?.nom ?? null;
      applyTheme({ ...config, nom: currentNom });
    }
    else resetTheme();
  }, [config, societes]);

  const currentSociete = useMemo(
    () => (Array.isArray(societes) ? societes.find((s) => s.id === currentId) ?? null : null),
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
