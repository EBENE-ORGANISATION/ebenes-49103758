import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

/**
 * Guard de route réservée au super-administrateur global (rôle admin_general).
 * Redirige silencieusement vers / si l'utilisateur ne l'est pas. La route ne
 * doit jamais apparaître dans la navigation publique.
 */
export const SuperAdminRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading, isSuperAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};