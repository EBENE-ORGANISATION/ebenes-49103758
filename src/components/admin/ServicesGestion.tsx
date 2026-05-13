import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Users, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Service {
  id: string;
  nom: string;
  description: string | null;
  couleur: string;
}

interface ServiceMembre {
  id: string;
  user_id: string;
  role: "chef" | "membre";
  profile?: { email: string | null; nom: string | null };
}

interface SocieteUser {
  user_id: string;
  email: string | null;
  nom: string | null;
}

// ─── Composant ───────────────────────────────────────────────────────────────

interface Props {
  societeId: string;
  /** Seul l'admin peut modifier */
  isAdmin: boolean;
}

export const ServicesGestion = ({ societeId, isAdmin }: Props) => {
  const [services, setServices] = useState<Service[]>([]);
  const [membres, setMembres] = useState<Record<string, ServiceMembre[]>>({});
  const [societeUsers, setSocieteUsers] = useState<SocieteUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(true); // false si tables absentes (pré-migration)

  // Formulaire nouveau service
  const [newNom, setNewNom] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCouleur, setNewCouleur] = useState("#6366f1");
  const [creatingService, setCreatingService] = useState(false);

  // Ajout membre
  const [addingMembre, setAddingMembre] = useState<string | null>(null); // service_id
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState<"chef" | "membre">("membre");

  // ── Chargements ─────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // Services
      const { data: svcData, error: svcErr } = await supabase
        .from("services" as never)
        .select("id, nom, description, couleur")
        .eq("societe_id", societeId)
        .order("nom");

      if (svcErr) {
        // Table absente (migration non encore appliquée)
        if (svcErr.code === "42P01") { setReady(false); setLoading(false); return; }
        throw svcErr;
      }

      const svcList = (svcData as Service[]) ?? [];
      setServices(svcList);

      // Membres pour chaque service
      if (svcList.length > 0) {
        const svcIds = svcList.map((s) => s.id);
        const { data: mbData, error: mbErr } = await supabase
          .from("service_membres" as never)
          .select("id, service_id, user_id, role, profiles(email, nom)")
          .in("service_id", svcIds);

        if (mbErr) throw mbErr;

        const mbMap: Record<string, ServiceMembre[]> = {};
        for (const m of (mbData as Array<{
          id: string; service_id: string; user_id: string; role: "chef" | "membre";
          profiles: { email: string | null; nom: string | null } | null;
        }>) ?? []) {
          if (!mbMap[m.service_id]) mbMap[m.service_id] = [];
          mbMap[m.service_id].push({
            id: m.id,
            user_id: m.user_id,
            role: m.role,
            profile: m.profiles ?? undefined,
          });
        }
        setMembres(mbMap);
      }

      // Utilisateurs de la société (pour le sélecteur d'ajout)
      const { data: usData, error: usErr } = await supabase
        .from("user_societes")
        .select("user_id")
        .eq("societe_id", societeId);

      if (usErr) throw usErr;

      const userIds = (usData ?? []).map((u: { user_id: string }) => u.user_id);
      if (userIds.length > 0) {
        const { data: profData } = await supabase
          .from("profiles")
          .select("user_id, email, nom")
          .in("user_id", userIds);
        setSocieteUsers((profData as SocieteUser[]) ?? []);
      }
    } catch (err: unknown) {
      console.error("[ServicesGestion]", err);
    } finally {
      setLoading(false);
    }
  }, [societeId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const createService = async () => {
    if (!newNom.trim()) return toast.error("Nom du service requis");
    setCreatingService(true);
    const { error } = await supabase
      .from("services" as never)
      .insert({ societe_id: societeId, nom: newNom.trim(), description: newDesc.trim() || null, couleur: newCouleur } as never);
    setCreatingService(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Service « ${newNom.trim()} » créé`);
    setNewNom(""); setNewDesc(""); setNewCouleur("#6366f1");
    void loadAll();
  };

  const deleteService = async (svcId: string, nom: string) => {
    if (!confirm(`Supprimer le service « ${nom} » et tous ses membres ?`)) return;
    const { error } = await supabase.from("services" as never).delete().eq("id", svcId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Service « ${nom} » supprimé`);
    void loadAll();
  };

  const addMembre = async (serviceId: string) => {
    if (!selectedUser) return toast.error("Sélectionne un utilisateur");
    const { error } = await supabase
      .from("service_membres" as never)
      .insert({ service_id: serviceId, user_id: selectedUser, role: selectedRole } as never);
    if (error) {
      if (error.code === "23505") toast.error("Cet utilisateur est déjà dans ce service");
      else toast.error(error.message);
      return;
    }
    toast.success("Membre ajouté");
    setAddingMembre(null); setSelectedUser(""); setSelectedRole("membre");
    void loadAll();
  };

  const removeMembre = async (membreId: string) => {
    const { error } = await supabase.from("service_membres" as never).delete().eq("id", membreId);
    if (error) { toast.error(error.message); return; }
    toast.success("Membre retiré");
    void loadAll();
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin" /></div>;

  if (!ready) return (
    <div className="text-center py-8 text-muted-foreground italic text-sm">
      La gestion des services sera disponible après l'application de la migration
      <code className="ml-1 font-mono text-xs">20260513000000_audit_services_corbeille.sql</code>
    </div>
  );

  const userLabel = (uid: string) => {
    const p = societeUsers.find((u) => u.user_id === uid);
    return p ? (p.nom || p.email || uid) : uid;
  };

  return (
    <div className="space-y-5">
      {/* ── Créer un service ────────────────────────────────────────── */}
      {isAdmin && (
        <Card className="p-4 border-dashed">
          <p className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Plus className="size-4" /> Nouveau service
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nom du service *</Label>
              <Input value={newNom} onChange={(e) => setNewNom(e.target.value)} placeholder="Ex : Finance" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Optionnel" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Couleur</Label>
              <div className="flex gap-2">
                <Input type="color" value={newCouleur} onChange={(e) => setNewCouleur(e.target.value)} className="h-10 w-14 p-1 cursor-pointer" />
                <Button onClick={createService} disabled={creatingService} className="flex-1 gap-1.5">
                  {creatingService && <Loader2 className="size-4 animate-spin" />} Créer
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {services.length === 0 && (
        <p className="text-center text-muted-foreground italic py-6">
          Aucun service créé pour cette société.
        </p>
      )}

      {/* ── Liste des services ──────────────────────────────────────── */}
      {services.map((svc) => {
        const svcMembres = membres[svc.id] ?? [];
        const chefs = svcMembres.filter((m) => m.role === "chef");
        const simples = svcMembres.filter((m) => m.role === "membre");

        return (
          <Card key={svc.id} className="p-4 space-y-4">
            {/* En-tête service */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className="size-3 rounded-full shrink-0"
                  style={{ backgroundColor: svc.couleur }}
                />
                <div>
                  <p className="font-semibold">{svc.nom}</p>
                  {svc.description && (
                    <p className="text-xs text-muted-foreground">{svc.description}</p>
                  )}
                </div>
              </div>
              {isAdmin && (
                <Button
                  size="icon" variant="ghost"
                  className="size-8 text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => deleteService(svc.id, svc.nom)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>

            {/* Membres */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Chefs */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5" /> Chef{chefs.length !== 1 ? "s" : ""} de service
                </p>
                {chefs.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Aucun chef désigné</p>
                ) : (
                  <div className="space-y-1.5">
                    {chefs.map((m) => (
                      <div key={m.id} className="flex items-center justify-between bg-muted/40 rounded px-2 py-1.5">
                        <span className="text-sm">{m.profile?.nom || m.profile?.email || m.user_id}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-xs">Chef</Badge>
                          {isAdmin && (
                            <button
                              className="text-destructive hover:text-destructive/70 text-xs"
                              onClick={() => removeMembre(m.id)}
                              title="Retirer"
                            >×</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Membres */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <User className="size-3.5" /> Membre{simples.length !== 1 ? "s" : ""}
                </p>
                {simples.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Aucun membre</p>
                ) : (
                  <div className="space-y-1.5">
                    {simples.map((m) => (
                      <div key={m.id} className="flex items-center justify-between bg-muted/40 rounded px-2 py-1.5">
                        <span className="text-sm">{m.profile?.nom || m.profile?.email || m.user_id}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-xs">Membre</Badge>
                          {isAdmin && (
                            <button
                              className="text-destructive hover:text-destructive/70 text-xs"
                              onClick={() => removeMembre(m.id)}
                              title="Retirer"
                            >×</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Ajouter membre */}
            {isAdmin && (
              addingMembre === svc.id ? (
                <div className="flex flex-wrap gap-2 items-end border-t pt-3">
                  <div className="space-y-1 flex-1 min-w-40">
                    <Label className="text-xs">Utilisateur</Label>
                    <Select value={selectedUser} onValueChange={setSelectedUser}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Sélectionner…" />
                      </SelectTrigger>
                      <SelectContent>
                        {societeUsers.map((u) => (
                          <SelectItem key={u.user_id} value={u.user_id}>
                            {u.nom || u.email || u.user_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Rôle</Label>
                    <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as "chef" | "membre")}>
                      <SelectTrigger className="h-9 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chef">Chef</SelectItem>
                        <SelectItem value="membre">Membre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" onClick={() => addMembre(svc.id)} className="gap-1.5">
                    <Plus className="size-3.5" /> Ajouter
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAddingMembre(null); setSelectedUser(""); }}>
                    Annuler
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm" variant="outline"
                  className="gap-1.5 w-full sm:w-auto"
                  onClick={() => { setAddingMembre(svc.id); setSelectedUser(""); setSelectedRole("membre"); }}
                >
                  <Users className="size-3.5" /> Ajouter un membre
                </Button>
              )
            )}
          </Card>
        );
      })}
    </div>
  );
};
