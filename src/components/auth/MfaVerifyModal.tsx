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
import { ShieldCheck, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  factorId: string;
  onDone: () => void;
}

export const MfaVerifyModal = ({ factorId, onDone }: Props) => {
  const { t } = useTranslation();
  const [code, setCode]       = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

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

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="bg-background border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 sm:p-8 space-y-6">
        {/* En-tête */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="bg-primary/10 rounded-full p-4">
            <ShieldCheck className="size-8 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{t("mfa.verify_title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("mfa.verify_subtitle")}
            </p>
          </div>
        </div>

        {/* Formulaire */}
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
      </div>
    </div>
  );
};
