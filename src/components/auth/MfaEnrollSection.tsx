/**
 * MfaEnrollSection
 * ─────────────────────────────────────────────────────────────────────────────
 * Section "Authentification à deux facteurs (2FA)" intégrée dans les
 * paramètres de compte.
 *
 * États :
 *  - Désactivé → bouton "Activer le 2FA" → QR code + champ de vérification
 *  - Actif     → badge vert + bouton "Désactiver"
 *
 * Utilise l'API MFA native de Supabase (supabase.auth.mfa.*).
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ShieldCheck, ShieldOff, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";

export const MfaEnrollSection = () => {
  const { t } = useTranslation();
  const { refreshMfa } = useAuth();

  // État courant du facteur
  const [factorId, setFactorId]   = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);

  // Enrollment en cours
  const [enrolling, setEnrolling]     = useState(false);
  const [qrCode, setQrCode]           = useState<string | null>(null);
  const [secret, setSecret]           = useState<string | null>(null);
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode]   = useState("");
  const [verifying, setVerifying]     = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Désactivation
  const [unenrolling, setUnenrolling] = useState(false);

  const loadFactors = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.find((f) => f.status === "verified");
      setFactorId(verified?.id ?? null);
    } catch {
      setFactorId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadFactors(); }, [loadFactors]);

  // ── Démarrer l'enrollment ──────────────────────────────────────────────────
  const handleStartEnroll = async () => {
    setEnrolling(true);
    setVerifyError(null);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "EBENE SERVICES" });
      if (error) throw error;
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setEnrollFactorId(data.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEnrolling(false);
    }
  };

  // ── Vérifier le code et finaliser l'enrollment ────────────────────────────
  const handleVerifyEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = verifyCode.replace(/\s/g, "");
    if (trimmed.length !== 6 || !enrollFactorId) return;
    setVerifyError(null);
    setVerifying(true);
    try {
      const { data: challenge, error: chalErr } =
        await supabase.auth.mfa.challenge({ factorId: enrollFactorId });
      if (chalErr) throw chalErr;

      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId: enrollFactorId,
        challengeId: challenge.id,
        code: trimmed,
      });
      if (verErr) throw verErr;

      toast.success(t("mfa.enroll_success"));
      setQrCode(null);
      setSecret(null);
      setEnrollFactorId(null);
      setVerifyCode("");
      await loadFactors();
      await refreshMfa();
    } catch (err) {
      setVerifyError((err as Error).message ?? t("mfa.err_invalid"));
      setVerifyCode("");
    } finally {
      setVerifying(false);
    }
  };

  // ── Annuler l'enrollment en cours ─────────────────────────────────────────
  const handleCancelEnroll = async () => {
    if (enrollFactorId) {
      await supabase.auth.mfa.unenroll({ factorId: enrollFactorId }).catch(() => {});
    }
    setQrCode(null);
    setSecret(null);
    setEnrollFactorId(null);
    setVerifyCode("");
    setVerifyError(null);
  };

  // ── Désactiver le 2FA ──────────────────────────────────────────────────────
  const handleUnenroll = async () => {
    if (!factorId) return;
    setUnenrolling(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast.success(t("mfa.unenroll_success"));
      setFactorId(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUnenrolling(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t("mfa.loading")}</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" />
          {t("mfa.section_title")}
          {factorId && (
            <Badge variant="default" className="ml-1 bg-emerald-600 text-white text-xs">
              {t("mfa.active")}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{t("mfa.section_desc")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── 2FA actif ──────────────────────────────────────────────────── */}
        {factorId && !qrCode && (
          <div className="flex items-center justify-between gap-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="size-4 shrink-0" />
              {t("mfa.active_desc")}
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0">
                  <ShieldOff className="size-3.5 mr-1.5" />
                  {t("mfa.disable_btn")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("mfa.disable_confirm_title")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("mfa.disable_confirm_desc")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleUnenroll}
                    disabled={unenrolling}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {unenrolling && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
                    {t("mfa.disable_confirm_btn")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* ── 2FA désactivé, pas d'enrollment en cours ────────────────────── */}
        {!factorId && !qrCode && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("mfa.disabled_desc")}</p>
            <Button onClick={handleStartEnroll} disabled={enrolling}>
              {enrolling
                ? <Loader2 className="size-4 animate-spin mr-2" />
                : <QrCode className="size-4 mr-2" />
              }
              {t("mfa.enable_btn")}
            </Button>
          </div>
        )}

        {/* ── Enrollment en cours : QR code + vérification ─────────────────── */}
        {qrCode && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("mfa.enroll_scan_hint")}</p>

            {/* QR code */}
            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-xl border shadow-sm">
                <img
                  src={qrCode}
                  alt="QR code 2FA"
                  className="size-44"
                />
              </div>
            </div>

            {/* Clé manuelle */}
            {secret && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t("mfa.manual_key")}</p>
                <code className="block bg-muted px-3 py-1.5 rounded text-xs font-mono break-all select-all">
                  {secret}
                </code>
              </div>
            )}

            {/* Vérification */}
            <form onSubmit={handleVerifyEnroll} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="enroll-code">{t("mfa.code_label")}</Label>
                <Input
                  id="enroll-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  autoFocus
                  disabled={verifying}
                  className="text-center text-xl tracking-[0.4em] font-mono max-w-[180px]"
                />
              </div>

              {verifyError && (
                <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
                  {verifyError}
                </p>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={verifying || verifyCode.length !== 6}>
                  {verifying && <Loader2 className="size-4 animate-spin mr-2" />}
                  {t("mfa.confirm_btn")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelEnroll}
                  disabled={verifying}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
