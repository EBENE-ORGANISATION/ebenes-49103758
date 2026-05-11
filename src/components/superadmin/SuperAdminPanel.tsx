import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
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
  UserCog,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { callSuperAdmin, MODULE_LABELS, type ModuleFlags } from "@/lib/superAdminApi";
import { CreerSocieteModal } from "./CreerSocieteModal";
import { MonCompteSection } from "./MonCompteSection";
import { useTenant } from "@/hooks/useTenant";
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
  nif?: string | null;
  rccm?: string | null;
  adresse?: string | null;
  logo_url?: string | null;
  couleur_primaire?: string | null;
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

// ─── Composant MiseAJourPanel ────────────────────────────────────────────────

const MiseAJourPanel = ({ stats }: { stats: Stats | null }) => {
  const [version, setVersion] = useState("1.1.3");
  const [message, setMessage] = useState("");
  const [delai, setDelai] = useState(30);
  const [sending, setSending] = useState(false);
  const [historique, setHistorique] = useState<Array<{ts: number; version: string; message: string; by: string}>>([]);

  useEffect(() => {
    // Charger l'historique des MAJ depuis app_state
    supabase
      .from("app_state")
      .select("value")
      .eq("key", "global:update_history")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value && Array.isArray(data.value)) {
          setHistorique(data.value as Array<{ts: number; version: string; message: string; by: string}>);
        }
      });
  }, []);

  const lancerMAJ = async () => {
    if (!version.trim()) {
      toast.error("Renseigne un numéro de version");
      return;
    }
    if (!confirm(`Envoyer le signal de mise à jour v${version} à TOUS les utilisateurs connectés ?\n\nIls verront une bannière et l'app se rechargera automatiquement dans ${delai} secondes.`)) return;

    setSending(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        version,
        message: message.trim() || `Mise à jour v${version} disponible`,
        delai_secondes: delai,
        ts: Date.now(),
        by: userData.user?.email ?? "superadmin",
      };

      // Écrire le signal dans app_state (les clients écoutent via Realtime)
      await supabase
        .from("app_state")
        .upsert({
          key: "global:update_signal",
          value: payload as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });

      // Sauvegarder dans l'historique
      const newHistorique = [payload, ...historique].slice(0, 20);
      await supabase
        .from("app_state")
        .upsert({
          key: "global:update_history",
          value: newHistorique as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });

      setHistorique(newHistorique);
      toast.success(`Signal de mise à jour v${version} envoyé à ${stats?.utilisateurs_actifs ?? 0} utilisateurs`);
      setMessage("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="size-5 text-primary" />
            Publier une mise à jour
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Envoie un signal à tous les utilisateurs connectés. Ils verront une bannière
            de notification et l'application se rechargera automatiquement.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Numéro de version</Label>
              <Input
                value={version}
                onChange={e => setVersion(e.target.value)}
                placeholder="ex: 1.2.0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Délai avant rechargement automatique (secondes)</Label>
              <Select value={String(delai)} onValueChange={v => setDelai(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 secondes</SelectItem>
                  <SelectItem value="30">30 secondes</SelectItem>
                  <SelectItem value="60">1 minute</SelectItem>
                  <SelectItem value="120">2 minutes</SelectItem>
                  <SelectItem value="300">5 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Message pour les utilisateurs (optionnel)</Label>
            <Input
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="ex: Nouvelles fonctionnalités GRH disponibles"
            />
          </div>
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            <strong>Aperçu de la bannière :</strong><br />
            🔄 {message.trim() || `Mise à jour v${version} disponible`} — Rechargement automatique dans {delai}s
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={lancerMAJ} disabled={sending} className="gap-2">
              {sending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Envoyer le signal de mise à jour
            </Button>
            <div className="text-xs text-muted-foreground">
              {stats?.utilisateurs_actifs ?? 0} utilisateur(s) actif(s) seront notifiés
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historique des mises à jour</CardTitle>
        </CardHeader>
        <CardContent>
          {historique.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucune mise à jour publiée</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Par</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historique.map((h, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(h.ts).toLocaleString("fr-FR")}
                    </TableCell>
                    <TableCell><Badge variant="outline">v{h.version}</Badge></TableCell>
                    <TableCell className="text-xs">{h.message}</TableCell>
                    <TableCell className="text-xs">{h.by}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Composant principal ─────────────────────────────────────────────────────

export const SuperAdminPanel = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { setCurrentSocieteId } = useTenant();
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
      // On exclut la société technique "_modele" des listes — elle est gérée
      // séparément dans l'onglet "Défauts globaux".
      setSocietes(((socs ?? []) as SocieteRow[]).filter((s) => s.slug !== "_modele"));
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
      toast.success(next === "active" ? t("superadmin.society_reactivated") : t("superadmin.society_suspended"));
      loadAll();
    } catch (e) { toast.error((e as Error).message); }
  };

  const deleteSociete = async (s: SocieteRow) => {
    try {
      await callSuperAdmin("delete_societe", { id: s.id });
      toast.success(t("superadmin.society_deleted"));
      setConfirmDelete(null);
      loadAll();
    } catch (e) { toast.error((e as Error).message); }
  };

  /**
   * "Impersonate" : le super-admin entre dans le contexte d'une société pour
   * accéder à TOUTES ses fonctionnalités comme s'il en était l'admin local.
   * On définit la société courante puis on redirige vers l'app principale.
   */
  const enterSociete = (s: SocieteRow) => {
    // Ouvrir la société dans un nouvel onglet complètement isolé
    // On passe l'ID via un paramètre URL hashé pour que le nouvel onglet
    // charge directement la bonne société sans partager le state React
    const url = `${window.location.origin}${window.location.pathname}#/?sid=${s.id}`;
    window.open(url, `societe_${s.id}`);
    toast.success(`${s.nom} ouvert dans un nouvel onglet`);
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
      toast.success(t("superadmin.plan_updated"));
      loadAll();
    } catch (e) { toast.error((e as Error).message); }
  };

  // ─── Actions utilisateurs ───
  const setUserRole = async (u: UserRow, role: string) => {
    try {
      await callSuperAdmin("set_user_role", { user_id: u.id, role, mode: "add" });
      toast.success(t("superadmin.role_assigned", { role }));
      loadAll();
    } catch (e) { toast.error((e as Error).message); }
  };

  const toggleActif = async (u: UserRow) => {
    const actif = !(u.profile?.actif ?? true);
    try {
      await callSuperAdmin("deactivate_user", { user_id: u.id, actif });
      toast.success(actif ? t("superadmin.account_reactivated") : t("superadmin.account_deactivated"));
      loadAll();
    } catch (e) { toast.error((e as Error).message); }
  };

  const resetPwd = async (u: UserRow) => {
    if (!u.email) return;
    try {
      await callSuperAdmin("reset_password", { email: u.email });
      toast.success(t("superadmin.reset_email_sent"));
    } catch (e) { toast.error((e as Error).message); }
  };

  const moduleKeys = useMemo(() => Object.keys(MODULE_LABELS) as Array<keyof ModuleFlags>, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="size-4 mr-1" /> {t("superadmin.back")}
          </Button>
          <div>
            <h1 className="font-bold text-lg leading-tight">{t("superadmin.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("superadmin.subtitle")}</p>
          </div>
        </div>
        <Badge variant="outline" className="bg-primary/10 text-primary">{t("superadmin.mode_badge")}</Badge>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="societes" className="w-full">
            <TabsList className="grid grid-cols-2 sm:grid-cols-7 w-full mb-5 h-auto">
              <TabsTrigger value="societes" className="py-2.5"><Building2 className="size-4 mr-1.5" /> {t("superadmin.tab_societies")}</TabsTrigger>
              <TabsTrigger value="parametres" className="py-2.5">
                <Settings2 className="size-4 mr-1.5" /> Paramètres
              </TabsTrigger>
              <TabsTrigger value="modules" className="py-2.5"><Settings2 className="size-4 mr-1.5" /> {t("superadmin.tab_modules")}</TabsTrigger>
              <TabsTrigger value="users" className="py-2.5"><Users className="size-4 mr-1.5" /> {t("superadmin.tab_users")}</TabsTrigger>
              <TabsTrigger value="stats" className="py-2.5"><Activity className="size-4 mr-1.5" /> {t("superadmin.tab_activity")}</TabsTrigger>
              <TabsTrigger value="miseajour" className="py-2.5">
                <RefreshCw className="size-4 mr-1.5" /> Mise à jour
              </TabsTrigger>
              <TabsTrigger value="account" className="py-2.5"><UserCog className="size-4 mr-1.5" /> {t("superadmin.tab_account")}</TabsTrigger>
            </TabsList>

            {/* TAB 1 — SOCIÉTÉS */}
            <TabsContent value="societes">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>{t("superadmin.societies")}</CardTitle>
                  <Button onClick={() => setCreating(true)}>
                    <Plus className="size-4 mr-1.5" /> {t("superadmin.create_society")}
                  </Button>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("superadmin.col_name")}</TableHead>
                        <TableHead>{t("superadmin.col_slug")}</TableHead>
                        <TableHead>{t("superadmin.col_plan")}</TableHead>
                        <TableHead>{t("superadmin.col_status")}</TableHead>
                        <TableHead className="text-right">{t("superadmin.col_users")}</TableHead>
                        <TableHead>{t("superadmin.col_created")}</TableHead>
                        <TableHead className="text-right">{t("superadmin.col_actions")}</TableHead>
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
                            {new Date(s.created_at).toLocaleDateString(i18n.language)}
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => enterSociete(s)}
                              title={`Ouvrir ${s.nom} dans un nouvel onglet`}
                            >
                              <ExternalLink className="size-4 mr-1" /> Ouvrir
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => toggleSuspend(s)} title={s.statut === "active" ? t("superadmin.suspend") : t("superadmin.reactivate")}>
                              {s.statut === "active" ? <Pause className="size-4" /> : <Play className="size-4" />}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(s)} title={t("superadmin.delete")}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!societes.length && (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">{t("superadmin.no_society")}</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB — PARAMÈTRES PAR SOCIÉTÉ */}
            <TabsContent value="parametres">
              <div className="space-y-4">
                {societes.map((s) => {
                  const cfg = configs[s.id];
                  return (
                    <Card key={s.id}>
                      <CardHeader className="flex-row items-center justify-between pb-3">
                        <div>
                          <CardTitle className="text-base">{s.nom}</CardTitle>
                          <p className="text-xs text-muted-foreground font-mono">{s.slug}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => enterSociete(s)}
                          className="gap-1.5"
                        >
                          <ExternalLink className="size-4" /> Ouvrir
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label>Nom de la société</Label>
                            <div className="flex gap-2">
                              <Input
                                defaultValue={s.nom}
                                onBlur={async (e) => {
                                  const newNom = e.target.value.trim();
                                  if (!newNom || newNom === s.nom) return;
                                  try {
                                    await callSuperAdmin("update_societe", { id: s.id, patch: { nom: newNom } });
                                    toast.success("Nom mis à jour");
                                    loadAll();
                                  } catch (err) { toast.error((err as Error).message); }
                                }}
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Couleur principale</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="color"
                                defaultValue={cfg?.couleur_primaire ?? "#1F3864"}
                                className="w-16 h-9 p-1"
                                onBlur={async (e) => {
                                  try {
                                    await callSuperAdmin("update_societe_config", {
                                      societe_id: s.id,
                                      patch: { couleur_primaire: e.target.value },
                                    });
                                    toast.success("Couleur mise à jour");
                                  } catch (err) { toast.error((err as Error).message); }
                                }}
                              />
                              <Input
                                defaultValue={cfg?.couleur_primaire ?? "#1F3864"}
                                className="font-mono text-sm"
                                onBlur={async (e) => {
                                  try {
                                    await callSuperAdmin("update_societe_config", {
                                      societe_id: s.id,
                                      patch: { couleur_primaire: e.target.value },
                                    });
                                    toast.success("Couleur mise à jour");
                                  } catch (err) { toast.error((err as Error).message); }
                                }}
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label>NIF</Label>
                            <Input
                              defaultValue={cfg?.nif ?? ""}
                              placeholder="Numéro d'identification fiscale"
                              onBlur={async (e) => {
                                try {
                                  await callSuperAdmin("update_societe_config", {
                                    societe_id: s.id,
                                    patch: { nif: e.target.value.trim() || null },
                                  });
                                } catch (err) { toast.error((err as Error).message); }
                              }}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>RCCM</Label>
                            <Input
                              defaultValue={cfg?.rccm ?? ""}
                              placeholder="Registre du commerce"
                              onBlur={async (e) => {
                                try {
                                  await callSuperAdmin("update_societe_config", {
                                    societe_id: s.id,
                                    patch: { rccm: e.target.value.trim() || null },
                                  });
                                } catch (err) { toast.error((err as Error).message); }
                              }}
                            />
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label>Adresse</Label>
                            <Input
                              defaultValue={cfg?.adresse ?? ""}
                              placeholder="Adresse complète"
                              onBlur={async (e) => {
                                try {
                                  await callSuperAdmin("update_societe_config", {
                                    societe_id: s.id,
                                    patch: { adresse: e.target.value.trim() || null },
                                  });
                                } catch (err) { toast.error((err as Error).message); }
                              }}
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label>Logo</Label>
                          <div className="flex items-center gap-3">
                            {cfg?.logo_url && (
                              <img src={cfg.logo_url} alt="Logo" className="h-12 w-auto object-contain border rounded p-1" />
                            )}
                            <Input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                  const ext = file.name.split(".").pop() || "png";
                                  const path = `${s.id}/logo.${ext}`;
                                  const { error: upErr } = await supabase.storage
                                    .from("logos-societes")
                                    .upload(path, file, { upsert: true });
                                  if (upErr) throw upErr;
                                  const { data: pub } = supabase.storage.from("logos-societes").getPublicUrl(path);
                                  await callSuperAdmin("update_societe_config", {
                                    societe_id: s.id,
                                    patch: { logo_url: pub.publicUrl },
                                  });
                                  toast.success("Logo mis à jour");
                                  loadAll();
                                } catch (err) { toast.error((err as Error).message); }
                              }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
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
                            <SelectItem value="starter">{t("superadmin.plan_starter")}</SelectItem>
                            <SelectItem value="pro">{t("superadmin.plan_pro")}</SelectItem>
                            <SelectItem value="enterprise">{t("superadmin.plan_enterprise")}</SelectItem>
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
                <CardHeader><CardTitle>{t("superadmin.all_users", { n: users.length })}</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("superadmin.col_email")}</TableHead>
                        <TableHead>{t("superadmin.col_name")}</TableHead>
                        <TableHead>{t("superadmin.col_societies")}</TableHead>
                        <TableHead>{t("superadmin.col_roles")}</TableHead>
                        <TableHead>{t("superadmin.col_last_login")}</TableHead>
                        <TableHead>{t("superadmin.col_status")}</TableHead>
                        <TableHead className="text-right">{t("superadmin.col_actions")}</TableHead>
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
                              {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString(i18n.language) : t("superadmin.never")}
                            </TableCell>
                            <TableCell>
                              {banned || !actif
                                ? <Badge variant="destructive">{t("superadmin.deactivated")}</Badge>
                                : <Badge className="bg-success text-success-foreground">{t("superadmin.active")}</Badge>}
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              <Select onValueChange={(v) => setUserRole(u, v)}>
                                <SelectTrigger className="h-8 w-32 inline-flex"><SelectValue placeholder={t("superadmin.add_role")} /></SelectTrigger>
                                <SelectContent>
                                  {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Button size="sm" variant="ghost" onClick={() => toggleActif(u)} title={actif ? t("superadmin.deactivate_account") : t("superadmin.reactivate_account")}>
                                <UserX className="size-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => resetPwd(u)} title={t("superadmin.reset_password")}>
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
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t("superadmin.societies_active")}</CardTitle></CardHeader>
                  <CardContent><div className="text-3xl font-bold">{stats?.societes_actives ?? 0}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t("superadmin.users_active")}</CardTitle></CardHeader>
                  <CardContent><div className="text-3xl font-bold">{stats?.utilisateurs_actifs ?? 0}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t("superadmin.logins_today")}</CardTitle></CardHeader>
                  <CardContent><div className="text-3xl font-bold">{stats?.connexions_today ?? 0}</div></CardContent>
                </Card>
              </div>

              <Card className="mb-4">
                <CardHeader><CardTitle>{t("superadmin.new_societies_12m")}</CardTitle></CardHeader>
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
                <CardHeader><CardTitle>{t("superadmin.last_audit")}</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("superadmin.col_date")}</TableHead>
                        <TableHead>{t("superadmin.col_user")}</TableHead>
                        <TableHead>{t("superadmin.col_action")}</TableHead>
                        <TableHead>{t("superadmin.col_table")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(stats?.recent_audit ?? []).map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs">{new Date(a.created_at).toLocaleString(i18n.language)}</TableCell>
                          <TableCell className="text-xs">{a.user_email ?? "—"}</TableCell>
                          <TableCell><Badge variant="outline">{a.action}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{a.table_name}</TableCell>
                        </TableRow>
                      ))}
                      {!(stats?.recent_audit?.length) && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">{t("superadmin.no_recent_activity")}</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB — MISE À JOUR APPLICATION */}
            <TabsContent value="miseajour">
              <MiseAJourPanel stats={stats} />
            </TabsContent>

            {/* TAB 5 — MON COMPTE */}
            <TabsContent value="account">
              <MonCompteSection />
            </TabsContent>
          </Tabs>
        )}
      </main>

      <CreerSocieteModal open={creating} onOpenChange={setCreating} onCreated={loadAll} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("superadmin.delete_society_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                i18nKey="superadmin.delete_society_desc"
                values={{ nom: confirmDelete?.nom ?? "" }}
                components={[<strong key="0" />]}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete && deleteSociete(confirmDelete)}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SuperAdminPanel;