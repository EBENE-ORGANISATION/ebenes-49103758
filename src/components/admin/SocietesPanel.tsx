import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSociete } from "@/hooks/useSocieteContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Trash2, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface UserSummary { user_id: string; email: string | null; nom: string | null }
interface SocieteRow { id: string; nom: string; nif: string; rccm: string; adresse: string }
interface LinkRow { id: string; user_id: string; societe_id: string }

interface Props { users: UserSummary[] }

export const SocietesPanel = ({ users }: Props) => {
  const { roles } = useAuth();
  const { refresh } = useSociete();
  const isAdminGeneral = roles.includes("admin_general");

  const [societes, setSocietes] = useState<SocieteRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Création société
  const [openNew, setOpenNew] = useState(false);
  const [nNom, setNNom] = useState("");
  const [nNif, setNNif] = useState("");
  const [nRccm, setNRccm] = useState("");
  const [nAdresse, setNAdresse] = useState("");
  const [busy, setBusy] = useState(false);

  // Liaison
  const [linkUserId, setLinkUserId] = useState<string>("");
  const [linkSocieteId, setLinkSocieteId] = useState<string>("");

  const load = async () => {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([
        supabase.from("societes").select("id,nom,nif,rccm,adresse").order("nom"),
        supabase.from("user_societes").select("id,user_id,societe_id"),
      ]);
      if (s.error) throw s.error;
      if (l.error) throw l.error;
      setSocietes(s.data ?? []);
      setLinks(l.data ?? []);
    } catch (e) {
      toast.error("Chargement impossible : " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const createSociete = async () => {
    if (!nNom.trim()) { toast.error("Le nom est requis"); return; }
    setBusy(true);
    const { error } = await supabase.from("societes").insert({
      nom: nNom.trim(), nif: nNif.trim(), rccm: nRccm.trim(), adresse: nAdresse.trim(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Société créée");
    setOpenNew(false);
    setNNom(""); setNNif(""); setNRccm(""); setNAdresse("");
    await load();
    await refresh();
  };

  const removeSociete = async (id: string) => {
    if (!confirm("Supprimer cette société ? Les liaisons utilisateurs seront supprimées (les données app_state restent en base).")) return;
    const { error } = await supabase.from("societes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Société supprimée");
    await load();
    await refresh();
  };

  const linkUser = async () => {
    if (!linkUserId || !linkSocieteId) { toast.error("Sélectionnez un utilisateur et une société"); return; }
    const { error } = await supabase.from("user_societes").insert({
      user_id: linkUserId, societe_id: linkSocieteId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Liaison ajoutée");
    setLinkUserId(""); setLinkSocieteId("");
    await load();
    await refresh();
  };

  const removeLink = async (id: string) => {
    const { error } = await supabase.from("user_societes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await load();
    await refresh();
  };

  const userLabel = (uid: string) => {
    const u = users.find((x) => x.user_id === uid);
    return u ? (u.nom || u.email || uid.slice(0, 8)) : uid.slice(0, 8);
  };

  if (!isAdminGeneral) {
    return (
      <Card className="p-6 border-dashed">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Building2 className="size-4" />
          La gestion des sociétés est réservée aux administrateurs généraux.
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Building2 className="size-5" /> Sociétés
          </h2>
          <p className="text-xs text-muted-foreground">
            Chaque société a ses propres données (comptabilité, factures, employés, stock, etc.).
          </p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="size-4" /> Nouvelle société</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Créer une société</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nom *</Label>
                <Input value={nNom} onChange={(e) => setNNom(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>NIF</Label>
                  <Input value={nNif} onChange={(e) => setNNif(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>RCCM</Label>
                  <Input value={nRccm} onChange={(e) => setNRccm(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Adresse</Label>
                <Input value={nAdresse} onChange={(e) => setNAdresse(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpenNew(false)}>Annuler</Button>
              <Button onClick={createSociete} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Créer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center p-6"><Loader2 className="size-5 animate-spin" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>NIF</TableHead>
              <TableHead>RCCM</TableHead>
              <TableHead>Utilisateurs liés</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {societes.map((s) => {
              const linkedUsers = links.filter((l) => l.societe_id === s.id);
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.nom}</TableCell>
                  <TableCell className="text-xs">{s.nif || "—"}</TableCell>
                  <TableCell className="text-xs">{s.rccm || "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {linkedUsers.length === 0 && (
                        <span className="text-xs text-muted-foreground">aucun</span>
                      )}
                      {linkedUsers.map((l) => (
                        <Badge key={l.id} variant="secondary" className="gap-1">
                          {userLabel(l.user_id)}
                          <button
                            type="button"
                            onClick={() => void removeLink(l.id)}
                            className="ml-1 hover:text-destructive"
                            aria-label="Retirer"
                          >×</button>
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm" variant="destructive"
                      onClick={() => void removeSociete(s.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <UserPlus className="size-4" /> Lier un utilisateur à une société
        </h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label className="text-xs">Utilisateur</Label>
            <Select value={linkUserId} onValueChange={setLinkUserId}>
              <SelectTrigger><SelectValue placeholder="Choisir un utilisateur" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.nom || u.email || u.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label className="text-xs">Société</Label>
            <Select value={linkSocieteId} onValueChange={setLinkSocieteId}>
              <SelectTrigger><SelectValue placeholder="Choisir une société" /></SelectTrigger>
              <SelectContent>
                {societes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void linkUser()} className="gap-1.5">
            <Plus className="size-4" /> Lier
          </Button>
        </div>
      </div>
    </Card>
  );
};
