import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, ShieldCheck, RotateCcw, ChevronDown, ChevronRight, ChevronsRight,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation, Trans } from "react-i18next";
import {
  MODULES,
  ALL_MODULES,
  MODULE_LABELS,
  SUBMODULE_LABELS,
  MODULE_CHILDREN,
  LEVEL_LABELS,
  type AccessLevel,
  type AppModule,
} from "@/lib/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  users: { user_id: string; email: string | null; nom: string | null }[];
}

interface Override {
  user_id: string;
  module: AppModule;
  level: AccessLevel;
}

type Draft = Record<AppModule, AccessLevel | "default">;

const LEVELS: AccessLevel[] = ["none", "read", "write", "validate"];

const emptyDraft = (): Draft =>
  Object.fromEntries(ALL_MODULES.map((m) => [m, "default" as const])) as Draft;

// ─── ModuleLevelSelect ────────────────────────────────────────────────────────

function ModuleLevelSelect({
  value,
  onChange,
}: {
  value: AccessLevel | "default";
  onChange: (v: AccessLevel | "default") => void;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AccessLevel | "default")}>
      <SelectTrigger className="w-52 h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">{t("admin_perms.role_default")}</SelectItem>
        {LEVELS.map((l) => (
          <SelectItem key={l} value={l}>
            {LEVEL_LABELS[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── ParentModuleRow ──────────────────────────────────────────────────────────

function ParentModuleRow({
  module,
  draft,
  onChangeDraft,
}: {
  module: AppModule;
  draft: Draft;
  onChangeDraft: (update: Partial<Draft>) => void;
}) {
  const { t } = useTranslation();
  const children = MODULE_CHILDREN[module];
  const hasChildren = !!children?.length;
  const [open, setOpen] = useState(false);

  const propagateToAll = (level: AccessLevel | "default") => {
    const update: Partial<Draft> = { [module]: level };
    if (children) {
      for (const child of children) {
        update[child] = level;
      }
    }
    onChangeDraft(update);
  };

  const parentRow = (
    <div className="flex items-center justify-between gap-2 p-2.5">
      <div className="flex items-center gap-1.5 min-w-0">
        {hasChildren ? (
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label={open ? "Réduire" : "Développer"}
            >
              {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          </CollapsibleTrigger>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <span className="text-sm font-semibold truncate">
          {MODULE_LABELS[module] ?? module}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <ModuleLevelSelect
          value={draft[module]}
          onChange={(v) => onChangeDraft({ [module]: v })}
        />
        {hasChildren && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
            title={t("admin_perms.propagate_title")}
            onClick={() => propagateToAll(draft[module])}
          >
            <ChevronsRight className="size-3.5" />
            {t("admin_perms.propagate_all")}
          </Button>
        )}
      </div>
    </div>
  );

  if (!hasChildren) {
    return <div>{parentRow}</div>;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {parentRow}
      <CollapsibleContent>
        <div className="bg-muted/30 divide-y divide-border/50">
          {children!.map((child) => (
            <div
              key={child}
              className="flex items-center justify-between gap-2 pl-8 pr-2.5 py-2"
            >
              <span className="text-xs text-muted-foreground truncate">
                {SUBMODULE_LABELS[child] ?? child}
              </span>
              <ModuleLevelSelect
                value={draft[child]}
                onChange={(v) => onChangeDraft({ [child]: v })}
              />
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── PermissionsOverridesPanel ────────────────────────────────────────────────

export const PermissionsOverridesPanel = ({ users }: Props) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [overridesCount, setOverridesCount] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
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
      const rows = (data || []) as Override[];
      setOverridesCount(rows.length);
      const next = emptyDraft();
      rows.forEach((o) => {
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

  const handleChangeDraft = (update: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...update }));
  };

  const save = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const toUpsert: Override[] = [];
      const toDelete: AppModule[] = [];
      for (const m of ALL_MODULES) {
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

  const resetAll = () => setDraft(emptyDraft());

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
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{t("admin_perms.dialog_title")}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              {/* Sélecteur d'utilisateur */}
              <div className="space-y-2">
                <Label>{t("admin_perms.user")}</Label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("admin_perms.pick_user")} />
                  </SelectTrigger>
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
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="size-5 animate-spin mr-2" /> {t("admin_perms.loading")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Barre d'infos + reset */}
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {overridesCount === 0
                          ? t("admin_perms.none_active")
                          : t("admin_perms.n_active", { count: overridesCount })}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={resetAll}
                        className="h-7 text-xs"
                      >
                        <RotateCcw className="size-3 mr-1" /> {t("admin_perms.reset_all")}
                      </Button>
                    </div>

                    {/* Arbre des modules */}
                    <div className="border rounded-md divide-y overflow-hidden">
                      {MODULES.map((m) => (
                        <ParentModuleRow
                          key={m}
                          module={m}
                          draft={draft}
                          onChangeDraft={handleChangeDraft}
                        />
                      ))}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      <Trans
                        i18nKey="admin_perms.target_note"
                        values={{ label: userLabel }}
                        components={[<strong />]}
                      />
                    </p>
                  </div>
                )
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t("admin_perms.cancel")}
              </Button>
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
