/**
 * MfaEnrollRequiredGate
 * ─────────────────────────────────────────────────────────────────────────────
 * Bloque l'accès à l'application pour les comptes à privilèges
 * (admin, super-admin, chef de service) tant qu'ils n'ont pas enrôlé
 * un facteur TOTP (2FA).
 *
 * Affiche une modale plein écran non-fermable contenant le composant
 * d'enrôlement. Une fois le TOTP vérifié, MfaEnrollSection met à jour
 * la liste des facteurs → le hook useAuth recharge mfaFactorId →
 * la modale disparaît automatiquement.
 */
import { useAuth } from "@/hooks/useAuth";
import { MfaEnrollSection } from "./MfaEnrollSection";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const MfaEnrollRequiredGate = () => {
  const {
    user,
    loading,
    isSuperAdmin,
    mfaFactorId,
    mfaRequired,
    mustChangePassword,
  } = useAuth();

  // Ne rien faire tant que l'auth charge ou que d'autres gates sont actifs.
  if (loading || !user) return null;
  if (mustChangePassword) return null;
  if (mfaRequired) return null;

  const mustEnroll = isSuperAdmin && !mfaFactorId;

  if (!mustEnroll) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-start sm:items-center justify-center bg-black/80 backdrop-blur-sm overflow-y-auto p-4"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="bg-background border rounded-2xl shadow-2xl w-full max-w-2xl my-4 p-6 sm:p-8 space-y-4">
        <div className="flex items-start gap-3">
          <div className="bg-warning/10 rounded-full p-3 shrink-0">
            <ShieldAlert className="size-6 text-warning" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold">
              Authentification à deux facteurs requise
            </h2>
            <p className="text-sm text-muted-foreground">
              Votre compte dispose de privilèges administrateur. Pour des raisons
              de sécurité, vous devez activer le 2FA (TOTP) avant de pouvoir
              continuer à utiliser l'application.
            </p>
          </div>
        </div>

        <MfaEnrollSection />

        <div className="flex justify-end pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => supabase.auth.signOut()}
          >
            Se déconnecter
          </Button>
        </div>
      </div>
    </div>
  );
};