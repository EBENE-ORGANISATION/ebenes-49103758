import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  HEADER_FEATURES,
  HEADER_FEATURE_LABELS,
  type HeaderFeature,
} from "@/lib/features";

interface Props {
  users: { user_id: string; email: string | null; nom: string | null }[];
}

export const FeatureAccessPanel = ({ users }: Props) => {
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [draft, setDraft] = useState<Record<HeaderFeature, boolean>>(
    Object.fromEntries(HEADER_FEATURES.map((f) => [f, false])) as Record<HeaderFeature, boolean>
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const userLabel = useMemo(() => {
    const u = users.find((x) => x.user_id === selectedUser);
    return u ? (u.nom || u.email || u.user_id) : "—";
  }, [users, selectedUser]);

  const loadFeatures = async (uid: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_feature_access")
        .select("feature, enabled")
        .eq("user_id", uid);
      if (error) throw error;
      const next = Object.fromEntries(HEADER_FEATURES.map((f) => [f, false])) as Record<HeaderFeature, boolean>;
      (data || []).forEach((row) => {
        next[row.feature as HeaderFeature] = !!row.enabled;
      });
      setDraft(next);
    } catch (e) {
      toast.error("Chargement impossible : " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && selectedUser) void loadFeatures(selectedUser);
  }, [open, selectedUser]);

  const save = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const rows = HEADER_FEATURES.map((f) => ({
        user_id: selectedUser,
        feature: f,
        enabled: draft[f],
      }));
      const { error } = await supabase
        .from("user_feature_access")
        .upsert(rows, { onConflict: "user_id,feature" });
      if (error) throw error;
      toast.success("Accès aux fonctionnalités enregistré");
      setOpen(false);
    } catch (e) {
      toast.error("Échec : " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> Accès aux boutons du header
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Choisissez, pour chaque utilisateur non-admin, les boutons visibles dans
            la barre supérieure (alertes, récap, archives, JSON, gestion utilisateurs,
            audit). Par défaut, tout est masqué tant que vous n'avez rien activé.
            L'administrateur conserve toujours l'accès complet.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">Configurer</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Boutons accessibles</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Utilisateur</Label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner un utilisateur" /></SelectTrigger>
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
                    <Loader2 className="size-5 animate-spin mr-2" /> Chargement…
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="border rounded-md divide-y">
                      {HEADER_FEATURES.map((f) => (
                        <div key={f} className="flex items-center justify-between gap-3 p-3">
                          <span className="text-sm font-medium">{HEADER_FEATURE_LABELS[f]}</span>
                          <Switch
                            checked={draft[f]}
                            onCheckedChange={(v) =>
                              setDraft((prev) => ({ ...prev, [f]: !!v }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cible : <strong>{userLabel}</strong>. Effet à la prochaine
                      connexion ou rechargement.
                    </p>
                  </div>
                )
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button onClick={save} disabled={!selectedUser || saving || loading}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : "Enregistrer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
};
