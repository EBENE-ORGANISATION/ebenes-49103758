/**
 * ForceChangePasswordGate
 * ─────────────────────────────────────────────────────────────────────────────
 * Composant "portail" à placer DANS AuthProvider.
 * Il écoute mustChangePassword et affiche la modal bloquante si nécessaire.
 * Ne rend rien lui-même (null) — seule la modal est visible.
 */
import { useAuth } from "@/hooks/useAuth";
import { ForceChangePasswordModal } from "./ForceChangePasswordModal";

export const ForceChangePasswordGate = () => {
  const { user, mustChangePassword, clearMustChangePassword } = useAuth();

  if (!user || !mustChangePassword) return null;

  return (
    <ForceChangePasswordModal
      userId={user.id}
      onDone={clearMustChangePassword}
    />
  );
};
