/**
 * ForceChangePasswordModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal BLOQUANTE affichée dès qu'un utilisateur se connecte avec un mot de
 * passe défini par l'administrateur (must_change_password = true dans profiles).
 *
 * - Impossible à fermer (pas de croix, pas de clic sur le fond)
 * - Aucune navigation possible tant que le mot de passe n'est pas changé
 * - Après succès : profiles.must_change_password → false, auth state rafraîchi
 */
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { evaluatePassword } from "@/lib/passwordUtils";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";

interface Props {
  userId: string;
  onDone: () => void;
}

export const ForceChangePasswordModal = ({ userId, onDone }: Props) => {
  const { t } = useTranslation();
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hibpPwned, setHibpPwned] = useState(false);

  const handleHibpResult = useCallback((pwned: boolean) => setHibpPwned(pwned), []);

  const strength = evaluatePassword(newPwd);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!strength.isValid) {
      setError(t("force_pwd.err_complexity"));
      return;
    }
    if (newPwd !== confirmPwd) {
      setError(t("force_pwd.err_mismatch"));
      return;
    }
    if (hibpPwned) {
      setError(t("force_pwd.err_hibp"));
      return;
    }

    setSaving(true);
    try {
      // 1. Changer le mot de passe via Supabase Auth
      const { error: authErr } = await supabase.auth.updateUser({ password: newPwd });
      if (authErr) throw authErr;

      // 2. Désactiver le flag must_change_password
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("user_id", userId);
      if (dbErr) throw dbErr;

      toast.success(t("force_pwd.success"));
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    // Overlay plein écran — z-[9999] pour être au-dessus de tout
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      // Empêcher tout clic accidentel de fermer
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="bg-background border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 sm:p-8 space-y-6">
        {/* En-tête */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="bg-warning/10 rounded-full p-4">
            <ShieldAlert className="size-8 text-warning" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{t("force_pwd.title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("force_pwd.subtitle")}
            </p>
          </div>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-pwd">{t("force_pwd.new_password")}</Label>
            <Input
              id="new-pwd"
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              autoFocus
              disabled={saving}
            />
            <PasswordStrengthIndicator password={newPwd} onHibpResult={handleHibpResult} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-pwd">{t("force_pwd.confirm_password")}</Label>
            <Input
              id="confirm-pwd"
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              disabled={saving}
            />
          </div>

          {/* Erreur */}
          {error && (
            <p className="text-sm text-destructive font-medium bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={saving || !strength.isValid || newPwd !== confirmPwd || hibpPwned}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <KeyRound className="size-4 mr-2" />
            )}
            {t("force_pwd.submit")}
          </Button>
        </form>
      </div>
    </div>
  );
};
