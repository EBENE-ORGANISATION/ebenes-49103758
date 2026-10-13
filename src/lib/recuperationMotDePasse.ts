/**
 * Mot de passe oublié : retour du lien reçu par e-mail.
 *
 * Deux formes de lien sont acceptées :
 *  - ?token_hash=…&type=recovery : lien conseillé (modèle d'e-mail Supabase « Reset Password »).
 *    Il fonctionne quel que soit le navigateur ou l'appareil qui ouvre l'e-mail.
 *  - ?code=… : flux PKCE par défaut ; il n'aboutit que dans le navigateur qui a fait la demande
 *    (le client Supabase l'échange lui-même et émet PASSWORD_RECOVERY).
 * En cas d'échec (lien expiré, déjà utilisé), Supabase renvoie error_description, dans la query
 * ou dans le # ; avec le HashRouter, ce # serait lu comme une page inconnue : on le retire.
 */

/** Adresse publique de l'application web, pour les liens ouverts hors de l'APK et du .exe. */
export const ADRESSE_WEB = "https://ebnservicess.com";

/** Adresse de retour à donner à resetPasswordForEmail. */
export const adresseRetourRecuperation = (origine: string): string =>
  /^https?:\/\//.test(origine) ? `${origine}/` : `${ADRESSE_WEB}/`;

export type RetourRecuperation =
  | { tokenHash: string }
  | { erreur: string };

/** Lit le retour du lien (query et #). Fonction pure, testable. */
export const lireRetourRecuperation = (search: string, hash: string): RetourRecuperation | null => {
  const q = new URLSearchParams(search);
  const tokenHash = q.get("token_hash");
  if (tokenHash && q.get("type") === "recovery") return { tokenHash };
  // Erreur : « ?error=… » (PKCE) ou « #error=… » (sans route du HashRouter devant)
  const h = hash.startsWith("#") && !hash.startsWith("#/") ? new URLSearchParams(hash.slice(1)) : null;
  for (const p of [q, h]) {
    if (!p) continue;
    const code = p.get("error_code");
    const desc = p.get("error_description") ?? p.get("error");
    if (code || desc) return { erreur: code === "otp_expired" ? "expire" : desc ?? code ?? "inconnue" };
  }
  return null;
};

/** Retour capturé au démarrage, avant que le routeur ne lise l'adresse. */
let retourInitial: RetourRecuperation | null = null;

/** À appeler une fois, avant le rendu : mémorise le retour et nettoie l'adresse. */
export const capturerRetourRecuperation = (): void => {
  retourInitial = lireRetourRecuperation(window.location.search, window.location.hash);
  if (!retourInitial) return;
  window.history.replaceState(null, "", `${window.location.pathname}#/auth`);
};

/** Rend (une seule fois) le retour capturé au démarrage. */
export const prendreRetourRecuperation = (): RetourRecuperation | null => {
  const r = retourInitial;
  retourInitial = null;
  return r;
};
