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
    | "create_employe_account";
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

        return json({
          ok: true,
          user_id: newUserId,
          temp_password: tempPassword,
          already_existed: false,
        });
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