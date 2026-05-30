import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { getDeviceId } from "@/lib/deviceId";
import {
  computePermissions,
  type AccessLevel,
  type AppModule,
  type PermissionMap,
  type PermissionOverride,
} from "@/lib/permissions";
import type { HeaderFeature } from "@/lib/features";
import { toast } from "sonner";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const INACTIVITY_WARN_MS    = 25 * 60 * 1000; // avertissement à 25 min

export type AppRole =
  | "admin"
  | "chef_compta"
  | "membre_compta"
  | "chef_grh"
  | "membre_grh"
  | "dashboard_viewer"
  | "employe"
  // anciens rôles conservés pour compatibilité
  | "rh"
  | "comptable"
  | "saisie";

export interface CrossServiceGrant {
  id: string;
  service: "compta" | "grh";
  level: "membre" | "chef";
  expires_at: string;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  grants: CrossServiceGrant[];
  overrides: PermissionOverride[];
  perms: PermissionMap;
  features: HeaderFeature[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  /** True si le niveau effectif sur `module` est >= `required`. */
  can: (module: AppModule, required: AccessLevel) => boolean;
  /** True si l'utilisateur a accès à la fonctionnalité du header (admin = toujours true). */
  canFeature: (f: HeaderFeature) => boolean;
  isAdmin: boolean;
  /** Super-admin global (= rôle admin_general). Bypass RLS multi-société. */
  isSuperAdmin: boolean;
  /** Membre du service Comptabilité (admin, chef_compta, membre_compta) */
  inServiceCompta: boolean;
  /** Membre du service GRH (admin, chef_grh, membre_grh) */
  inServiceGrh: boolean;
  /** Chef du service Comptabilité (admin compte aussi) */
  isChefCompta: boolean;
  /** Chef du service GRH (admin compte aussi) */
  isChefGrh: boolean;
  /** Peut voir l'onglet Dashboard (admin ou rôle dashboard_viewer) */
  canViewDashboard: boolean;
  /** Compte de type Employé (portail self-service) */
  isEmploye: boolean;
  /** L'utilisateur n'a QUE le rôle employe (aucun rôle métier admin/chef/membre) */
  isEmployeOnly: boolean;
  refreshRoles: () => Promise<void>;
  /** TRUE si l'admin a (re)défini le mot de passe : l'utilisateur doit en choisir un nouveau. */
  mustChangePassword: boolean;
  /** Appelé par ForceChangePasswordModal après succès pour rafraîchir le flag. */
  clearMustChangePassword: () => void;
  /** ID du facteur TOTP enrôlé et vérifié, null si pas de 2FA. */
  mfaFactorId: string | null;
  /** TRUE si le 2FA est requis mais pas encore vérifié pour cette session. */
  mfaRequired: boolean;
  /** Appelé par MfaVerifyModal après vérification réussie. */
  clearMfaRequired: () => void;
  /** Recharge l'état MFA (à appeler après enrôlement/désenrôlement). */
  refreshMfa: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [grants, setGrants] = useState<CrossServiceGrant[]>([]);
  const [overrides, setOverrides] = useState<PermissionOverride[]>([]);
  const [features, setFeatures] = useState<HeaderFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkDevice = useCallback(async () => {
    try {
      const device_id = getDeviceId();
      const { data, error } = await supabase.functions.invoke("check-login-device", {
        body: { device_id },
      });
      if (error) return;
      if (data && data.allowed === false) {
        await supabase.auth.signOut();
        const email = data.email ?? "";
        // Redirige vers /auth avec flag
        const params = new URLSearchParams({ awaiting_confirmation: "1", email });
        window.location.replace(`/auth?${params.toString()}`);
      }
    } catch (e) {
      console.error("checkDevice failed", e);
    }
  }, []);

  const fetchRoles = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid);
    if (error) {
      setRoles([]);
      return;
    }
    setRoles((data || []).map((r) => r.role as AppRole));
  }, []);

  const fetchGrants = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("cross_service_grants")
      .select("id, service, level, expires_at")
      .eq("user_id", uid)
      .gt("expires_at", new Date().toISOString());
    if (error) {
      setGrants([]);
      return;
    }
    setGrants((data || []) as CrossServiceGrant[]);
  }, []);

  const fetchOverrides = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("permission_overrides")
      .select("module, level")
      .eq("user_id", uid);
    if (error) {
      setOverrides([]);
      return;
    }
    setOverrides((data || []) as PermissionOverride[]);
  }, []);

  const fetchMfa = useCallback(async () => {
    try {
      const [{ data: factors }, { data: aal }] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      const verified = factors?.totp?.find((f) => f.status === "verified");
      setMfaFactorId(verified?.id ?? null);
      // Vérification nécessaire si le niveau courant est AAL1 mais que AAL2 est requis
      if (verified && aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
        setMfaRequired(true);
      } else {
        setMfaRequired(false);
      }
    } catch {
      setMfaFactorId(null);
      setMfaRequired(false);
    }
  }, []);

  const fetchMustChange = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("user_id", uid)
      .maybeSingle();
    setMustChangePassword(data?.must_change_password === true);
  }, []);

  const fetchFeatures = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("user_feature_access")
      .select("feature, enabled")
      .eq("user_id", uid)
      .eq("enabled", true);
    if (error) {
      setFeatures([]);
      return;
    }
    setFeatures((data || []).map((r) => r.feature as HeaderFeature));
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evt, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => {
          fetchRoles(sess.user.id);
          fetchGrants(sess.user.id);
          fetchOverrides(sess.user.id);
          fetchFeatures(sess.user.id);
          fetchMustChange(sess.user.id);
          void fetchMfa();
        }, 0);
        // Verification appareil après login (couvre OAuth Google et email/password)
        if (evt === "SIGNED_IN") {
          setTimeout(() => { void checkDevice(); }, 0);
        }
      } else {
        setRoles([]);
        setGrants([]);
        setOverrides([]);
        setFeatures([]);
        setMustChangePassword(false);
        setMfaFactorId(null);
        setMfaRequired(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // Re-valide la session côté serveur. Si le refresh token a été révoqué
        // (login sur un autre onglet/domaine), on déconnecte proprement.
        supabase.auth.getUser().then(({ data, error }) => {
          if (error || !data?.user) {
            supabase.auth.signOut().catch(() => {});
          }
        });
        // Fetch roles before marking auth as loaded so that isSuperAdmin is
        // correctly known when useTenant.loadSocietes first runs.
        Promise.all([
          fetchRoles(sess.user.id),
          fetchGrants(sess.user.id),
          fetchOverrides(sess.user.id),
          fetchFeatures(sess.user.id),
          fetchMustChange(sess.user.id),
          fetchMfa(),
        ]).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [fetchRoles, fetchGrants, fetchOverrides, fetchFeatures, fetchMustChange, fetchMfa]);

  /** Heartbeat: maintient last_seen_at sur la session en cours */
  useEffect(() => {
    if (!user) return;
    const tick = () => { void checkDevice(); };
    const id = setInterval(tick, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [user]);

  /** Inactivity timeout: déconnexion après 30 min sans activité */
  useEffect(() => {
    if (!user) return;

    const clearTimers = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      if (warnTimer.current)       clearTimeout(warnTimer.current);
    };

    const resetTimers = () => {
      clearTimers();
      warnTimer.current = setTimeout(() => {
        toast.warning("Vous serez déconnecté dans 5 minutes pour inactivité.", {
          id: "inactivity-warn",
          duration: 5 * 60 * 1000,
        });
      }, INACTIVITY_WARN_MS);
      inactivityTimer.current = setTimeout(() => {
        toast.dismiss("inactivity-warn");
        supabase.auth.signOut().catch(() => {});
      }, INACTIVITY_TIMEOUT_MS);
    };

    const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"] as const;
    EVENTS.forEach((ev) => window.addEventListener(ev, resetTimers, { passive: true }));
    resetTimers(); // Démarre les timers dès la connexion

    return () => {
      clearTimers();
      EVENTS.forEach((ev) => window.removeEventListener(ev, resetTimers));
    };
  }, [user]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
    setGrants([]);
    setOverrides([]);
    setFeatures([]);
  };

  const refreshRoles = useCallback(async () => {
    if (user) {
      await fetchRoles(user.id);
      await fetchGrants(user.id);
      await fetchOverrides(user.id);
      await fetchFeatures(user.id);
      await fetchMustChange(user.id);
    }
  }, [user, fetchRoles, fetchGrants, fetchOverrides, fetchFeatures, fetchMustChange]);

  const clearMustChangePassword = useCallback(() => {
    setMustChangePassword(false);
  }, []);

  const clearMfaRequired = useCallback(() => {
    setMfaRequired(false);
  }, []);

  const refreshMfa = useCallback(async () => {
    await fetchMfa();
  }, [fetchMfa]);

  const hasRole = (role: AppRole) => roles.includes(role);
  // Le super-admin = rôle 'admin_general' (alias historique). On reconnaît
  // aussi 'super_admin' au cas où il serait ajouté plus tard.
  const isSuperAdmin =
    (roles as string[]).includes("admin_general") ||
    (roles as string[]).includes("super_admin");
  // Le super-admin a tous les droits d'un admin local sur la société
  // qu'il "impersonne" (sélectionnée via useTenant.setCurrentSocieteId).
  const isAdmin = roles.includes("admin") || isSuperAdmin;
  const hasGrant = (svc: "compta" | "grh") => grants.some((g) => g.service === svc);
  const hasChefGrant = (svc: "compta" | "grh") => grants.some((g) => g.service === svc && g.level === "chef");
  const inServiceCompta =
    isAdmin || roles.includes("chef_compta") || roles.includes("membre_compta") || roles.includes("comptable") || hasGrant("compta");
  const inServiceGrh =
    isAdmin || roles.includes("chef_grh") || roles.includes("membre_grh") || roles.includes("rh") || hasGrant("grh");
  const isChefCompta = isAdmin || roles.includes("chef_compta") || hasChefGrant("compta");
  const isChefGrh = isAdmin || roles.includes("chef_grh") || hasChefGrant("grh");
  const canViewDashboard = isAdmin || roles.includes("dashboard_viewer");
  const isEmploye = roles.includes("employe");
  const hasAnyStaffRole =
    isAdmin ||
    inServiceCompta ||
    inServiceGrh ||
    isChefCompta ||
    isChefGrh ||
    canViewDashboard;
  const isEmployeOnly = isEmploye && !hasAnyStaffRole;

  const perms = computePermissions(roles, grants, overrides);
  const canFn = (module: AppModule, required: AccessLevel) => {
    const lvl = perms[module];
    const rank = { none: 0, read: 1, write: 2, validate: 3 } as const;
    return rank[lvl] >= rank[required];
  };
  const canFeature = (f: HeaderFeature) => isAdmin || features.includes(f);

  return (
    <AuthContext.Provider
      value={{
        user, session, roles, grants, overrides, perms, features, loading, signIn, signOut, hasRole, can: canFn, canFeature, isAdmin, isSuperAdmin,
        inServiceCompta, inServiceGrh, isChefCompta, isChefGrh, canViewDashboard,
        isEmploye, isEmployeOnly, refreshRoles,
        mustChangePassword, clearMustChangePassword,
        mfaFactorId, mfaRequired, clearMfaRequired,
        refreshMfa,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Fallback safe : évite les crashs au cours d'un hot-reload pendant
    // que le Provider est en train d'être re-évalué.
    return {
      user: null,
      session: null,
      roles: [] as AppRole[],
      grants: [] as CrossServiceGrant[],
      overrides: [] as PermissionOverride[],
      perms: {
        dashboard: "none",
        compta: "none",
        factures: "none",
        stock: "none",
        immobilisations: "none",
        fiscalite: "none",
        parametres_sociaux: "none",
        grh: "none",
      } as PermissionMap,
      features: [] as HeaderFeature[],
      loading: true,
      signIn: async () => ({ error: "AuthProvider not ready" }),
      signOut: async () => {},
      hasRole: () => false,
      can: () => false,
      canFeature: () => false,
      isAdmin: false,
      isSuperAdmin: false,
      inServiceCompta: false,
      inServiceGrh: false,
      isChefCompta: false,
      isChefGrh: false,
      canViewDashboard: false,
      isEmploye: false,
      isEmployeOnly: false,
      refreshRoles: async () => {},
      mustChangePassword: false,
      clearMustChangePassword: () => {},
      mfaFactorId: null,
      mfaRequired: false,
      clearMfaRequired: () => {},
      refreshMfa: async () => {},
    } satisfies AuthContextValue;
  }
  return ctx;
};

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrateur",
  chef_compta: "Chef Service Comptabilité",
  membre_compta: "Membre Service Comptabilité",
  chef_grh: "Chef Service GRH",
  membre_grh: "Membre Service GRH",
  dashboard_viewer: "Accès Dashboard",
  employe: "Employé (portail)",
  rh: "RH (ancien)",
  comptable: "Comptable (ancien)",
  saisie: "Saisie (ancien)",
};