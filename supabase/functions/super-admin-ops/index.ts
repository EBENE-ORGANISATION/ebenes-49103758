// Edge Function: super-admin-ops
// Toutes les opérations super-admin transitent par ici. Le service-role key
// n'est JAMAIS exposé côté client. Chaque action vérifie que l'appelant a
// bien le rôle `admin_general` (ou `super_admin`) avant d'exécuter.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Body {
  action: string;
  payload?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "Unauthorized" });
  }

  // Client lié à l'utilisateur (pour valider son JWT et lire user_roles via RLS)
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) {
    return json(401, { error: "Invalid token" });
  }
  const userId = claimsData.claims.sub as string;

  // Vérification super-admin via user_roles (lecture autorisée par RLS pour soi-même)
  const { data: roles, error: rolesErr } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (rolesErr) {
    return json(500, { error: "Cannot read roles" });
  }
  const roleList = (roles ?? []).map((r: { role: string }) => r.role);
  const isSuper = roleList.includes("admin_general") || roleList.includes("super_admin");
  if (!isSuper) {
    return json(403, { error: "Super admin required" });
  }

  // Client privilégié (bypass RLS)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const action = body.action;
  const p = (body.payload ?? {}) as Record<string, any>;

  try {
    switch (action) {
      // ────────── SOCIÉTÉS ──────────
      case "create_societe": {
        // payload: { nom, slug, plan, admin_email, admin_nom?, admin_method?: 'invite'|'password',
        //            admin_password?, config?: {...}, modules?: {...} }
        const { nom, slug, plan, admin_email, admin_nom, admin_method, admin_password, config, modules } = p;
        if (!nom || !slug || !plan) {
          return json(400, { error: "nom, slug, plan requis" });
        }
        if (!admin_email) {
          return json(400, { error: "L'email de l'administrateur est obligatoire" });
        }
        const method = admin_method === "password" ? "password" : "invite";
        if (method === "password") {
          if (!admin_password || String(admin_password).length < 8) {
            return json(400, { error: "Mot de passe requis (min 8 caractères)" });
          }
        }
        const { data: societe, error: e1 } = await admin
          .from("societes")
          .insert({ nom, slug, plan, statut: "active", created_by: userId })
          .select("*")
          .single();
        if (e1) return json(400, { error: e1.message });

        // Le trigger a déjà créé societe_config — on met à jour avec les valeurs fournies
        const cfgPatch: Record<string, any> = {};
        if (config) Object.assign(cfgPatch, config);
        if (modules) Object.assign(cfgPatch, modules);
        if (Object.keys(cfgPatch).length) {
          await admin.from("societe_config").update(cfgPatch).eq("societe_id", societe.id);
        }

        // Création du compte admin (obligatoire)
        const targetEmail = String(admin_email).trim().toLowerCase();
        let invited: {
          user_id: string | null;
          email: string | null;
          method: "invite" | "password";
          password?: string;
          already_existed?: boolean;
        } = { user_id: null, email: null, method };

        // Vérifier si l'email correspond déjà à un utilisateur
        const { data: allUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existing = allUsers?.users.find(
          (u) => u.email?.toLowerCase() === targetEmail,
        );

        let adminUserId: string | null = existing?.id ?? null;

        if (existing) {
          invited = { user_id: existing.id, email: existing.email ?? targetEmail, method, already_existed: true };
        } else if (method === "password") {
          const { data: created, error: cErr } = await admin.auth.admin.createUser({
            email: targetEmail,
            password: String(admin_password),
            email_confirm: true,
            user_metadata: { nom: admin_nom || "" },
          });
          if (cErr) {
            return json(207, {
              warning: "Société créée, création du compte admin échouée : " + cErr.message,
              societe,
            });
          }
          adminUserId = created.user!.id;
          invited = {
            user_id: adminUserId,
            email: targetEmail,
            method: "password",
            password: String(admin_password),
          };
        } else {
          // Mode invitation : envoie email pour définir le mdp
          const redirectTo = `${new URL(req.url).origin.replace("functions.supabase.co", "lovable.app")}/auth`;
          const { data: invite, error: invErr } = await admin.auth.admin.inviteUserByEmail(
            targetEmail,
            { redirectTo, data: admin_nom ? { nom: admin_nom } : undefined },
          );
          if (invErr) {
            return json(207, {
              warning: "Société créée, invitation échouée : " + invErr.message,
              societe,
            });
          }
          adminUserId = invite?.user?.id ?? null;
          invited = { user_id: adminUserId, email: targetEmail, method: "invite" };
        }

        // Lier le compte à la société + rôle admin + nom de profil
        if (adminUserId) {
          await admin.from("user_societes").upsert(
            { user_id: adminUserId, societe_id: societe.id, created_by: userId },
            { onConflict: "user_id,societe_id", ignoreDuplicates: true },
          );
          await admin.from("user_roles").upsert(
            { user_id: adminUserId, role: "admin" },
            { onConflict: "user_id,role", ignoreDuplicates: true },
          );
          if (admin_nom) {
            await admin.from("profiles").update({ nom: admin_nom }).eq("user_id", adminUserId);
          }
        }

        return json(200, { societe, invited });
      }

      case "update_societe": {
        const { id, patch } = p;
        if (!id || !patch) return json(400, { error: "id, patch requis" });
        const { data, error } = await admin
          .from("societes")
          .update(patch)
          .eq("id", id)
          .select("*")
          .single();
        if (error) return json(400, { error: error.message });
        return json(200, { societe: data });
      }

      case "suspend_societe": {
        const { id, statut } = p; // statut: 'active' | 'suspendu'
        if (!id || !statut) return json(400, { error: "id, statut requis" });
        const { error } = await admin.from("societes").update({ statut }).eq("id", id);
        if (error) return json(400, { error: error.message });
        return json(200, { ok: true });
      }

      case "delete_societe": {
        const { id } = p;
        if (!id) return json(400, { error: "id requis" });
        await admin.from("user_societes").delete().eq("societe_id", id);
        await admin.from("societe_config").delete().eq("societe_id", id);
        const { error } = await admin.from("societes").delete().eq("id", id);
        if (error) return json(400, { error: error.message });
        return json(200, { ok: true });
      }

      case "update_societe_config": {
        const { societe_id, patch } = p;
        if (!societe_id || !patch) return json(400, { error: "societe_id, patch requis" });
        const { data, error } = await admin
          .from("societe_config")
          .update(patch)
          .eq("societe_id", societe_id)
          .select("*")
          .single();
        if (error) return json(400, { error: error.message });
        return json(200, { config: data });
      }

      // ────────── UTILISATEURS ──────────
      case "list_users": {
        // page optionnelle
        const page = (p.page as number) ?? 1;
        const perPage = (p.perPage as number) ?? 200;
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) return json(400, { error: error.message });

        const userIds = data.users.map((u) => u.id);
        // Profils
        const { data: profiles } = await admin
          .from("profiles")
          .select("user_id, nom, email, actif")
          .in("user_id", userIds);
        // Rôles
        const { data: rolesRows } = await admin
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds);
        // Liens société
        const { data: links } = await admin
          .from("user_societes")
          .select("user_id, societe_id, societes(nom, slug)")
          .in("user_id", userIds);

        const enriched = data.users.map((u) => ({
          id: u.id,
          email: u.email,
          last_sign_in_at: u.last_sign_in_at,
          created_at: u.created_at,
          banned_until: (u as any).banned_until ?? null,
          profile: profiles?.find((pr) => pr.user_id === u.id) ?? null,
          roles: rolesRows?.filter((r) => r.user_id === u.id).map((r) => r.role) ?? [],
          societes: links?.filter((l) => l.user_id === u.id) ?? [],
        }));
        return json(200, { users: enriched, total: data.users.length });
      }

      case "set_user_role": {
        const { user_id, role, mode } = p; // mode: 'add' | 'remove'
        if (!user_id || !role) return json(400, { error: "user_id, role requis" });
        // Garde-fou : `admin_general` ne peut être attribué qu'au compte
        // racine de l'app mère (ennodbelei75@gmail.com). Toute autre tentative
        // est silencieusement refusée afin de garantir un super-admin unique.
        if (role === "admin_general" && mode !== "remove") {
          const { data: target } = await admin.auth.admin.getUserById(String(user_id));
          if (target?.user?.email?.toLowerCase() !== "ennodbelei75@gmail.com") {
            return json(403, {
              error: "Le rôle super-admin est réservé au compte racine de l'app mère.",
            });
          }
        }
        if (mode === "remove") {
          await admin.from("user_roles").delete().eq("user_id", user_id).eq("role", role);
        } else {
          await admin.from("user_roles").upsert(
            { user_id, role },
            { onConflict: "user_id,role", ignoreDuplicates: true },
          );
        }
        return json(200, { ok: true });
      }

      case "deactivate_user": {
        const { user_id, actif } = p;
        if (!user_id || typeof actif !== "boolean") {
          return json(400, { error: "user_id, actif requis" });
        }
        // Bannir / dé-bannir via auth.admin
        await admin.auth.admin.updateUserById(user_id, {
          ban_duration: actif ? "none" : "876000h", // ~100 ans
        });
        await admin.from("profiles").update({ actif }).eq("user_id", user_id);
        return json(200, { ok: true });
      }

      case "reset_password": {
        const { email } = p;
        if (!email) return json(400, { error: "email requis" });
        const redirectTo = `${new URL(req.url).origin.replace("functions.supabase.co", "lovable.app")}/auth`;
        const { error } = await admin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo },
        });
        if (error) return json(400, { error: error.message });
        return json(200, { ok: true });
      }

      // ────────── MON COMPTE (super-admin) ──────────
      case "update_my_email": {
        const { new_email, current_password } = p;
        if (!new_email || !current_password) {
          return json(400, { error: "new_email et current_password requis" });
        }
        // Re-authentifier le super-admin avec son mot de passe actuel
        const { data: me } = await admin.auth.admin.getUserById(userId);
        if (!me?.user?.email) return json(400, { error: "Email actuel introuvable" });
        const targetEmail = String(new_email).trim().toLowerCase();
        if (targetEmail === me.user.email.toLowerCase()) {
          return json(400, { error: "Le nouvel email est identique à l'actuel" });
        }
        const { error: signInErr } = await userClient.auth.signInWithPassword({
          email: me.user.email,
          password: String(current_password),
        });
        if (signInErr) return json(401, { error: "Mot de passe actuel incorrect" });

        // Vérifier qu'aucun autre compte n'utilise déjà cet email
        const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const conflict = existing?.users.find(
          (u) => u.id !== userId && u.email?.toLowerCase() === targetEmail,
        );
        if (conflict) {
          return json(409, { error: "Cet email est déjà utilisé par un autre compte" });
        }

        const { data, error } = await admin.auth.admin.updateUserById(userId, {
          email: targetEmail,
          email_confirm: true,
        });
        if (error) {
          const msg = error.message?.includes("duplicate")
            ? "Cet email est déjà utilisé par un autre compte"
            : error.message || "Erreur de mise à jour";
          return json(400, { error: msg });
        }
        // Mettre à jour le profil
        await admin.from("profiles").update({ email: targetEmail }).eq("user_id", userId);
        return json(200, { ok: true, user: { id: data.user?.id, email: data.user?.email } });
      }

      case "update_my_password": {
        const { new_password, current_password } = p;
        if (!new_password || !current_password) {
          return json(400, { error: "new_password et current_password requis" });
        }
        if (String(new_password).length < 8) {
          return json(400, { error: "Le nouveau mot de passe doit faire au moins 8 caractères" });
        }
        const { data: me } = await admin.auth.admin.getUserById(userId);
        if (!me?.user?.email) return json(400, { error: "Email introuvable" });
        const { error: signInErr } = await userClient.auth.signInWithPassword({
          email: me.user.email,
          password: String(current_password),
        });
        if (signInErr) return json(401, { error: "Mot de passe actuel incorrect" });

        const { error } = await admin.auth.admin.updateUserById(userId, {
          password: String(new_password),
        });
        if (error) return json(400, { error: error.message });
        return json(200, { ok: true });
      }

      // ────────── STATISTIQUES ──────────
      case "stats": {
        const [{ count: societesCount }, { count: usersCount }, { data: recentAudit }] = await Promise.all([
          admin.from("societes").select("*", { count: "exact", head: true }).eq("statut", "active"),
          admin.from("profiles").select("*", { count: "exact", head: true }).eq("actif", true),
          admin.from("audit_log").select("*").order("created_at", { ascending: false }).limit(20),
        ]);

        // Sociétés créées par mois (12 derniers mois)
        const since = new Date();
        since.setMonth(since.getMonth() - 11);
        since.setDate(1);
        const { data: societesAll } = await admin
          .from("societes")
          .select("created_at")
          .gte("created_at", since.toISOString());
        const buckets: Record<string, number> = {};
        for (let i = 0; i < 12; i++) {
          const d = new Date(since);
          d.setMonth(since.getMonth() + i);
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          buckets[k] = 0;
        }
        (societesAll ?? []).forEach((s: any) => {
          const d = new Date(s.created_at);
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (k in buckets) buckets[k]++;
        });
        const chart = Object.entries(buckets).map(([mois, n]) => ({ mois, n }));

        // Connexions aujourd'hui (depuis auth.admin)
        const { data: usersList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const connexionsToday = (usersList?.users ?? []).filter(
          (u) => u.last_sign_in_at && new Date(u.last_sign_in_at) >= today,
        ).length;

        return json(200, {
          societes_actives: societesCount ?? 0,
          utilisateurs_actifs: usersCount ?? 0,
          connexions_today: connexionsToday,
          recent_audit: recentAudit ?? [],
          chart_societes_par_mois: chart,
        });
      }

      default:
        return json(400, { error: `Action inconnue: ${action}` });
    }
  } catch (e) {
    console.error("super-admin-ops error", e);
    return json(500, { error: (e as Error).message });
  }
});