// Espace cabinet (spec 2026-10-27, § 7 ; plan, tâche 5, corrigée après la
// relecture de sécurité) : création de comptes par e-mail ; le reste passe
// par les fonctions SQL cabinet_*.
//
// Actions (POST, jeton de l'utilisateur obligatoire) :
//   * ajouter_membre { email, nom?, role?, cabinet_id? }
//       Responsable actif d'un cabinet actif (son cabinet) : NOUVEAUX comptes
//       seulement. Une adresse qui correspond à un compte existant, quel qu'il
//       soit, reçoit la réponse générique MSG_ADRESSE (sans dire si le compte
//       existe). Le quota de 20 ajouts par cabinet sur 24 heures est contrôlé
//       en base (CABINET_QUOTA_JOUR, dans cabinet_definir_membre).
//       Super-admin en aal2 (cabinet_id obligatoire) : compte nouveau ou
//       existant, réponse détaillée.
//       Le compte est créé, puis cabinet_definir_membre est appelée AVEC LE
//       JETON DE L'APPELANT (la base contrôle à nouveau l'appelant) ; si la
//       base refuse, le compte créé est supprimé. Puis l'e-mail.
//       Aucun rôle global, aucune ligne user_societes.
//   * inviter_admin_client { societe_id, email, nom? }
//       Super-admin en aal2 seulement. Société liée à un cabinet (lien actif),
//       sans administrateur. Compte existant refusé s'il est membre d'un
//       cabinet, super-admin, ou rattaché à une autre société sans être déjà
//       admin (le rôle admin est global : il deviendrait administrateur de ses
//       autres sociétés). Donne la ligne user_societes et le rôle admin
//       (service_role) ; si le rôle échoue, la ligne user_societes ajoutée est
//       retirée (et le compte créé supprimé).
//   * renvoyer_invitation { user_id }
//       Nouveau lien de choix du mot de passe pour un compte qui ne s'est
//       jamais connecté (last_sign_in_at nul). Super-admin en aal2 : membre de
//       cabinet ou administrateur d'un client suivi par un cabinet.
//       Responsable : membre de son propre cabinet seulement (réponse
//       générique sinon).
//
// E-mail : send-transactional-email, modèle cabinet-invitation. Nouveau
// compte : lien de réinitialisation (generateLink recovery) ouvert sur le site
// (?token_hash=…&type=recovery, lu par recuperationMotDePasse.ts). Compte
// existant : lien vers le site. email_envoye = pas d'erreur ET
// data.success !== false.
//
// Erreurs renvoyées au client (I2) : les textes « CABINET_<CODE>: … » de la
// base et les messages fixes de ce fichier ; tout autre détail part dans
// console.error, le client reçoit MSG_GENERIQUE.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { niveauAuth } from "../_shared/niveauAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Même adresse que send-transactional-email : ses liens doivent commencer par elle.
const SITE = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://ebnservicess.com").replace(/\/+$/, "");

const MSG_GENERIQUE = "Opération impossible pour le moment.";
const MSG_ADRESSE = "Impossible d'ajouter cette adresse : contactez le super-administrateur.";
const MSG_ADMIN_CLIENT_SA = "Seul le super-administrateur crée l'administrateur d'un client.";
const MSG_AUTRES_SOCIETES = "Ce compte deviendrait administrateur de ses autres sociétés : utilisez une autre adresse.";
const MSG_RENVOI = "Impossible de renvoyer l'invitation à ce compte.";

const LONGUEUR_NOM = 200;
const LONGUEUR_EMAIL = 254;

type RoleCabinet = "responsable" | "collaborateur" | "stagiaire";
const ROLES: RoleCabinet[] = ["responsable", "collaborateur", "stagiaire"];

interface Body {
  action: "ajouter_membre" | "inviter_admin_client" | "renvoyer_invitation";
  email?: string;
  nom?: string;
  role?: RoleCabinet;
  cabinet_id?: string;
  societe_id?: string;
  user_id?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Méthode non autorisée" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié" }, 401);

    // Client à l'identité de l'appelant : les fonctions SQL cabinet_* y
    // contrôlent elles-mêmes l'appelant (auth.uid(), aal du jeton).
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Session invalide" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: callerRoles } = await admin.from("user_roles").select("role").eq("user_id", callerId);
    const roleSet = new Set((callerRoles || []).map((r: { role: string }) => r.role));
    // Les droits du super-admin ne valent qu'après son code 2FA (session aal2).
    const isSuperAdmin = (roleSet.has("admin_general") || roleSet.has("super_admin"))
      && niveauAuth(authHeader) === "aal2";

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return json({ error: "Requête invalide" }, 400);
    }

    const ctx: Contexte = { admin, userClient, callerId, isSuperAdmin, body };
    switch (body.action) {
      case "ajouter_membre":
        return await ajouterMembre(ctx);
      case "inviter_admin_client":
        return await inviterAdminClient(ctx);
      case "renvoyer_invitation":
        return await renvoyerInvitation(ctx);
      default:
        return json({ error: "Action inconnue" }, 400);
    }
  } catch (e) {
    console.error("cabinet-ops :", e);
    return json({ error: MSG_GENERIQUE }, 500);
  }
});

interface Contexte {
  admin: SupabaseClient;
  userClient: SupabaseClient;
  callerId: string;
  isSuperAdmin: boolean;
  body: Body;
}

/** E-mail et nom validés (longueurs comprises), ou une réponse d'erreur. */
function lireIdentite(body: Body): { email: string; nom: string } | Response {
  const email = String(body.email ?? "").trim().toLowerCase();
  const nom = String(body.nom ?? "").trim();
  if (email.length > LONGUEUR_EMAIL || !EMAIL_RE.test(email)) {
    return json({ error: "Adresse e-mail invalide" }, 400);
  }
  if (nom.length > LONGUEUR_NOM) return json({ error: `Nom trop long (${LONGUEUR_NOM} caractères au plus)` }, 400);
  return { email, nom };
}

/** Erreur montrable au client : texte CABINET_ de la base, sinon message générique. */
function erreurClient(message: string | undefined, contexte: string): string {
  if (message && message.startsWith("CABINET_")) return message;
  console.error(`cabinet-ops (${contexte}) :`, message);
  return MSG_GENERIQUE;
}

/** Cabinet dont l'appelant est responsable actif (cabinet actif), sinon null. */
async function cabinetDuResponsable(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data: moi } = await admin
    .from("cabinet_membres")
    .select("cabinet_id, role, actif, cabinets!inner(actif)")
    .eq("user_id", userId)
    .maybeSingle();
  const cabinetActif = (moi as { cabinets?: { actif?: boolean } } | null)?.cabinets?.actif === true;
  if (!moi || moi.role !== "responsable" || !moi.actif || !cabinetActif) return null;
  return moi.cabinet_id as string;
}

// ─── ajouter_membre ─────────────────────────────────────────────────────────
async function ajouterMembre(ctx: Contexte): Promise<Response> {
  const { admin, userClient, callerId, isSuperAdmin, body } = ctx;
  const identite = lireIdentite(body);
  if (identite instanceof Response) return identite;
  const { email, nom } = identite;
  const role: RoleCabinet = body.role ?? "collaborateur";
  if (!ROLES.includes(role)) return json({ error: "Rôle inconnu" }, 400);

  // Cabinet visé, et contrôle de l'appelant AVANT toute création de compte.
  let cabinetId: string;
  if (isSuperAdmin) {
    if (!body.cabinet_id || !UUID_RE.test(body.cabinet_id)) return json({ error: "cabinet_id requis" }, 400);
    cabinetId = body.cabinet_id;
  } else {
    const sien = await cabinetDuResponsable(admin, callerId);
    if (!sien) return json({ error: "Réservé au responsable du cabinet" }, 403);
    if (body.cabinet_id && body.cabinet_id !== sien) return json({ error: "Cabinet hors de votre périmètre" }, 403);
    cabinetId = sien;
  }

  const { data: cabinet } = await admin.from("cabinets").select("nom").eq("id", cabinetId).maybeSingle();
  if (!cabinet) return json({ error: "Cabinet introuvable" }, 404);

  // Responsable : jamais un compte existant (réponse générique, identique
  // pour tous les cas).
  const existant = await compteParEmail(admin, email);
  if (existant && !isSuperAdmin) return json({ error: MSG_ADRESSE }, 400);

  let compte: Compte;
  if (existant) {
    compte = { userId: existant, existait: true };
  } else {
    const cree = await creerCompte(admin, email, nom);
    if (cree === "existe") {
      return isSuperAdmin ? json({ error: MSG_GENERIQUE }, 400) : json({ error: MSG_ADRESSE }, 400);
    }
    if (!cree) return json({ error: MSG_GENERIQUE }, 500);
    compte = cree;
  }

  // La base décide (appelant, super-admin visé, autre cabinet, accès direct,
  // quota, dernier responsable).
  const { error: rpcErr } = await userClient.rpc("cabinet_definir_membre", {
    _cabinet: cabinetId,
    _user: compte.userId,
    _role: role,
    _actif: true,
  });
  if (rpcErr) {
    if (!compte.existait) await admin.auth.admin.deleteUser(compte.userId);
    return json({ error: erreurClient(rpcErr.message, "cabinet_definir_membre") },
      rpcErr.code === "42501" ? 403 : 400);
  }

  const emailEnvoye = await envoyerInvitation(admin, email, compte, {
    objet: "membre",
    nom: nom || undefined,
    cabinetNom: cabinet.nom,
    roleLibelle: role,
  }, `cabinet-membre-${cabinetId}-${compte.userId}`);

  return json(isSuperAdmin
    ? { ok: true, user_id: compte.userId, already_existed: compte.existait, email_envoye: emailEnvoye }
    : { ok: true, user_id: compte.userId, email_envoye: emailEnvoye });
}

// ─── inviter_admin_client ───────────────────────────────────────────────────
async function inviterAdminClient(ctx: Contexte): Promise<Response> {
  const { admin, callerId, isSuperAdmin, body } = ctx;
  if (!isSuperAdmin) return json({ error: MSG_ADMIN_CLIENT_SA }, 403);
  const identite = lireIdentite(body);
  if (identite instanceof Response) return identite;
  const { email, nom } = identite;
  const societeId = body.societe_id;
  if (!societeId || !UUID_RE.test(societeId)) return json({ error: "societe_id requis" }, 400);

  const { data: lien } = await admin
    .from("cabinet_dossiers")
    .select("cabinet_id, cabinets!inner(nom), societes!inner(nom)")
    .eq("societe_id", societeId)
    .eq("etat", "actif")
    .maybeSingle();
  if (!lien) return json({ error: "Cette société n'est pas un dossier actif d'un cabinet." }, 404);
  const infos = lien as unknown as { cabinet_id: string; cabinets: { nom: string }; societes: { nom: string } };

  // Un seul « premier » administrateur : ensuite, l'administrateur du client
  // gère ses utilisateurs lui-même (admin-users).
  const { data: rattaches } = await admin.from("user_societes").select("user_id").eq("societe_id", societeId);
  const idsRattaches = (rattaches || []).map((r: { user_id: string }) => r.user_id);
  if (idsRattaches.length > 0) {
    const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin").in("user_id", idsRattaches);
    if ((admins || []).length > 0) return json({ error: "Cette société a déjà un administrateur." }, 409);
  }

  // Compte existant : membre de cabinet, super-admin, ou autres sociétés sans
  // rôle admin : refusé.
  const existant = await compteParEmail(admin, email);
  if (existant) {
    const { data: membre } = await admin.from("cabinet_membres").select("user_id").eq("user_id", existant).maybeSingle();
    if (membre) return json({ error: "Ce compte appartient à un cabinet : il ne peut pas administrer un client." }, 409);
    const { data: rolesCible } = await admin.from("user_roles").select("role").eq("user_id", existant);
    const roles = (rolesCible || []).map((r: { role: string }) => r.role);
    if (roles.includes("admin_general") || roles.includes("super_admin")) {
      return json({ error: "Un super-administrateur ne peut pas être administrateur client." }, 409);
    }
    const { data: autres } = await admin
      .from("user_societes").select("societe_id").eq("user_id", existant).neq("societe_id", societeId);
    if ((autres || []).length > 0 && !roles.includes("admin")) return json({ error: MSG_AUTRES_SOCIETES }, 409);
  }

  let compte: Compte;
  if (existant) {
    compte = { userId: existant, existait: true };
  } else {
    const cree = await creerCompte(admin, email, nom);
    if (!cree || cree === "existe") return json({ error: MSG_GENERIQUE }, 500);
    compte = cree;
  }

  // Rattachement puis rôle admin (service_role). Nettoyage si le rôle échoue.
  const { data: dejaRattache } = await admin
    .from("user_societes").select("user_id").eq("user_id", compte.userId).eq("societe_id", societeId).maybeSingle();
  const { error: e1 } = await admin.from("user_societes").upsert(
    { user_id: compte.userId, societe_id: societeId, created_by: callerId },
    { onConflict: "user_id,societe_id", ignoreDuplicates: true },
  );
  if (e1) {
    if (!compte.existait) await admin.auth.admin.deleteUser(compte.userId);
    return json({ error: erreurClient(e1.message, "user_societes") }, 500);
  }
  const { error: e2 } = await admin.from("user_roles").upsert(
    { user_id: compte.userId, role: "admin" },
    { onConflict: "user_id,role", ignoreDuplicates: true },
  );
  if (e2) {
    if (!dejaRattache) {
      await admin.from("user_societes").delete().eq("user_id", compte.userId).eq("societe_id", societeId);
    }
    if (!compte.existait) await admin.auth.admin.deleteUser(compte.userId);
    return json({ error: erreurClient(e2.message, "user_roles") }, 500);
  }

  const emailEnvoye = await envoyerInvitation(admin, email, compte, {
    objet: "admin_client",
    nom: nom || undefined,
    cabinetNom: infos.cabinets.nom,
    societeNom: infos.societes.nom,
  }, `cabinet-admin-client-${societeId}-${compte.userId}`);

  return json({ ok: true, user_id: compte.userId, already_existed: compte.existait, email_envoye: emailEnvoye });
}

// ─── renvoyer_invitation ────────────────────────────────────────────────────
async function renvoyerInvitation(ctx: Contexte): Promise<Response> {
  const { admin, callerId, isSuperAdmin, body } = ctx;
  const cible = body.user_id;
  if (!cible || !UUID_RE.test(cible)) return json({ error: "user_id requis" }, 400);

  // Contrôle de l'appelant d'abord ; réponse identique pour un responsable
  // quel que soit le motif du refus.
  const { data: membre } = await admin
    .from("cabinet_membres").select("cabinet_id, cabinets!inner(nom)").eq("user_id", cible).maybeSingle();
  const membreInfos = membre as unknown as { cabinet_id: string; cabinets: { nom: string } } | null;
  if (!isSuperAdmin) {
    const sien = await cabinetDuResponsable(admin, callerId);
    if (!sien || !membreInfos || membreInfos.cabinet_id !== sien) return json({ error: MSG_RENVOI }, 403);
  }

  const { data: u, error: uErr } = await admin.auth.admin.getUserById(cible);
  if (uErr || !u?.user?.email) return json({ error: MSG_RENVOI }, 400);
  if (u.user.last_sign_in_at) return json({ error: MSG_RENVOI }, 400);
  const email = u.user.email;

  let donnees: Record<string, unknown>;
  if (membreInfos) {
    const { data: m } = await admin.from("cabinet_membres").select("role").eq("user_id", cible).maybeSingle();
    donnees = { objet: "membre", cabinetNom: membreInfos.cabinets.nom, roleLibelle: m?.role };
  } else {
    // Super-admin : administrateur d'un client suivi par un cabinet.
    const { data: socs } = await admin.from("user_societes").select("societe_id").eq("user_id", cible);
    const ids = (socs || []).map((s: { societe_id: string }) => s.societe_id);
    const { data: lien } = ids.length
      ? await admin
        .from("cabinet_dossiers")
        .select("cabinets!inner(nom), societes!inner(nom)")
        .in("societe_id", ids)
        .eq("etat", "actif")
        .limit(1)
        .maybeSingle()
      : { data: null };
    if (!lien) return json({ error: MSG_RENVOI }, 400);
    const infos = lien as unknown as { cabinets: { nom: string }; societes: { nom: string } };
    donnees = { objet: "admin_client", cabinetNom: infos.cabinets.nom, societeNom: infos.societes.nom };
  }

  const emailEnvoye = await envoyerInvitation(admin, email, { userId: cible, existait: false }, donnees,
    `cabinet-renvoi-${cible}`);
  return json({ ok: true, user_id: cible, email_envoye: emailEnvoye });
}

// ─── Outils ─────────────────────────────────────────────────────────────────
type Compte = { userId: string; existait: boolean };

/** Compte existant pour cette adresse (profiles.email, comme admin-users). */
async function compteParEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data } = await admin.from("profiles").select("user_id").eq("email", email).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

/**
 * Nouveau compte confirmé, sans mot de passe (choisi par le lien de l'e-mail).
 * « existe » si l'adresse est déjà prise côté auth (compte sans profil).
 */
async function creerCompte(admin: SupabaseClient, email: string, nom: string): Promise<Compte | "existe" | null> {
  const { data: cree, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { nom },
  });
  if (error || !cree.user) {
    const deja = /already|registered|exists/i.test(error?.message ?? "");
    if (!deja) console.error("cabinet-ops (createUser) :", error);
    return deja ? "existe" : null;
  }
  if (nom) await admin.from("profiles").update({ nom }).eq("user_id", cree.user.id);
  return { userId: cree.user.id, existait: false };
}

// Envoie l'invitation ; rend false si l'envoi échoue (l'opération reste faite).
async function envoyerInvitation(
  admin: SupabaseClient,
  email: string,
  compte: Compte,
  donnees: Record<string, unknown>,
  cle: string,
): Promise<boolean> {
  try {
    let lienUrl = `${SITE}/`;
    if (!compte.existait) {
      const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
      const jeton = data?.properties?.hashed_token;
      if (error || !jeton) {
        console.error("cabinet-ops (generateLink recovery) :", error);
        return false;
      }
      lienUrl = `${SITE}/?token_hash=${encodeURIComponent(jeton)}&type=recovery`;
    }
    const { data, error } = await admin.functions.invoke("send-transactional-email", {
      body: {
        templateName: "cabinet-invitation",
        recipientEmail: email,
        idempotencyKey: `${cle}-${Date.now()}`,
        templateData: { ...donnees, lienUrl, nouveauCompte: !compte.existait },
      },
    });
    if (error) {
      console.error("cabinet-ops (send-transactional-email) :", error);
      return false;
    }
    if ((data as { success?: boolean } | null)?.success === false) {
      console.error("cabinet-ops (send-transactional-email) : envoi refusé", data);
      return false;
    }
    return true;
  } catch (e) {
    console.error("cabinet-ops (invitation) :", e);
    return false;
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
