import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import {
  computePermissions,
  type AccessLevel,
  type AppModule,
  type PermissionMap,
  type PermissionOverride,
} from "@/lib/permissions";
import type { HeaderFeature } from "@/lib/features";

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
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => {
          fetchRoles(sess.user.id);
          fetchGrants(sess.user.id);
          fetchOverrides(sess.user.id);
          fetchFeatures(sess.user.id);
        }, 0);
      } else {
        setRoles([]);
        setGrants([]);
        setOverrides([]);
        setFeatures([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        fetchRoles(sess.user.id);
        fetchGrants(sess.user.id);
        fetchOverrides(sess.user.id);
        fetchFeatures(sess.user.id);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [fetchRoles, fetchGrants, fetchOverrides, fetchFeatures]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
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
    }
  }, [user, fetchRoles, fetchGrants, fetchOverrides, fetchFeatures]);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = roles.includes("admin");
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
        user, session, roles, grants, overrides, perms, features, loading, signIn, signOut, hasRole, can: canFn, canFeature, isAdmin,
        inServiceCompta, inServiceGrh, isChefCompta, isChefGrh, canViewDashboard,
        isEmploye, isEmployeOnly, refreshRoles,
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
      inServiceCompta: false,
      inServiceGrh: false,
      isChefCompta: false,
      isChefGrh: false,
      canViewDashboard: false,
      isEmploye: false,
      isEmployeOnly: false,
      refreshRoles: async () => {},
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