import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, ShieldCheck, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useTranslation, Trans } from "react-i18next";
import {
  MODULES,
  MODULE_LABELS,
  LEVEL_LABELS,
  type AccessLevel,
  type AppModule,
} from "@/lib/permissions";

interface Props {
  users: { user_id: string; email: string | null; nom: string | null }[];
}

interface Override {
  user_id: string;
  module: AppModule;
  level: AccessLevel;
}

const LEVELS: AccessLevel[] = ["none", "read", "write", "validate"];

export const PermissionsOverridesPanel = ({ users }: Props) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [draft, setDraft] = useState<Record<AppModule, AccessLevel | "default">>(
    Object.fromEntries(MODULES.map((m) => [m, "default" as const])) as Record<AppModule, AccessLevel | "default">
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const userLabel = useMemo(() => {
    const u = users.find((x) => x.user_id === selectedUser);
    return u ? (u.nom || u.email || u.user_id) : "—";
  }, [users, selectedUser]);

  const loadOverrides = async (uid: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("permission_overrides")
        .select("user_id, module, level")
        .eq("user_id", uid);
      if (error) throw error;
      setOverrides((data || []) as Override[]);
      const next = Object.fromEntries(MODULES.map((m) => [m, "default"])) as Record<AppModule, AccessLevel | "default">;
      (data || []).forEach((o) => {
        next[o.module as AppModule] = o.level as AccessLevel;
      });
      setDraft(next);
    } catch (e) {
      toast.error(t("admin_perms.err_load", { msg: (e as Error).message }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && selectedUser) void loadOverrides(selectedUser);
  }, [open, selectedUser]);

  const save = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      // Diff : pour chaque module, soit on upsert, soit on supprime si "default"
      const toUpsert: Override[] = [];
      const toDelete: AppModule[] = [];
      for (const m of MODULES) {
        const v = draft[m];
        if (v === "default") toDelete.push(m);
        else toUpsert.push({ user_id: selectedUser, module: m, level: v });
      }
      if (toDelete.length) {
        const { error } = await supabase
          .from("permission_overrides")
          .delete()
          .eq("user_id", selectedUser)
          .in("module", toDelete);
        if (error) throw error;
      }
      if (toUpsert.length) {
        const { error } = await supabase
          .from("permission_overrides")
          .upsert(toUpsert, { onConflict: "user_id,module" });
        if (error) throw error;
      }
      toast.success(t("admin_perms.saved"));
      setOpen(false);
    } catch (e) {
      toast.error(t("admin_perms.err_save", { msg: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    setDraft(Object.fromEntries(MODULES.map((m) => [m, "default"])) as Record<AppModule, AccessLevel | "default">);
  };

  return (
    <Card className="p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-lg flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" /> {t("admin_perms.title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">{t("admin_perms.intro")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">{t("admin_perms.configure")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("admin_perms.dialog_title")}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("admin_perms.user")}</Label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger><SelectValue placeholder={t("admin_perms.pick_user")} /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.nom || u.email || u.user_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedUser && (
                loading ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground">
                    <Loader2 className="size-5 animate-spin mr-2" /> {t("admin_perms.loading")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {overrides.length === 0
                          ? t("admin_perms.none_active")
                          : t("admin_perms.n_active", { count: overrides.length })}
                      </p>
                      <Button size="sm" variant="ghost" onClick={resetAll} className="h-7 text-xs">
                        <RotateCcw className="size-3 mr-1" /> {t("admin_perms.reset_all")}
                      </Button>
                    </div>
                    <div className="border rounded-md divide-y">
                      {MODULES.map((m) => (
                        <div key={m} className="flex items-center justify-between gap-3 p-2.5">
                          <span className="text-sm font-medium">{MODULE_LABELS[m]}</span>
                          <Select
                            value={draft[m]}
                            onValueChange={(v) =>
                              setDraft((prev) => ({ ...prev, [m]: v as AccessLevel | "default" }))
                            }
                          >
                            <SelectTrigger className="w-60 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">{t("admin_perms.role_default")}</SelectItem>
                              {LEVELS.map((l) => (
                                <SelectItem key={l} value={l}>{LEVEL_LABELS[l]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <Trans i18nKey="admin_perms.target_note" values={{ label: userLabel }} components={[<strong />]} />
                    </p>
                  </div>
                )
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t("admin_perms.cancel")}</Button>
              <Button onClick={save} disabled={!selectedUser || saving || loading}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : t("admin_perms.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
};
