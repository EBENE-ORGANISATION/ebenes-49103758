/**
 * ForceChangePasswordGate
 * ─────────────────────────────────────────────────────────────────────────────
 * Composant "portail" à placer DANS AuthProvider.
 * Il affiche la modal bloquante de choix du mot de passe :
 *  - quand l'administrateur a (re)défini le mot de passe (mustChangePassword) ;
 *  - après un clic sur le lien « Mot de passe oublié » (recuperationMotDePasse),
 *    une fois la double authentification éventuelle vérifiée.
 * Ne rend rien lui-même (null) — seule la modal est visible.
 */
import { useAuth } from "@/hooks/useAuth";
import { ForceChangePasswordModal } from "./ForceChangePasswordModal";

export const ForceChangePasswordGate = () => {
  const { user, mustChangePassword, clearMustChangePassword, recuperationMotDePasse, finirRecuperation, mfaRequired } = useAuth();

  // Le code 2FA d'abord : Supabase refuse le changement de mot de passe en aal1
  if (!user || mfaRequired) return null;
  const recuperation = recuperationMotDePasse;
  if (!mustChangePassword && !recuperation) return null;

  return (
    <ForceChangePasswordModal
      userId={user.id}
      recuperation={recuperation}
      onDone={() => { clearMustChangePassword(); finirRecuperation(); }}
    />
  );
};
