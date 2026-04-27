import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Plus,
  Loader2,
  Pause,
  Play,
  Trash2,
  Users,
  Building2,
  Activity,
  Settings2,
  KeyRound,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { callSuperAdmin, MODULE_LABELS, type ModuleFlags } from "@/lib/superAdminApi";
import { CreerSocieteModal } from "./CreerSocieteModal";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface SocieteRow {
  id: string;
  nom: string;
  slug: string | null;
  plan: string;
  statut: string;
  created_at: string;
}

interface SocieteConfigRow extends ModuleFlags {
  societe_id: string;
}

interface UserRow {
  id: string;
  email: string | null;
  last_sign_in_at: string | null;
  created_at: string | null;
  banned_until: string | null;
  profile: { nom: string | null; email: string | null; actif: boolean } | null;
  roles: string[];
  societes: Array<{ societe_id: string; societes: { nom: string; slug: string } | null }>;
}

interface Stats {
  societes_actives: number;
  utilisateurs_actifs: number;
  connexions_today: number;
  recent_audit: Array<{ id: string; created_at: string; user_email: string | null; action: string; table_name: string }>;
  chart_societes_par_mois: Array<{ mois: string; n: number }>;
}

const ROLE_OPTIONS = [
  "admin",
  "chef_compta",
  "membre_compta",
  "chef_grh",
  "membre_grh",
  "dashboard_viewer",
  "employe",
] as const;

export const SuperAdminPanel = () => {
  const navigate = useNavigate();
  const [societes, setSocietes] = useState<SocieteRow[]>([]);
  const [configs, setConfigs] = useState<Record<string, SocieteConfigRow>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SocieteRow | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: socs }, { data: cfgs }, { data: links }] = await Promise.all([
        supabase.from("societes").select("id, nom, slug, plan, statut, created_at").order("created_at", { ascending: false }),
        supabase.from("societe_config").select("*"),
        supabase.from("user_societes").select("societe_id"),
      ]);
      setSocietes((socs ?? []) as SocieteRow[]);
      const cfgMap: Record<string, SocieteConfigRow> = {};
      (cfgs ?? []).forEach((c: any) => { cfgMap[c.societe_id] = c; });
      setConfigs(cfgMap);
      const cnt: Record<string, number> = {};
      (links ?? []).forEach((l: any) => { cnt[l.societe_id] = (cnt[l.societe_id] ?? 0) + 1; });
      setCounts(cnt);

      const [usersRes, statsRes] = await Promise.all([
        callSuperAdmin<{ users: UserRow[] }>("list_users"),
        callSuperAdmin<Stats>("stats"),
      ]);
      setUsers(usersRes.users);
      setStats(statsRes);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // ─── Actions sociétés ───
  const toggleSuspend = async (s: SocieteRow) => {
    const next = s.statut === "active" ? "suspendu" : "active";
    try {
      await callSuperAdmin("suspend_societe", { id: s.id, statut: next });
      toast.success(next === "active" ? "Société réactivée" : "Société suspendue");
      loadAll();
    } catch (e) { toast.error((e as Error).message); }
  };

  const deleteSociete = async (s: SocieteRow) => {
    try {
      await callSuperAdmin("delete_societe", { id: s.id });
      toast.success("Société supprimée");
      setConfirmDelete(null);
      loadAll();
    } catch (e) { toast.error((e as Error).message); }
  };

  const updateModule = async (societeId: string, key: keyof ModuleFlags, value: boolean) => {
    setConfigs((prev) => ({ ...prev, [societeId]: { ...prev[societeId], [key]: value } }));
    try {
      await callSuperAdmin("update_societe_config", {
        societe_id: societeId,
        patch: { [key]: value },
      });
    } catch (e) {
      toast.error((e as Error).message);
      loadAll();
    }
  };

  const updatePlan = async (s: SocieteRow, plan: string) => {
    try {
      await callSuperAdmin("update_societe", { id: s.id, patch: { plan } });
      toast.success("Plan mis à jour");
      loadAll();
    } catch (e) { toast.error((e as Error).message); }
  };

  // ─── Actions utilisateurs ───
  const setUserRole = async (u: UserRow, role: string) => {
    try {
      await callSuperAdmin("set_user_role", { user_id: u.id, role, mode: "add" });
      toast.success(`Rôle ${role} attribué`);
      loadAll();
    } catch (e) { toast.error((e as Error).message); }
  };

  const toggleActif = async (u: UserRow) => {
    const actif = !(u.profile?.actif ?? true);
    try {
      await callSuperAdmin("deactivate_user", { user_id: u.id, actif });
      toast.success(actif ? "Compte réactivé" : "Compte désactivé");
      loadAll();
    } catch (e) { toast.error((e as Error).message); }
  };

  const resetPwd = async (u: UserRow) => {
    if (!u.email) return;
    try {
      await callSuperAdmin("reset_password", { email: u.email });
      toast.success("Email de réinitialisation envoyé");
    } catch (e) { toast.error((e as Error).message); }
  };

  const moduleKeys = useMemo(() => Object.keys(MODULE_LABELS) as Array<keyof ModuleFlags>, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="size-4 mr-1" /> Retour
          </Button>
          <div>
            <h1 className="font-bold text-lg leading-tight">Super Admin</h1>
            <p className="text-xs text-muted-foreground">Gestion globale de la plateforme</p>
          </div>
        </div>
        <Badge variant="outline" className="bg-primary/10 text-primary">Mode Super-Admin</Badge>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="societes" className="w-full">
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full mb-5 h-auto">
              <TabsTrigger value="societes" className="py-2.5"><Building2 className="size-4 mr-1.5" /> Sociétés</TabsTrigger>
              <TabsTrigger value="modules" className="py-2.5"><Settings2 className="size-4 mr-1.5" /> Modules</TabsTrigger>
              <TabsTrigger value="users" className="py-2.5"><Users className="size-4 mr-1.5" /> Utilisateurs</TabsTrigger>
              <TabsTrigger value="stats" className="py-2.5"><Activity className="size-4 mr-1.5" /> Activité</TabsTrigger>
            </TabsList>

            {/* TAB 1 — SOCIÉTÉS */}
            <TabsContent value="societes">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Sociétés</CardTitle>
                  <Button onClick={() => setCreating(true)}>
                    <Plus className="size-4 mr-1.5" /> Créer une société
                  </Button>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Utilisateurs</TableHead>
                        <TableHead>Créée le</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {societes.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.nom}</TableCell>
                          <TableCell className="font-mono text-xs">{s.slug ?? "—"}</TableCell>
                          <TableCell><Badge variant="outline">{s.plan}</Badge></TableCell>
                          <TableCell>
                            <Badge className={s.statut === "active" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}>
                              {s.statut}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{counts[s.id] ?? 0}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(s.created_at).toLocaleDateString("fr-FR")}
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button size="sm" variant="ghost" onClick={() => toggleSuspend(s)} title={s.statut === "active" ? "Suspendre" : "Réactiver"}>
                              {s.statut === "active" ? <Pause className="size-4" /> : <Play className="size-4" />}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(s)} title="Supprimer">
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!societes.length && (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Aucune société</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 2 — MODULES */}
            <TabsContent value="modules">
              <div className="space-y-4">
                {societes.map((s) => {
                  const cfg = configs[s.id];
                  return (
                    <Card key={s.id}>
                      <CardHeader className="flex-row items-center justify-between">
                        <div>
                          <CardTitle className="text-base">{s.nom}</CardTitle>
                          <p className="text-xs text-muted-foreground">{s.slug}</p>
                        </div>
                        <Select value={s.plan} onValueChange={(v) => updatePlan(s, v)}>
                          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="starter">Starter</SelectItem>
                            <SelectItem value="pro">Pro</SelectItem>
                            <SelectItem value="enterprise">Enterprise</SelectItem>
                          </SelectContent>
                        </Select>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {moduleKeys.map((k) => (
                            <div key={k} className="flex items-center justify-between rounded-md border px-3 py-2">
                              <span className="text-sm">{MODULE_LABELS[k]}</span>
                              <Switch
                                checked={cfg?.[k] ?? false}
                                onCheckedChange={(v) => updateModule(s.id, k, v)}
                              />
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            {/* TAB 3 — UTILISATEURS */}
            <TabsContent value="users">
              <Card>
                <CardHeader><CardTitle>Tous les utilisateurs ({users.length})</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Nom</TableHead>
                        <TableHead>Société(s)</TableHead>
                        <TableHead>Rôle(s)</TableHead>
                        <TableHead>Dernière connexion</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => {
                        const actif = u.profile?.actif ?? true;
                        const banned = !!u.banned_until && new Date(u.banned_until) > new Date();
                        return (
                          <TableRow key={u.id}>
                            <TableCell className="text-xs">{u.email}</TableCell>
                            <TableCell>{u.profile?.nom ?? "—"}</TableCell>
                            <TableCell className="text-xs">
                              {u.societes.map((s) => s.societes?.nom).filter(Boolean).join(", ") || "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {u.roles.length
                                  ? u.roles.map((r) => <Badge key={r} variant="outline" className="text-xs">{r}</Badge>)
                                  : <span className="text-xs text-muted-foreground">—</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("fr-FR") : "Jamais"}
                            </TableCell>
                            <TableCell>
                              {banned || !actif
                                ? <Badge variant="destructive">Désactivé</Badge>
                                : <Badge className="bg-success text-success-foreground">Actif</Badge>}
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              <Select onValueChange={(v) => setUserRole(u, v)}>
                                <SelectTrigger className="h-8 w-32 inline-flex"><SelectValue placeholder="+ Rôle" /></SelectTrigger>
                                <SelectContent>
                                  {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Button size="sm" variant="ghost" onClick={() => toggleActif(u)} title={actif ? "Désactiver" : "Réactiver"}>
                                <UserX className="size-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => resetPwd(u)} title="Réinitialiser mot de passe">
                                <KeyRound className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 4 — STATISTIQUES */}
            <TabsContent value="stats">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Sociétés actives</CardTitle></CardHeader>
                  <CardContent><div className="text-3xl font-bold">{stats?.societes_actives ?? 0}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Utilisateurs actifs</CardTitle></CardHeader>
                  <CardContent><div className="text-3xl font-bold">{stats?.utilisateurs_actifs ?? 0}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Connexions aujourd'hui</CardTitle></CardHeader>
                  <CardContent><div className="text-3xl font-bold">{stats?.connexions_today ?? 0}</div></CardContent>
                </Card>
              </div>

              <Card className="mb-4">
                <CardHeader><CardTitle>Nouvelles sociétés (12 derniers mois)</CardTitle></CardHeader>
                <CardContent style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats?.chart_societes_par_mois ?? []}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="n" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Dernières actions (audit)</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Utilisateur</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Table</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(stats?.recent_audit ?? []).map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs">{new Date(a.created_at).toLocaleString("fr-FR")}</TableCell>
                          <TableCell className="text-xs">{a.user_email ?? "—"}</TableCell>
                          <TableCell><Badge variant="outline">{a.action}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{a.table_name}</TableCell>
                        </TableRow>
                      ))}
                      {!(stats?.recent_audit?.length) && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Aucune activité récente</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>

      <CreerSocieteModal open={creating} onOpenChange={setCreating} onCreated={loadAll} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette société ?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{confirmDelete?.nom}</strong> et toutes ses configurations seront supprimées.
              Les utilisateurs liés à cette société perdront leur accès. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete && deleteSociete(confirmDelete)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SuperAdminPanel;