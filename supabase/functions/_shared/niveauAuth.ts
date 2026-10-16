// Niveau d'assurance (aal) d'un jeton Supabase : "aal2" une fois le code 2FA vérifié.
// Le corps du JWT est en base64url (- et _, sans remplissage), que atob refuse tel quel.
export function niveauAuth(authHeader: string | null): string | undefined {
  const token = (authHeader ?? "").replace(/^Bearer\s+/i, "");
  const corps = token.split(".")[1];
  if (!corps) return undefined;
  try {
    const b64 = corps.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(corps.length / 4) * 4, "=");
    return JSON.parse(atob(b64)).aal;
  } catch {
    return undefined;
  }
}
