/**
 * PasswordStrengthIndicator
 * ─────────────────────────────────────────────────────────────────────────────
 * Composant réutilisable affiché sous un champ "nouveau mot de passe".
 * Montre :
 *  - Barre de force colorée (rouge → orange → jaune → vert)
 *  - 4 règles checkées en temps réel
 *  - Avertissement HIBP (mot de passe compromis) — vérification asynchrone
 *    déclenchée après 600ms d'inactivité pour éviter de surcharger l'API.
 */
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { evaluatePassword, checkHIBP, type PasswordStrength } from "@/lib/passwordUtils";
import { useTranslation } from "react-i18next";

interface Props {
  password: string;
  /** Appelé dès que le statut HIBP change (true = compromis). */
  onHibpResult?: (pwned: boolean) => void;
}

const BAR_COLORS: Record<PasswordStrength["label"], string> = {
  empty:     "bg-muted",
  weak:      "bg-destructive",
  fair:      "bg-orange-400",
  strong:    "bg-yellow-400",
  excellent: "bg-emerald-500",
};

const BAR_WIDTH: Record<number, string> = {
  0: "w-0",
  1: "w-1/4",
  2: "w-2/4",
  3: "w-3/4",
  4: "w-full",
};

export const PasswordStrengthIndicator = ({ password, onHibpResult }: Props) => {
  const { t } = useTranslation();
  const strength = evaluatePassword(password);
  const [hibpPwned, setHibpPwned]     = useState<boolean | null>(null);
  const [hibpLoading, setHibpLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHibpPwned(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!password || password.length < 8) {
      setHibpLoading(false);
      return;
    }
    setHibpLoading(true);
    timerRef.current = setTimeout(async () => {
      const pwned = await checkHIBP(password);
      setHibpPwned(pwned);
      setHibpLoading(false);
      onHibpResult?.(pwned);
    }, 600);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [password, onHibpResult]);

  if (!password) return null;

  const rules = [
    { ok: strength.rules.minLength, label: t("pwd_strength.rule_min8") },
    { ok: strength.rules.hasUpper,  label: t("pwd_strength.rule_upper") },
    { ok: strength.rules.hasNumber, label: t("pwd_strength.rule_number") },
    { ok: strength.rules.hasSpecial,label: t("pwd_strength.rule_special") },
  ];

  return (
    <div className="space-y-2 mt-1.5">
      {/* Barre de force */}
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${BAR_COLORS[strength.label]} ${BAR_WIDTH[strength.score]}`}
        />
      </div>
      <p className="text-xs text-muted-foreground font-medium">
        {t(`pwd_strength.label_${strength.label}`)}
      </p>

      {/* Règles */}
      <ul className="space-y-0.5">
        {rules.map(({ ok, label }) => (
          <li key={label} className={`flex items-center gap-1.5 text-xs ${ok ? "text-emerald-600" : "text-muted-foreground"}`}>
            {ok
              ? <CheckCircle2 className="size-3 shrink-0 text-emerald-600" />
              : <XCircle className="size-3 shrink-0 text-muted-foreground/60" />
            }
            {label}
          </li>
        ))}
      </ul>

      {/* HIBP */}
      {hibpLoading && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          {t("pwd_strength.hibp_checking")}
        </p>
      )}
      {!hibpLoading && hibpPwned === true && (
        <p className="flex items-center gap-1.5 text-xs text-destructive font-medium bg-destructive/10 rounded px-2 py-1">
          <AlertTriangle className="size-3 shrink-0" />
          {t("pwd_strength.hibp_pwned")}
        </p>
      )}
      {!hibpLoading && hibpPwned === false && password.length >= 8 && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle2 className="size-3 shrink-0" />
          {t("pwd_strength.hibp_safe")}
        </p>
      )}
    </div>
  );
};
