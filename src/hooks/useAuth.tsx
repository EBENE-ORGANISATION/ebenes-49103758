import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole =
  | "admin"
  | "chef_compta"
  | "membre_compta"
  | "chef_grh"
  | "membre_grh"
  // anciens rôles conservés pour compatibilité
  | "rh"
  | "comptable"
  | "saisie";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  /** Membre du service Comptabilité (admin, chef_compta, membre_compta) */
  inServiceCompta: boolean;
  /** Membre du service GRH (admin, chef_grh, membre_grh) */
  inServiceGrh: boolean;
  /** Chef du service Comptabilité (admin compte aussi) */
  isChefCompta: boolean;
  /** Chef du service GRH (admin compte aussi) */
  isChefGrh: boolean;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
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

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => {
          fetchRoles(sess.user.id);
        }, 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) fetchRoles(sess.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [fetchRoles]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
  };

  const refreshRoles = useCallback(async () => {
    if (user) await fetchRoles(user.id);
  }, [user, fetchRoles]);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = roles.includes("admin");
  const inServiceCompta =
    isAdmin || roles.includes("chef_compta") || roles.includes("membre_compta") || roles.includes("comptable");
  const inServiceGrh =
    isAdmin || roles.includes("chef_grh") || roles.includes("membre_grh") || roles.includes("rh");
  const isChefCompta = isAdmin || roles.includes("chef_compta");
  const isChefGrh = isAdmin || roles.includes("chef_grh");

  return (
    <AuthContext.Provider
      value={{
        user, session, roles, loading, signIn, signOut, hasRole, isAdmin,
        inServiceCompta, inServiceGrh, isChefCompta, isChefGrh, refreshRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrateur",
  chef_compta: "Chef Service Comptabilité",
  membre_compta: "Membre Service Comptabilité",
  chef_grh: "Chef Service GRH",
  membre_grh: "Membre Service GRH",
  rh: "RH (ancien)",
  comptable: "Comptable (ancien)",
  saisie: "Saisie (ancien)",
};