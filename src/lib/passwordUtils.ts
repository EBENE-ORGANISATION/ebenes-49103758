/**
 * passwordUtils.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Utilitaires de validation et de force de mot de passe.
 *
 * - `evaluatePassword`  : analyse synchrone (longueur, complexité, score 0-4)
 * - `checkHIBP`         : vérifie si le mot de passe est dans la base de
 *                         mots de passe compromis via l'API k-anonymity de
 *                         HaveIBeenPwned (pas de mot de passe envoyé en clair)
 */

export interface PasswordRules {
  minLength: boolean;   // ≥ 8 caractères
  hasUpper: boolean;    // au moins 1 majuscule
  hasNumber: boolean;   // au moins 1 chiffre
  hasSpecial: boolean;  // au moins 1 caractère spécial
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4; // 0 = vide, 1 = faible, 2 = moyen, 3 = fort, 4 = excellent
  label: "empty" | "weak" | "fair" | "strong" | "excellent";
  rules: PasswordRules;
  /** true si TOUTES les règles de base sont satisfaites */
  isValid: boolean;
}

const SPECIAL_RE = /[^A-Za-z0-9]/;

export function evaluatePassword(password: string): PasswordStrength {
  if (!password) {
    return {
      score: 0,
      label: "empty",
      rules: { minLength: false, hasUpper: false, hasNumber: false, hasSpecial: false },
      isValid: false,
    };
  }

  const rules: PasswordRules = {
    minLength: password.length >= 8,
    hasUpper:  /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: SPECIAL_RE.test(password),
  };

  const passed = Object.values(rules).filter(Boolean).length; // 0-4

  const score = (passed === 0 ? 1 : Math.min(passed, 4)) as 0 | 1 | 2 | 3 | 4;
  const labels: PasswordStrength["label"][] = ["empty", "weak", "fair", "strong", "excellent"];

  return {
    score,
    label: labels[score],
    rules,
    isValid: rules.minLength && rules.hasUpper && rules.hasNumber && rules.hasSpecial,
  };
}

/**
 * Vérifie si un mot de passe apparaît dans la base HaveIBeenPwned.
 * Utilise le protocole k-anonymity : seuls les 5 premiers caractères du hash
 * SHA-1 sont envoyés — le mot de passe en clair ne quitte jamais le navigateur.
 *
 * @returns `true` si le mot de passe est compromis, `false` sinon.
 *          Retourne `false` en cas d'erreur réseau (ne bloque pas l'utilisateur).
 */
export async function checkHIBP(password: string): Promise<boolean> {
  try {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-1", msgBuffer);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    const prefix = hashHex.slice(0, 5);
    const suffix = hashHex.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return false;

    const text = await res.text();
    return text
      .split("\n")
      .some((line) => line.split(":")[0].trim() === suffix);
  } catch {
    // Erreur réseau → on ne bloque pas l'utilisateur
    return false;
  }
}
