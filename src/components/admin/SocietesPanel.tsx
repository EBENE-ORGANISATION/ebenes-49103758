import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSociete } from "@/hooks/useSocieteContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Trash2, UserPlus, Loader2, Pencil, Upload, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

interface UserSummary { user_id: string; email: string | null; nom: string | null }
interface SocieteRow {
  id: string; nom: string; nif: string; rccm: string; adresse: string;
  telephone: string; email: string; site_web: string;
  logo_url: string; couleur_primaire: string; couleur_secondaire: string;
  slogan: string; mention_legale_pied: string;
  representant: string; fonction_representant: string;
}
interface LinkRow { id: string; user_id: string; societe_id: string }

interface Props { users: UserSummary[] }

const EMPTY_FORM: Omit<SocieteRow, "id"> = {
  nom: "", nif: "", rccm: "", adresse: "",
  telephone: "", email: "", site_web: "",
  logo_url: "",
  couleur_primaire: "#4C51BF", couleur_secondaire: "#C05656",
  slogan: "", mention_legale_pied: "",
  representant: "", fonction_representant: "",
};

export const SocietesPanel = ({ users }: Props) => {
  const { roles } = useAuth();
  const { refresh } = useSociete();
  const isAdminGeneral = roles.includes("admin_general");

  const [societes, setSocietes] = useState<SocieteRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SocieteRow | null>(null);

  const [linkUserId, setLinkUserId] = useState<string>("");
  const [linkSocieteId, setLinkSocieteId] = useState<string>("");

  const load = async () => {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([
        supabase.from("societes").select(
          "id,nom,nif,rccm,adresse,telephone,email,site_web,logo_url,couleur_primaire,couleur_secondaire,slogan,mention_legale_pied,representant,fonction_representant"
        ).order("nom"),
        supabase.from("user_societes").select("id,user_id,societe_id"),
      ]);
      if (s.error) throw s.error;
      if (l.error) throw l.error;
      setSocietes((s.data ?? []) as SocieteRow[]);
      setLinks(l.data ?? []);
    } catch (e) {
      toast.error("Chargement impossible : " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (row: SocieteRow) => { setEditing(row); setEditorOpen(true); };

  const removeSociete = async (id: string) => {
    if (!confirm("Supprimer cette société ? Les liaisons utilisateurs seront supprimées.")) return;
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
            Chaque société a son propre branding (logo, couleurs, mentions) appliqué aux factures, bulletins et contrats.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openNew}>
          <Plus className="size-4" /> Nouvelle société
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center p-6"><Loader2 className="size-5 animate-spin" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Logo</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>NIF</TableHead>
              <TableHead>Utilisateurs liés</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {societes.map((s) => {
              const linkedUsers = links.filter((l) => l.societe_id === s.id);
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    {s.logo_url ? (
                      <img
                        src={s.logo_url}
                        alt={s.nom}
                        className="h-10 w-10 object-contain rounded bg-muted"
                      />
                    ) : (
                      <div
                        className="h-10 w-10 rounded flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: s.couleur_primaire || "#4C51BF" }}
                      >
                        {s.nom.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div>{s.nom}</div>
                    {s.slogan && <div className="text-xs text-muted-foreground">{s.slogan}</div>}
                  </TableCell>
                  <TableCell className="text-xs">{s.nif || "—"}</TableCell>
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
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => void removeSociete(s.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
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

      <SocieteEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        societe={editing}
        onSaved={async () => { await load(); await refresh(); }}
      />
    </Card>
  );
};

/* ──────────────────────────────────────────────────────────────────── */
/*                      DIALOG ÉDITION / CRÉATION                       */
/* ──────────────────────────────────────────────────────────────────── */

interface EditorProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  societe: SocieteRow | null;
  onSaved: () => Promise<void> | void;
}

const SocieteEditor = ({ open, onOpenChange, societe, onSaved }: EditorProps) => {
  const [form, setForm] = useState<Omit<SocieteRow, "id">>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = !!societe;

  useEffect(() => {
    if (open) {
      if (societe) {
        const { id: _id, ...rest } = societe;
        void _id;
        setForm({
          ...EMPTY_FORM,
          ...rest,
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [open, societe]);

  const set = <K extends keyof Omit<SocieteRow, "id">>(k: K, v: Omit<SocieteRow, "id">[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onUploadLogo = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Veuillez choisir une image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo trop lourd (max 2 Mo)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${(societe?.id ?? "new")}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("logos-societes")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("logos-societes").getPublicUrl(path);
      set("logo_url", data.publicUrl);
      toast.success("Logo téléversé");
    } catch (e) {
      toast.error("Upload impossible : " + (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.nom.trim()) { toast.error("Le nom est requis"); return; }
    setBusy(true);
    try {
      const payload = {
        nom: form.nom.trim(),
        nif: form.nif.trim(),
        rccm: form.rccm.trim(),
        adresse: form.adresse.trim(),
        telephone: form.telephone.trim(),
        email: form.email.trim(),
        site_web: form.site_web.trim(),
        logo_url: form.logo_url.trim(),
        couleur_primaire: form.couleur_primaire || "#4C51BF",
        couleur_secondaire: form.couleur_secondaire || "#C05656",
        slogan: form.slogan.trim(),
        mention_legale_pied: form.mention_legale_pied.trim(),
        representant: form.representant.trim(),
        fonction_representant: form.fonction_representant.trim(),
      };
      if (isEdit && societe) {
        const { error } = await supabase.from("societes").update(payload).eq("id", societe.id);
        if (error) throw error;
        toast.success("Société mise à jour");
      } else {
        const { error } = await supabase.from("societes").insert(payload);
        if (error) throw error;
        toast.success("Société créée");
      }
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Modifier ${societe?.nom}` : "Créer une société"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="identite" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="identite">Identité</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="legal">Légal & contact</TabsTrigger>
          </TabsList>

          {/* ── Identité ── */}
          <TabsContent value="identite" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label>Nom commercial *</Label>
              <Input value={form.nom} onChange={(e) => set("nom", e.target.value)} placeholder="EBENE SERVICES" />
            </div>
            <div className="space-y-1.5">
              <Label>Slogan / Baseline</Label>
              <Input value={form.slogan} onChange={(e) => set("slogan", e.target.value)} placeholder="Commerce Général — Système de Gestion" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>NIF</Label>
                <Input value={form.nif} onChange={(e) => set("nif", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>RCCM</Label>
                <Input value={form.rccm} onChange={(e) => set("rccm", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Adresse</Label>
              <Textarea
                value={form.adresse}
                onChange={(e) => set("adresse", e.target.value)}
                rows={2}
                placeholder="Quartier, rue, ville, pays"
              />
            </div>
          </TabsContent>

          {/* ── Branding ── */}
          <TabsContent value="branding" className="space-y-4 pt-3">
            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex items-start gap-4">
                <div
                  className="h-24 w-24 rounded-md bg-muted flex items-center justify-center overflow-hidden border"
                  style={!form.logo_url ? { background: form.couleur_primaire } : undefined}
                >
                  {form.logo_url ? (
                    <img src={form.logo_url} alt="logo" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs font-bold text-white">
                      {(form.nom || "??").slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="gap-1.5"
                    >
                      {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                      Téléverser
                    </Button>
                    {form.logo_url && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => set("logo_url", "")}>
                        Retirer
                      </Button>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUploadLogo(f);
                      e.target.value = "";
                    }}
                  />
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <LinkIcon className="size-3" /> ou URL externe
                    </Label>
                    <Input
                      value={form.logo_url}
                      onChange={(e) => set("logo_url", e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">PNG ou JPG, max 2 Mo. Apparaît sur les factures, bulletins et contrats.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Couleur primaire</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={form.couleur_primaire}
                    onChange={(e) => set("couleur_primaire", e.target.value)}
                    className="h-10 w-14 p-1"
                  />
                  <Input
                    value={form.couleur_primaire}
                    onChange={(e) => set("couleur_primaire", e.target.value)}
                    placeholder="#4C51BF"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Couleur secondaire</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={form.couleur_secondaire}
                    onChange={(e) => set("couleur_secondaire", e.target.value)}
                    className="h-10 w-14 p-1"
                  />
                  <Input
                    value={form.couleur_secondaire}
                    onChange={(e) => set("couleur_secondaire", e.target.value)}
                    placeholder="#C05656"
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Légal & contact ── */}
          <TabsContent value="legal" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Téléphone</Label>
                <Input value={form.telephone} onChange={(e) => set("telephone", e.target.value)} placeholder="(+228) ..." />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Site web</Label>
              <Input value={form.site_web} onChange={(e) => set("site_web", e.target.value)} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Représentant légal</Label>
                <Input value={form.representant} onChange={(e) => set("representant", e.target.value)} placeholder="Nom du signataire" />
              </div>
              <div className="space-y-1.5">
                <Label>Fonction</Label>
                <Input value={form.fonction_representant} onChange={(e) => set("fonction_representant", e.target.value)} placeholder="Directeur" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Mention légale (pied de page PDF)</Label>
              <Textarea
                rows={2}
                value={form.mention_legale_pied}
                onChange={(e) => set("mention_legale_pied", e.target.value)}
                placeholder="Comptabilité tenue selon le référentiel SYSCOHADA révisé..."
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save} disabled={busy || uploading}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : (isEdit ? "Enregistrer" : "Créer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};