import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type AppRole =
  | "admin"
  | "chef_compta"
  | "membre_compta"
  | "chef_grh"
  | "membre_grh"
  | "dashboard_viewer"
  | "employe"
  | "rh"
  | "comptable"
  | "saisie";

interface Body {
  action:
    | "create"
    | "delete"
    | "set_roles"
    | "set_active"
    | "reset_password"
    | "list"
    | "create_employe_account"
    | "send_device_otp"
    | "verify_device_otp"
    | "send_bulletin_email";
  email?: string;
  password?: string;
  nom?: string;
  user_id?: string;
  roles?: AppRole[];
  actif?: boolean;
  new_password?: string;
  /** Pour create_employe_account : info à renvoyer dans la réponse. */
  employe_nom?: string;
  /**
   * Société sur laquelle on veut opérer.
   * - Pour un admin de société : ignoré, on force toujours SES sociétés.
   * - Pour un super-admin : permet de cibler n'importe quelle société (cross-tenant).
   */
  societe_id?: string;
  /** Pour send_device_otp / verify_device_otp */
  device_fp?: string;
  otp_code?: string;
  /** Pour send_bulletin_email */
  bulletin_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Non authentifié" }, 401);
    }

    // Vérifie l'utilisateur appelant et son rôle admin
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Session invalide" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const callerId = userData.user.id;

    // Récupère tous les rôles de l'appelant
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const roleSet = new Set((callerRoles || []).map((r: { role: string }) => r.role));
    const isSuperAdmin = roleSet.has("admin_general") || roleSet.has("super_admin");
    const isAdmin = roleSet.has("admin");
    if (!isSuperAdmin && !isAdmin) {
      return json({ error: "Accès réservé aux administrateurs" }, 403);
    }

    const body = (await req.json()) as Body;

    // ─── Détermine le périmètre de sociétés sur lequel l'appelant peut opérer ───
    // - super-admin : toutes les sociétés (pas de filtre par société)
    // - admin : uniquement les sociétés auxquelles il est rattaché via user_societes
    let allowedSocieteIds: string[] = [];
    if (!isSuperAdmin) {
      const { data: mySocs } = await admin
        .from("user_societes")
        .select("societe_id")
        .eq("user_id", callerId);
      allowedSocieteIds = (mySocs || []).map((r: { societe_id: string }) => r.societe_id);
      if (allowedSocieteIds.length === 0) {
        return json({ error: "Aucune société associée à ce compte admin" }, 403);
      }
    }
    // Société cible (par défaut : la première société de l'admin, ou celle demandée si super-admin)
    const targetSocieteId =
      body.societe_id ||
      (allowedSocieteIds.length > 0 ? allowedSocieteIds[0] : undefined);
    if (!isSuperAdmin && targetSocieteId && !allowedSocieteIds.includes(targetSocieteId)) {
      return json({ error: "Société hors de votre périmètre" }, 403);
    }

    /**
     * Vérifie qu'un utilisateur cible est bien dans le périmètre de l'admin appelant.
     * Le super-admin n'a aucune restriction.
     */
    const userInScope = async (uid: string): Promise<boolean> => {
      if (isSuperAdmin) return true;
      const { data } = await admin
        .from("user_societes")
        .select("societe_id")
        .eq("user_id", uid)
        .in("societe_id", allowedSocieteIds);
      return (data || []).length > 0;
    };

    switch (body.action) {
      case "list": {
        // Sélectionne les user_ids du périmètre.
        let userIds: string[] | null = null;
        if (!isSuperAdmin) {
          const { data: links } = await admin
            .from("user_societes")
            .select("user_id")
            .in("societe_id", allowedSocieteIds);
          userIds = Array.from(new Set((links || []).map((l: { user_id: string }) => l.user_id)));
        }
        let profilesQuery = admin
          .from("profiles")
          .select("user_id, email, nom, actif, created_at")
          .order("created_at", { ascending: false });
        if (userIds) profilesQuery = profilesQuery.in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
        const { data: profiles, error } = await profilesQuery;
        if (error) throw error;
        const { data: rolesData, error: rolesErr } = await admin
          .from("user_roles")
          .select("user_id, role");
        if (rolesErr) throw rolesErr;
        const rolesByUser: Record<string, string[]> = {};
        for (const r of rolesData || []) {
          (rolesByUser[r.user_id] ||= []).push(r.role);
        }
        return json({
          users: (profiles || []).map((p) => ({ ...p, roles: rolesByUser[p.user_id] || [] })),
          societe_id: targetSocieteId ?? null,
        });
      }

      case "create": {
        if (!body.email || !body.password) return json({ error: "Email et mot de passe requis" }, 400);
        // Garde-fou : un admin de société NE PEUT PAS créer un autre super-admin
        if (!isSuperAdmin && body.roles?.some((r) => r === ("admin_general" as AppRole) || r === ("super_admin" as AppRole))) {
          return json({ error: "Création d'un super-admin interdite" }, 403);
        }
        const { data: created, error } = await admin.auth.admin.createUser({
          email: body.email,
          password: body.password,
          email_confirm: true,
          user_metadata: { nom: body.nom || "" },
        });
        if (error) return json({ error: error.message }, 400);
        const newUserId = created.user!.id;
        if (body.roles && body.roles.length) {
          const inserts = body.roles.map((r) => ({ user_id: newUserId, role: r }));
          await admin.from("user_roles").insert(inserts);
        }
        if (body.nom) {
          await admin.from("profiles").update({ nom: body.nom }).eq("user_id", newUserId);
        }
        // Rattacher automatiquement l'utilisateur créé à la société cible
        if (targetSocieteId) {
          await admin.from("user_societes").upsert(
            { user_id: newUserId, societe_id: targetSocieteId, created_by: callerId },
            { onConflict: "user_id,societe_id", ignoreDuplicates: true },
          );
        }
        return json({ ok: true, user_id: newUserId });
      }

      case "delete": {
        if (!body.user_id) return json({ error: "user_id requis" }, 400);
        if (body.user_id === callerId) return json({ error: "Vous ne pouvez pas supprimer votre propre compte" }, 400);
        if (!(await userInScope(body.user_id))) {
          return json({ error: "Utilisateur hors de votre périmètre" }, 403);
        }
        const { error } = await admin.auth.admin.deleteUser(body.user_id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "set_roles": {
        if (!body.user_id || !body.roles) return json({ error: "user_id et roles requis" }, 400);
        if (!(await userInScope(body.user_id))) {
          return json({ error: "Utilisateur hors de votre périmètre" }, 403);
        }
        if (!isSuperAdmin && body.roles.some((r) => r === ("admin_general" as AppRole) || r === ("super_admin" as AppRole))) {
          return json({ error: "Attribution super-admin interdite" }, 403);
        }
        await admin.from("user_roles").delete().eq("user_id", body.user_id);
        if (body.roles.length) {
          const inserts = body.roles.map((r) => ({ user_id: body.user_id!, role: r }));
          const { error } = await admin.from("user_roles").insert(inserts);
          if (error) return json({ error: error.message }, 400);
        }
        return json({ ok: true });
      }

      case "set_active": {
        if (!body.user_id || typeof body.actif !== "boolean") return json({ error: "user_id et actif requis" }, 400);
        if (!(await userInScope(body.user_id))) {
          return json({ error: "Utilisateur hors de votre périmètre" }, 403);
        }
        await admin.from("profiles").update({ actif: body.actif }).eq("user_id", body.user_id);
        // Banir / débanir
        await admin.auth.admin.updateUserById(body.user_id, {
          ban_duration: body.actif ? "none" : "876000h",
        });
        return json({ ok: true });
      }

      case "reset_password": {
        if (!body.user_id || !body.new_password) return json({ error: "user_id et new_password requis" }, 400);
        if (!(await userInScope(body.user_id))) {
          return json({ error: "Utilisateur hors de votre périmètre" }, 403);
        }
        const { error } = await admin.auth.admin.updateUserById(body.user_id, {
          password: body.new_password,
        });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "create_employe_account": {
        // Crée un compte 'employe' (portail self-service) à partir d'un email.
        // Retourne user_id + mot de passe temporaire pour l'admin/RH.
        if (!body.email) return json({ error: "Email requis" }, 400);
        const email = body.email.trim().toLowerCase();

        // Vérifie si un compte existe déjà sur cet email
        const { data: existing } = await admin
          .from("profiles")
          .select("user_id")
          .eq("email", email)
          .maybeSingle();
        if (existing?.user_id) {
          // Rattache à la société cible si pas déjà fait
          if (targetSocieteId) {
            await admin.from("user_societes").upsert(
              { user_id: existing.user_id, societe_id: targetSocieteId, created_by: callerId },
              { onConflict: "user_id,societe_id", ignoreDuplicates: true },
            );
          }
          return json({
            ok: true,
            user_id: existing.user_id,
            already_existed: true,
          });
        }

        // Mot de passe temporaire à 12 caractères
        const tempPassword =
          Math.random().toString(36).slice(-8) +
          Math.random().toString(36).slice(-4).toUpperCase();

        const { data: created, error } = await admin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { nom: body.employe_nom || body.nom || "" },
        });
        if (error) return json({ error: error.message }, 400);
        const newUserId = created.user!.id;

        // Attribuer le rôle 'employe' uniquement
        await admin.from("user_roles").insert([{ user_id: newUserId, role: "employe" }]);
        if (body.employe_nom || body.nom) {
          await admin
            .from("profiles")
            .update({ nom: body.employe_nom || body.nom })
            .eq("user_id", newUserId);
        }
        // Rattacher à la société cible
        if (targetSocieteId) {
          await admin.from("user_societes").upsert(
            { user_id: newUserId, societe_id: targetSocieteId, created_by: callerId },
            { onConflict: "user_id,societe_id", ignoreDuplicates: true },
          );
        }

        // Envoyer l'email d'invitation via Resend
        const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
        if (RESEND_API_KEY) {
          const nomDisplay = body.employe_nom || body.nom || email;
          const emailBody = {
            from: "EBENE Services <noreply@ebnservicess.com>",
            to: [email],
            subject: "Votre accès au Portail Employé — EBENE Services",
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:auto">
                <h2 style="color:#1a1a1a">Bienvenue sur votre Portail Employé</h2>
                <p>Bonjour <strong>${nomDisplay}</strong>,</p>
                <p>Votre accès au portail self-service EBENE a été créé. Vous pouvez maintenant
                   consulter vos bulletins de paie, suivre vos congés et échanger avec
                   l'administration.</p>
                <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:16px 0">
                  <p style="margin:0 0 6px"><strong>Email :</strong> ${email}</p>
                  <p style="margin:0"><strong>Mot de passe temporaire :</strong>
                    <span style="font-family:monospace;font-size:1.1em">${tempPassword}</span>
                  </p>
                </div>
                <p style="color:#e53e3e;font-size:.9em">
                  Veuillez changer ce mot de passe dès votre première connexion.
                </p>
                <p style="color:#666;font-size:.85em;margin-top:24px">
                  Cet email a été envoyé automatiquement par EBENE Business Suite.
                  Si vous n'attendiez pas ce message, ignorez-le.
                </p>
              </div>
            `,
          };
          try {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(emailBody),
            });
          } catch (_) {
            // L'envoi email ne doit pas bloquer la création du compte
          }
        }

        return json({
          ok: true,
          user_id: newUserId,
          temp_password: tempPassword,
          already_existed: false,
        });
      }

      case "send_device_otp": {
        // Génère un code à 6 chiffres, le stocke (hash SHA-256) et l'envoie par email.
        // Accessible à tout utilisateur authentifié (employee inclus).
        const targetEmail = body.email?.trim().toLowerCase() ?? userData.user.email ?? "";
        if (!targetEmail) return json({ error: "Email introuvable" }, 400);

        // Supprimer TOUS les OTP précédents (valides ou expirés) pour cet utilisateur
        // afin de n'avoir qu'un seul code actif à la fois.
        await admin.from("device_otps")
          .delete()
          .eq("user_id", callerId);

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const enc = new TextEncoder();
        const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(code));
        const codeHash = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const { error: insErr } = await admin.from("device_otps").insert({
          user_id: callerId,
          code_hash: codeHash,
          device_fp: body.device_fp ?? null,
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
        if (insErr) return json({ error: insErr.message }, 500);

        const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
        if (!RESEND_API_KEY) {
          return json({ error: "Service d'envoi d'email non configuré (clé RESEND_API_KEY manquante)" }, 500);
        }

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "EBENE Services <noreply@ebnservicess.com>",
            to: [targetEmail],
            subject: "Code de vérification — Nouvel appareil",
            html: `
              <div style="font-family:sans-serif;max-width:480px;margin:auto">
                <h2>Connexion depuis un nouvel appareil</h2>
                <p>Votre code de vérification à usage unique (valide 10 minutes) :</p>
                <div style="font-size:2.5em;font-weight:bold;letter-spacing:.3em;
                            background:#f5f5f5;border-radius:8px;padding:16px;
                            text-align:center;margin:16px 0">
                  ${code}
                </div>
                <p style="color:#e53e3e;font-size:.9em">
                  Si vous n'êtes pas à l'origine de cette connexion, changez
                  immédiatement votre mot de passe.
                </p>
              </div>
            `,
          }),
        }).catch((e: unknown) => ({ ok: false, _fetchErr: String(e) }));

        if (!resendRes.ok) {
          console.error("Resend error:", resendRes.status ?? (resendRes as Record<string, unknown>)._fetchErr);
          return json({ error: "Échec de l'envoi de l'email. Vérifiez la configuration Resend." }, 502);
        }

        return json({ ok: true });
      }

      case "send_bulletin_email": {
        // Envoie un email à l'employé quand son bulletin passe au statut PAYÉ.
        if (!body.bulletin_id) return json({ error: "bulletin_id requis" }, 400);
        const { data: bul } = await admin
          .from("bulletins_paie")
          .select("employe_nom, employe_user_id, mois, annee, net_a_payer, paid_at")
          .eq("id", body.bulletin_id)
          .maybeSingle();
        if (!bul) return json({ error: "Bulletin introuvable" }, 404);

        // Récupère l'email de l'employé depuis auth.users
        let employeEmail: string | null = null;
        if (bul.employe_user_id) {
          const { data: u } = await admin.auth.admin.getUserById(bul.employe_user_id);
          employeEmail = u?.user?.email ?? null;
        }
        if (!employeEmail) return json({ ok: true, skipped: "no_email" });

        const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
        if (!RESEND_API_KEY) return json({ ok: true, skipped: "no_resend_key" });

        const moisNoms = ["Janvier","Février","Mars","Avril","Mai","Juin",
          "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
        const periode = `${moisNoms[bul.mois - 1]} ${bul.annee}`;
        const net = Number(bul.net_a_payer).toLocaleString("fr-FR");

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "EBENE Services <noreply@ebnservicess.com>",
            to: [employeEmail],
            subject: `Votre bulletin de paie — ${periode}`,
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:auto">
                <h2>Votre bulletin de paie ${periode}</h2>
                <p>Bonjour <strong>${bul.employe_nom}</strong>,</p>
                <p>Votre salaire du mois de <strong>${periode}</strong> a été versé.</p>
                <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:16px 0;text-align:center">
                  <p style="margin:0;font-size:.9em;color:#666">Net à payer</p>
                  <p style="margin:4px 0;font-size:1.8em;font-weight:bold;color:#1a7a4a">
                    ${net} F CFA
                  </p>
                </div>
                <p style="font-size:.9em;color:#555">
                  Connectez-vous à votre portail employé pour télécharger votre bulletin en PDF.
                </p>
                <p style="font-size:.8em;color:#999;margin-top:24px">
                  Cet email a été envoyé automatiquement par EBENE Business Suite.
                </p>
              </div>
            `,
          }),
        }).catch(() => undefined);

        return json({ ok: true });
      }

      case "verify_device_otp": {
        if (!body.otp_code) return json({ error: "Code requis" }, 400);
        const code = body.otp_code.trim();
        const enc = new TextEncoder();
        const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(code));
        const codeHash = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const { data: otp, error: selErr } = await admin
          .from("device_otps")
          .select("id, expires_at, used, device_fp")
          .eq("user_id", callerId)
          .eq("code_hash", codeHash)
          .eq("used", false)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (selErr || !otp) {
          return json({ ok: false, error: "Code invalide ou expiré" }, 400);
        }

        // Marquer comme utilisé
        await admin.from("device_otps").update({ used: true }).eq("id", otp.id);
        return json({ ok: true });
      }

      default:
        return json({ error: "Action inconnue" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}