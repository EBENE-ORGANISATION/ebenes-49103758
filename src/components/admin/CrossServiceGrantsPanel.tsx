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
      toast.error("Chargement autorisations : " + error.message);
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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [users]);

  const create = async () => {
    if (!uid) { toast.error("Sélectionnez un utilisateur"); return; }
    if (days < 1) { toast.error("Durée invalide"); return; }
    setBusy(true);
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    const { error } = await supabase.from("cross_service_grants").insert({
      user_id: uid, service, level, expires_at: expires, note: note || null, granted_by: user?.id,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Autorisation accordée");
    setOpen(false); setUid(""); setNote(""); setDays(7); setLevel("chef"); setService("compta");
    load();
  };

  const revoke = async (id: string) => {
    if (!confirm("Révoquer cette autorisation ?")) return;
    const { error } = await supabase.from("cross_service_grants").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Révoquée");
    load();
  };

  const isExpired = (g: Grant) => new Date(g.expires_at) <= new Date();

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b">
        <h2 className="font-semibold flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          Autorisations cross-service (temporaires)
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="size-4" /> Accorder</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nouvelle autorisation</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Utilisateur</Label>
                <Select value={uid} onValueChange={setUid}>
                  <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
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
                  <Label>Service cible</Label>
                  <Select value={service} onValueChange={(v) => setService(v as "compta" | "grh")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compta">Comptabilité</SelectItem>
                      <SelectItem value="grh">GRH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Niveau</Label>
                  <Select value={level} onValueChange={(v) => setLevel(v as "membre" | "chef")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chef">Chef (lecture + écriture + suppression)</SelectItem>
                      <SelectItem value="membre">Membre (lecture + écriture)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Durée (jours)</Label>
                <Input type="number" min={1} value={days}
                  onChange={(e) => setDays(parseInt(e.target.value || "0"))} />
              </div>
              <div className="space-y-2">
                <Label>Note (optionnel)</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Motif de l'autorisation…" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button onClick={create} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Accorder"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 className="size-5 animate-spin" /></div>
      ) : grants.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Aucune autorisation accordée.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Niveau</TableHead>
              <TableHead>Expire le</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.map((g) => (
              <TableRow key={g.id} className={isExpired(g) ? "opacity-50" : ""}>
                <TableCell>{g.user_nom || g.user_email || g.user_id.slice(0, 8)}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {g.service === "compta" ? "Comptabilité" : "GRH"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={g.level === "chef" ? "default" : "secondary"}>
                    {g.level === "chef" ? "Chef" : "Membre"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className={isExpired(g) ? "text-destructive" : ""}>
                    {new Date(g.expires_at).toLocaleString("fr-FR")}
                    {isExpired(g) && " (expirée)"}
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
