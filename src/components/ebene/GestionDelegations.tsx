import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { useFiscalDelegations } from "@/hooks/useFiscalDelegations";

interface Props {
  societeId: string;
  currentUserId: string;
  canEdit?: boolean;
}

export const GestionDelegations = ({
  societeId,
  currentUserId,
  canEdit = false,
}: Props) => {
  const {
    delegations,
    isLoading,
    addDelegation,
    toggleDelegation,
    removeDelegation,
    isAdding,
  } = useFiscalDelegations(societeId, currentUserId);

  const [email,     setEmail]     = useState("");
  const [note,      setNote]      = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [showForm,  setShowForm]  = useState(false);

  const handleAdd = async () => {
    if (!email.trim()) return;
    try {
      await addDelegation({
        email:     email.trim(),
        note:      note.trim() || undefined,
        expiresAt: expiresAt || null,
      });
      setEmail(""); setNote(""); setExpiresAt(""); setShowForm(false);
      toast.success("Délégation fiscale accordée");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleToggle = async (id: string, current: boolean) => {
    try {
      await toggleDelegation({ id, isActive: !current });
      toast.success(!current ? "Délégation réactivée" : "Délégation suspendue");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Supprimer cette délégation fiscale ?")) return;
    try {
      await removeDelegation(id);
      toast.success("Délégation supprimée");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Délégations fiscales</p>
          <p className="text-xs text-muted-foreground">
            Accordez un accès lecture aux données fiscales à un expert-comptable ou auditeur.
          </p>
        </div>
        {canEdit && !showForm && (
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="size-4" /> Ajouter
          </Button>
        )}
      </div>

      {/* ── Formulaire d'ajout ──────────────────────────────────────────── */}
      {showForm && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
          <p className="text-sm font-medium">Nouvelle délégation</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Email EBENE du délégué *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="expert@cabinet.tg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expiration (optionnel)</Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Note (optionnel)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex : Cabinet Fidafrica — Audit 2025"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!email.trim() || isAdding}>
              {isAdding
                ? <><Loader2 className="size-4 mr-1 animate-spin" />Ajout…</>
                : <><UserCheck className="size-4 mr-1" />Accorder</>}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* ── Liste des délégations ───────────────────────────────────────── */}
      {delegations.length === 0 ? (
        <p className="text-sm text-muted-foreground italic text-center py-4">
          Aucune délégation fiscale. {canEdit && "Cliquez sur « Ajouter » pour en créer une."}
        </p>
      ) : (
        <div className="space-y-2">
          {delegations.map((d) => (
            <div
              key={d.id}
              className={`border rounded-lg p-3 flex items-center justify-between gap-3 ${
                d.is_active ? "" : "opacity-60"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">
                    {d.delegue_email ?? d.delegue_user_id.slice(0, 8) + "…"}
                  </span>
                  <Badge
                    variant={d.is_active ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {d.is_active ? "✓ Actif" : "Suspendu"}
                  </Badge>
                  {d.expires_at && (
                    <Badge variant="outline" className="text-xs">
                      Expire {new Date(d.expires_at).toLocaleDateString("fr-FR")}
                    </Badge>
                  )}
                </div>
                {d.note && (
                  <p className="text-xs text-muted-foreground mt-0.5">{d.note}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Accordé le {new Date(d.granted_at).toLocaleDateString("fr-FR")}
                </p>
              </div>

              {canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  <Switch
                    checked={d.is_active}
                    onCheckedChange={() => handleToggle(d.id, d.is_active)}
                    title={d.is_active ? "Suspendre" : "Réactiver"}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-destructive hover:bg-destructive/10"
                    onClick={() => handleRemove(d.id)}
                    title="Supprimer la délégation"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
