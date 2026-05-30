/**
 * MfaVerifyModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal BLOQUANTE affichée après la connexion quand l'utilisateur a activé
 * l'authentification à deux facteurs (TOTP).
 *
 * Flow :
 *  1. L'utilisateur saisit le code à 6 chiffres de son application TOTP.
 *  2. On appelle `supabase.auth.mfa.challenge()` puis `mfa.verify()`.
 *  3. En cas de succès → `onDone()` → la session passe en niveau AAL2.
 *  4. Impossible à fermer tant que le code n'est pas validé.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2, KeyRound, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Props {
  factorId: string;
  onDone: () => void;
}

export const MfaVerifyModal = ({ factorId, onDone }: Props) => {
  const { t } = useTranslation();
  const { refreshMfa } = useAuth();
  const [code, setCode]       = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Mode "code de récupération"
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoverySaving, setRecoverySaving] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.replace(/\s/g, "");
    if (trimmed.length !== 6) {
      setError(t("mfa.err_6digits"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const { data: challenge, error: chalErr } =
        await supabase.auth.mfa.challenge({ factorId });
      if (chalErr) throw chalErr;

      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: trimmed,
      });
      if (verErr) throw verErr;

      onDone();
    } catch (err) {
      setError((err as Error).message ?? t("mfa.err_invalid"));
      setCode("");
    } finally {
      setSaving(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = recoveryCode.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(trimmed)) {
      setRecoveryError("Format attendu : XXXX-XXXX");
      return;
    }
    setRecoveryError(null);
    setRecoverySaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("mfa-recovery-use", {
        body: { code: trimmed },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(
        "Code accepté. Votre 2FA a été réinitialisée — vous devez maintenant en configurer une nouvelle.",
      );
      await refreshMfa();
      onDone();
    } catch (err) {
      setRecoveryError((err as Error).message ?? "Code invalide");
      setRecoveryCode("");
    } finally {
      setRecoverySaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="bg-background border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 sm:p-8 space-y-6">
        {/* En-tête */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="bg-primary/10 rounded-full p-4">
            {mode === "totp"
              ? <ShieldCheck className="size-8 text-primary" />
              : <KeyRound className="size-8 text-primary" />}
          </div>
          <div>
            <h2 className="text-xl font-bold">
              {mode === "totp"
                ? t("mfa.verify_title")
                : "Code de récupération"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "totp"
                ? t("mfa.verify_subtitle")
                : "Saisissez l'un de vos codes de secours à usage unique (format XXXX-XXXX)."}
            </p>
          </div>
        </div>

        {/* Formulaire TOTP */}
        {mode === "totp" && (
        <>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mfa-code">{t("mfa.code_label")}</Label>
            <Input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9 ]*"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="000000"
              autoComplete="one-time-code"
              autoFocus
              disabled={saving}
              className="text-center text-2xl tracking-[0.4em] font-mono"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive font-medium bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={saving || code.length !== 6}
          >
            {saving
              ? <Loader2 className="size-4 animate-spin mr-2" />
              : <ShieldCheck className="size-4 mr-2" />
            }
            {t("mfa.verify_btn")}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => { setMode("recovery"); setError(null); }}
          className="w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Application d'authentification perdue ? Utiliser un code de récupération
        </button>
        </>
        )}

        {/* Formulaire code de récupération */}
        {mode === "recovery" && (
        <>
        <form onSubmit={handleRecovery} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recovery-code">Code de récupération</Label>
            <Input
              id="recovery-code"
              type="text"
              maxLength={9}
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              autoFocus
              disabled={recoverySaving}
              className="text-center text-lg tracking-[0.3em] font-mono uppercase"
            />
          </div>

          {recoveryError && (
            <p className="text-sm text-destructive font-medium bg-destructive/10 rounded-md px-3 py-2">
              {recoveryError}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={recoverySaving}>
            {recoverySaving
              ? <Loader2 className="size-4 animate-spin mr-2" />
              : <KeyRound className="size-4 mr-2" />}
            Valider le code
          </Button>
        </form>
        <button
          type="button"
          onClick={() => { setMode("totp"); setRecoveryError(null); }}
          className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3" />
          Retour au code de l'application
        </button>
        </>
        )}
      </div>
    </div>
  );
};
