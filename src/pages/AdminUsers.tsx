import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, AppRole, ROLE_LABELS } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, KeyRound, Loader2, Plus, Power, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { CrossServiceGrantsPanel } from "@/components/admin/CrossServiceGrantsPanel";
import { PermissionsOverridesPanel } from "@/components/admin/PermissionsOverridesPanel";
import { FeatureAccessPanel } from "@/components/admin/FeatureAccessPanel";

interface AdminUser {
  user_id: string;
  email: string | null;
  nom: string | null;
  actif: boolean;
  created_at: string;
  roles: AppRole[];
}

const ALL_ROLES: AppRole[] = [
  "admin",
  "chef_compta",
  "membre_compta",
  "chef_grh",
  "membre_grh",
  "dashboard_viewer",
];

const callFn = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
};

const AdminUsers = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [openRoles, setOpenRoles] = useState<AdminUser | null>(null);
  const [openReset, setOpenReset] = useState<AdminUser | null>(null);

  // Formulaire création
  const [cEmail, setCEmail] = useState("");
  const [cNom, setCNom] = useState("");
  const [cPwd, setCPwd] = useState("");
  const [cRoles, setCRoles] = useState<AppRole[]>(["saisie"]);
  const [busy, setBusy] = useState(false);

  // Reset
  const [newPwd, setNewPwd] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await callFn({ action: "list" });
      setUsers(res.users || []);
    } catch (e) {
      toast.error(t("admin_users.err_load", { msg: (e as Error).message }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onCreate = async () => {
    if (!cEmail || !cPwd) { toast.error(t("admin_users.err_email_pwd_required")); return; }
    if (cPwd.length < 8) { toast.error(t("admin_users.err_pwd_min8")); return; }
    setBusy(true);
    try {
      await callFn({ action: "create", email: cEmail.trim(), password: cPwd, nom: cNom.trim(), roles: cRoles });
      toast.success(t("admin_users.created"));
      setOpenCreate(false);
      setCEmail(""); setCNom(""); setCPwd(""); setCRoles(["saisie"]);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const toggleActif = async (u: AdminUser) => {
    try {
      await callFn({ action: "set_active", user_id: u.user_id, actif: !u.actif });
      toast.success(u.actif ? t("admin_users.deactivated") : t("admin_users.activated"));
      load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const removeUser = async (u: AdminUser) => {
    if (!confirm(t("admin_users.confirm_delete", { email: u.email }))) return;
    try {
      await callFn({ action: "delete", user_id: u.user_id });
      toast.success(t("admin_users.deleted"));
      load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const saveRoles = async () => {
    if (!openRoles) return;
    try {
      await callFn({ action: "set_roles", user_id: openRoles.user_id, roles: openRoles.roles });
      toast.success(t("admin_users.roles_updated"));
      setOpenRoles(null);
      load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const resetPassword = async () => {
    if (!openReset || !newPwd) return;
    if (newPwd.length < 8) { toast.error(t("admin_users.err_min8")); return; }
    try {
      await callFn({ action: "reset_password", user_id: openReset.user_id, new_password: newPwd });
      toast.success(t("admin_users.pwd_reset"));
      setOpenReset(null);
      setNewPwd("");
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/"><ArrowLeft className="size-4" /> {t("admin_users.back")}</Link>
            </Button>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="size-6 text-primary" /> {t("admin_users.title")}
            </h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/audit">{t("admin_users.audit_link")}</Link>
            </Button>
            <Dialog open={openCreate} onOpenChange={setOpenCreate}>
              <DialogTrigger asChild>
                <Button><Plus className="size-4" /> {t("admin_users.new_user")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t("admin_users.create_title")}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("admin_users.email")}</Label>
                    <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("admin_users.full_name")}</Label>
                    <Input value={cNom} onChange={(e) => setCNom(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("admin_users.password_min")}</Label>
                    <Input type="text" value={cPwd} onChange={(e) => setCPwd(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("admin_users.roles")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {ALL_ROLES.map((r) => (
                        <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={cRoles.includes(r)}
                            onCheckedChange={(v) =>
                              setCRoles((prev) => (v ? [...prev, r] : prev.filter((x) => x !== r)))
                            }
                          />
                          {ROLE_LABELS[r]}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpenCreate(false)}>{t("admin_users.cancel")}</Button>
                  <Button onClick={onCreate} disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : t("admin_users.create")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="size-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin_users.th_name")}</TableHead>
                  <TableHead>{t("admin_users.th_email")}</TableHead>
                  <TableHead>{t("admin_users.th_roles")}</TableHead>
                  <TableHead>{t("admin_users.th_status")}</TableHead>
                  <TableHead className="text-right">{t("admin_users.th_actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">{u.nom || "—"}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 && <span className="text-xs text-muted-foreground">{t("admin_users.none")}</span>}
                        {u.roles.map((r) => (
                          <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>
                            {ROLE_LABELS[r]}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.actif ? "default" : "destructive"}>
                        {u.actif ? t("admin_users.active") : t("admin_users.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => setOpenRoles({ ...u })}>
                        {t("admin_users.btn_roles")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setOpenReset(u)}>
                        <KeyRound className="size-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleActif(u)}>
                        <Power className="size-3.5" />
                      </Button>
                      <Button
                        size="sm" variant="destructive"
                        disabled={u.user_id === user?.id}
                        onClick={() => removeUser(u)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <CrossServiceGrantsPanel
          users={users.map((u) => ({ user_id: u.user_id, email: u.email, nom: u.nom }))}
        />

        <PermissionsOverridesPanel
          users={users.map((u) => ({ user_id: u.user_id, email: u.email, nom: u.nom }))}
        />

        <FeatureAccessPanel
          users={users.map((u) => ({ user_id: u.user_id, email: u.email, nom: u.nom }))}
        />

        {/* Dialog rôles */}
        <Dialog open={!!openRoles} onOpenChange={(v) => !v && setOpenRoles(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("admin_users.roles_for", { email: openRoles?.email })}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {ALL_ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={openRoles?.roles.includes(r) || false}
                    onCheckedChange={(v) =>
                      setOpenRoles((prev) =>
                        prev ? { ...prev, roles: v ? [...prev.roles, r] : prev.roles.filter((x) => x !== r) } : prev
                      )
                    }
                  />
                  {ROLE_LABELS[r]}
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpenRoles(null)}>{t("admin_users.cancel")}</Button>
              <Button onClick={saveRoles}>{t("admin_users.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog reset password */}
        <Dialog open={!!openReset} onOpenChange={(v) => !v && setOpenReset(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("admin_users.reset_title")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>{t("admin_users.new_pwd_for", { email: openReset?.email })}</Label>
              <Input value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setOpenReset(null); setNewPwd(""); }}>{t("admin_users.cancel")}</Button>
              <Button onClick={resetPassword}>{t("admin_users.reset")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AdminUsers;