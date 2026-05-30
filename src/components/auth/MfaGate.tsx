/**
 * MfaGate
 * ─────────────────────────────────────────────────────────────────────────────
 * Wrapper qui affiche MfaVerifyModal si l'utilisateur a activé le 2FA
 * mais n'a pas encore validé son code TOTP pour cette session.
 */
import { useAuth } from "@/hooks/useAuth";
import { MfaVerifyModal } from "./MfaVerifyModal";

export const MfaGate = () => {
  const { mfaRequired, mfaFactorId, clearMfaRequired } = useAuth();

  if (!mfaRequired || !mfaFactorId) return null;

  return <MfaVerifyModal factorId={mfaFactorId} onDone={clearMfaRequired} />;
};
