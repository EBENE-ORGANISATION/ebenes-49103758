// Empreinte des codes de secours 2FA : HMAC-SHA-256 avec une clé connue du
// seul serveur. Sans la clé, une empreinte volée ne permet pas de retrouver
// le code (un SHA-256 simple d'un code de 8 caractères se casse en minutes).
// Préfixe « h1: » pour distinguer ces empreintes des anciennes.
const CLE = Deno.env.get("MFA_RECOVERY_PEPPER") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export async function empreinteCode(code: string): Promise<string> {
  const cle = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(CLE),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(code));
  return "h1:" + Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
