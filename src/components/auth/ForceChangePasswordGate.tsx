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

  if (!user) return null;
  const recuperation = recuperationMotDePasse && !mfaRequired;
  if (!mustChangePassword && !recuperation) return null;

  return (
    <ForceChangePasswordModal
      userId={user.id}
      recuperation={recuperation}
      onDone={() => { clearMustChangePassword(); finirRecuperation(); }}
    />
  );
};
