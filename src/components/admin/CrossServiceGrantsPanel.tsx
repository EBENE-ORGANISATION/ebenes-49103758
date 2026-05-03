import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

interface Grant {
  id: string;
  user_id: string;
  service: "compta" | "grh";
  level: "membre" | "chef";
  expires_at: string;
  granted_at: string;
  note: string | null;
  user_email?: string | null;
  user_nom?: string | null;
}

interface UserOption { user_id: string; email: string | null; nom: string | null; }

interface Props { users: UserOption[]; }

export const CrossServiceGrantsPanel = ({ users }: Props) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // form
  const [uid, setUid] = useState("");
  const [service, setService] = useState<"compta" | "grh">("compta");
  const [level, setLevel] = useState<"membre" | "chef">("chef");
  const [days, setDays] = useState(7);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("cross_service_grants")
      .select("*")
      .order("expires_at", { ascending: false });
    if (error) {
      toast.error(t("admin_grants.err_load", { msg: error.message }));
      setLoading(false);
      return;
    }
    const map = new Map(users.map((u) => [u.user_id, u]));
    setGrants((data || []).map((g) => ({
      ...g,
      user_email: map.get(g.user_id)?.email ?? null,
      user_nom: map.get(g.user_id)?.nom ?? null,
    })) as Grant[]);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [users]);

  const create = async () => {
    if (!uid) { toast.error(t("admin_grants.err_pick_user")); return; }
    if (days < 1) { toast.error(t("admin_grants.err_duration")); return; }
    setBusy(true);
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    const { error } = await supabase.from("cross_service_grants").insert({
      user_id: uid, service, level, expires_at: expires, note: note || null, granted_by: user?.id,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("admin_grants.granted"));
    setOpen(false); setUid(""); setNote(""); setDays(7); setLevel("chef"); setService("compta");
    load();
  };

  const revoke = async (id: string) => {
    if (!confirm(t("admin_grants.confirm_revoke"))) return;
    const { error } = await supabase.from("cross_service_grants").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("admin_grants.revoked"));
    load();
  };

  const isExpired = (g: Grant) => new Date(g.expires_at) <= new Date();

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b">
        <h2 className="font-semibold flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          {t("admin_grants.title")}
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="size-4" /> {t("admin_grants.grant")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("admin_grants.new_title")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{t("admin_grants.user")}</Label>
                <Select value={uid} onValueChange={setUid}>
                  <SelectTrigger><SelectValue placeholder={t("admin_grants.pick_user")} /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.nom || u.email} {u.email ? `(${u.email})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("admin_grants.target_service")}</Label>
                  <Select value={service} onValueChange={(v) => setService(v as "compta" | "grh")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compta">{t("admin_grants.compta")}</SelectItem>
                      <SelectItem value="grh">{t("admin_grants.grh")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("admin_grants.level")}</Label>
                  <Select value={level} onValueChange={(v) => setLevel(v as "membre" | "chef")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chef">{t("admin_grants.chef_desc")}</SelectItem>
                      <SelectItem value="membre">{t("admin_grants.membre_desc")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("admin_grants.duration_days")}</Label>
                <Input type="number" min={1} value={days}
                  onChange={(e) => setDays(parseInt(e.target.value || "0"))} />
              </div>
              <div className="space-y-2">
                <Label>{t("admin_grants.note_opt")}</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder={t("admin_grants.note_placeholder")} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t("admin_grants.cancel")}</Button>
              <Button onClick={create} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : t("admin_grants.grant")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 className="size-5 animate-spin" /></div>
      ) : grants.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {t("admin_grants.none_granted")}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin_grants.th_user")}</TableHead>
              <TableHead>{t("admin_grants.th_service")}</TableHead>
              <TableHead>{t("admin_grants.th_level")}</TableHead>
              <TableHead>{t("admin_grants.th_expires")}</TableHead>
              <TableHead>{t("admin_grants.th_note")}</TableHead>
              <TableHead className="text-right">{t("admin_grants.th_action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.map((g) => (
              <TableRow key={g.id} className={isExpired(g) ? "opacity-50" : ""}>
                <TableCell>{g.user_nom || g.user_email || g.user_id.slice(0, 8)}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {g.service === "compta" ? t("admin_grants.compta") : t("admin_grants.grh")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={g.level === "chef" ? "default" : "secondary"}>
                    {g.level === "chef" ? t("admin_grants.chef") : t("admin_grants.membre")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className={isExpired(g) ? "text-destructive" : ""}>
                    {new Date(g.expires_at).toLocaleString(i18n.language === "en" ? "en-GB" : "fr-FR")}
                    {isExpired(g) && t("admin_grants.expired_suffix")}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                  {g.note || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="destructive" onClick={() => revoke(g.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
};
