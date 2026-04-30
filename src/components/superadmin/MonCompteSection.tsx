import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { callSuperAdmin } from "@/lib/superAdminApi";

/**
 * Section "Mon compte" du super-admin : permet de modifier
 * son propre email et son propre mot de passe en toute sécurité.
 * Toutes les modifications passent par l'edge function `super-admin-ops`
 * (avec re-vérification du mot de passe actuel).
 */
export const MonCompteSection = () => {
  const { t } = useTranslation();
  const [currentEmail, setCurrentEmail] = useState<string>("");

  // Email
  const [newEmail, setNewEmail] = useState("");
  const [pwdForEmail, setPwdForEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // Mot de passe
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentEmail(data.user?.email ?? "");
    });
  }, []);

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !pwdForEmail) {
      toast.error(t("account.err_email_pwd_required"));
      return;
    }
    if (newEmail === currentEmail) {
      toast.error(t("account.err_email_same"));
      return;
    }
    setSavingEmail(true);
    try {
      await callSuperAdmin("update_my_email", {
        new_email: newEmail.trim(),
        current_password: pwdForEmail,
      });
      toast.success(t("account.email_updated", { email: newEmail }));
      setCurrentEmail(newEmail.trim());
      setNewEmail("");
      setPwdForEmail("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingEmail(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPwd || !newPwd || !confirmPwd) {
      toast.error(t("account.err_all_required"));
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error(t("account.err_pwd_mismatch"));
      return;
    }
    if (newPwd.length < 8) {
      toast.error(t("account.err_pwd_short"));
      return;
    }
    setSavingPwd(true);
    try {
      await callSuperAdmin("update_my_password", {
        new_password: newPwd,
        current_password: oldPwd,
      });
      toast.success(t("account.pwd_updated"));
      setOldPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4" /> {t("account.email_section")}
          </CardTitle>
          <CardDescription>
            {t("account.current_email")}<span className="font-mono">{currentEmail || "…"}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangeEmail} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-email">{t("account.new_email")}</Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={t("account.new_email_ph")}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd-email">{t("account.current_password_confirm")}</Label>
              <Input
                id="pwd-email"
                type="password"
                value={pwdForEmail}
                onChange={(e) => setPwdForEmail(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" disabled={savingEmail}>
              {savingEmail && <Loader2 className="size-4 animate-spin mr-1.5" />}
              {t("account.update_email_btn")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="size-4" /> {t("account.pwd_section")}
          </CardTitle>
          <CardDescription>{t("account.pwd_hint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="old-pwd">{t("account.current_password")}</Label>
              <Input
                id="old-pwd"
                type="password"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-pwd">{t("account.new_password")}</Label>
                <Input
                  id="new-pwd"
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pwd">{t("account.confirm_password")}</Label>
                <Input
                  id="confirm-pwd"
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <Button type="submit" disabled={savingPwd}>
              {savingPwd && <Loader2 className="size-4 animate-spin mr-1.5" />}
              {t("account.change_password_btn")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default MonCompteSection;
