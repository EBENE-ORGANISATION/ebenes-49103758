import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  children: ReactNode;
  requireRoles?: AppRole[]; // OR-logic
}

export const ProtectedRoute = ({ children, requireRoles }: Props) => {
  const { user, roles, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (requireRoles && requireRoles.length > 0) {
    const ok = requireRoles.some((r) => roles.includes(r));
    if (!ok) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
          <h1 className="text-2xl font-bold mb-2">{t("protected_route.denied_title")}</h1>
          <p className="text-muted-foreground">{t("protected_route.denied_msg")}</p>
        </div>
      );
    }
  }

  return <>{children}</>;
};