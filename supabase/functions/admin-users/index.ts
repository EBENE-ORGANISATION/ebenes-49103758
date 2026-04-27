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

    const { data: isAdminData, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    const { data: isAdminGeneralData } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin_general",
    });
    const isAdmin = !!isAdminData;
    const isAdminGeneral = !!isAdminGeneralData;
    if (roleErr || (!isAdmin && !isAdminGeneral)) {
      return json({ error: "Accès réservé aux administrateurs" }, 403);
    }

    const body = (await req.json()) as Body;

    switch (body.action) {
      case "list": {
        // Toutes les sociétés (id + nom) pour grouper côté UI.
        const { data: societesAll, error: socErr } = await admin
          .from("societes")
          .select("id, nom")
          .order("nom");
        if (socErr) throw socErr;

        // Toutes les liaisons user <-> société.
        const { data: linksAll, error: linksErr } = await admin
          .from("user_societes")
          .select("user_id, societe_id");
        if (linksErr) throw linksErr;

        // Si l'appelant n'est PAS admin_general, on restreint aux sociétés
        // auxquelles il est lié, et donc aux utilisateurs liés à ces sociétés.
        let visibleUserIds: Set<string> | null = null; // null = pas de filtrage
        let visibleSocieteIds: Set<string> | null = null;
        if (!isAdminGeneral) {
          const { data: myLinks, error: myErr } = await admin
            .from("user_societes")
            .select("societe_id")
            .eq("user_id", userData.user.id);
          if (myErr) throw myErr;
          visibleSocieteIds = new Set((myLinks || []).map((r) => r.societe_id));
          visibleUserIds = new Set<string>();
          for (const l of linksAll || []) {
            if (visibleSocieteIds.has(l.societe_id)) visibleUserIds.add(l.user_id);
          }
          // L'admin de société se voit toujours lui-même.
          visibleUserIds.add(userData.user.id);
        }

        let profilesQuery = admin
          .from("profiles")
          .select("user_id, email, nom, actif, created_at")
          .order("created_at", { ascending: false });
        if (visibleUserIds) {
          profilesQuery = profilesQuery.in("user_id", Array.from(visibleUserIds));
        }
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

        // Map user_id -> liste de societe_id (filtrée à la portée visible)
        const societesByUser: Record<string, string[]> = {};
        for (const l of linksAll || []) {
          if (visibleSocieteIds && !visibleSocieteIds.has(l.societe_id)) continue;
          (societesByUser[l.user_id] ||= []).push(l.societe_id);
        }

        const visibleSocietes = (societesAll || []).filter(
          (s) => !visibleSocieteIds || visibleSocieteIds.has(s.id),
        );

        return json({
          users: (profiles || []).map((p) => ({
            ...p,
            roles: rolesByUser[p.user_id] || [],
            societe_ids: societesByUser[p.user_id] || [],
          })),
          societes: visibleSocietes,
          scope: isAdminGeneral ? "all" : "own_societes",
        });
      }

      case "create": {
        if (!body.email || !body.password) return json({ error: "Email et mot de passe requis" }, 400);
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
        return json({ ok: true, user_id: newUserId });
      }

      case "delete": {
        if (!body.user_id) return json({ error: "user_id requis" }, 400);
        if (body.user_id === userData.user.id) return json({ error: "Vous ne pouvez pas supprimer votre propre compte" }, 400);
        const { error } = await admin.auth.admin.deleteUser(body.user_id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "set_roles": {
        if (!body.user_id || !body.roles) return json({ error: "user_id et roles requis" }, 400);
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
        await admin.from("profiles").update({ actif: body.actif }).eq("user_id", body.user_id);
        // Banir / débanir
        await admin.auth.admin.updateUserById(body.user_id, {
          ban_duration: body.actif ? "none" : "876000h",
        });
        return json({ ok: true });
      }

      case "reset_password": {
        if (!body.user_id || !body.new_password) return json({ error: "user_id et new_password requis" }, 400);
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