import { useState } from "react";
import { Layers, Plus, Trash2, Loader2, Check, X, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useActivites } from "@/hooks/data/useActivites";
import type { Activite } from "@/types/ebene";

const PALETTE = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#ef4444", "#8b5cf6", "#14b8a6", "#f97316", "#64748b",
];

/**
 * Gestion des compartiments d'activité d'une société (Hôtel, Bar, Commerce…).
 * Créer, renommer, recolorer, activer/désactiver, supprimer. La suppression ne
 * détruit aucune donnée : les écritures rattachées repassent « sans activité ».
 */
export const ActivitesManager = ({ societeId }: { societeId: string }) => {
  const {
    activites, isLoading, createActivite, updateActivite, removeActivite,
  } = useActivites(societeId);

  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState(PALETTE[0]);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNom, setEditNom] = useState("");

  const handleCreate = async () => {
    const clean = nom.trim();
    if (!clean) return;
    if (activites.some((a) => a.nom.toLowerCase() === clean.toLowerCase())) {
      toast.error("Une activité porte déjà ce nom");
      return;
    }
    setCreating(true);
    try {
      await createActivite({ nom: clean, couleur });
      setNom("");
      setCouleur(PALETTE[(activites.length + 1) % PALETTE.length]);
      toast.success("Activité créée");
    } catch {
      toast.error("Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (a: Activite) => {
    setEditId(a.id);
    setEditNom(a.nom);
  };

  const saveEdit = async (a: Activite) => {
    const clean = editNom.trim();
    if (!clean) return;
    try {
      await updateActivite(a.id, { nom: clean });
      setEditId(null);
      toast.success("Activité renommée");
    } catch {
      toast.error("Erreur lors du renommage");
    }
  };

  const changeColor = async (a: Activite, c: string) => {
    try {
      await updateActivite(a.id, { couleur: c });
    } catch {
      toast.error("Erreur lors du changement de couleur");
    }
  };

  const toggleActif = async (a: Activite) => {
    try {
      await updateActivite(a.id, { actif: !a.actif });
    } catch {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const handleDelete = async (a: Activite) => {
    try {
      await removeActivite(a.id);
      toast.success("Activité supprimée");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="size-4 text-primary" />
        <h2 className="font-bold">Compartiments d'activité</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Cloisonnez les données d'une société aux multiples métiers (ex : Hôtel,
        Bar, Commerce). Chaque activité a son propre suivi ; la vue « Toutes les
        activités » reste consolidée. Une seule activité ? Le sélecteur reste masqué.
      </p>

      {/* Liste des activités */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </div>
      ) : activites.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Aucune activité pour l'instant.</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {activites.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3">
              {/* Couleur */}
              <input
                type="color"
                value={a.couleur}
                onChange={(e) => changeColor(a, e.target.value)}
                className="h-7 w-7 rounded cursor-pointer border p-0.5 shrink-0"
                title="Changer la couleur"
              />

              {/* Nom (édition inline) */}
              {editId === a.id ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <Input
                    value={editNom}
                    onChange={(e) => setEditNom(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(a);
                      if (e.key === "Escape") setEditId(null);
                    }}
                    autoFocus
                    className="h-8"
                  />
                  <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={() => saveEdit(a)}>
                    <Check className="size-4 text-success" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={() => setEditId(null)}>
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <span className={`flex-1 min-w-0 truncate text-sm ${a.actif ? "" : "text-muted-foreground line-through"}`}>
                    {a.nom}
                  </span>
                  <Button
                    size="icon" variant="ghost" className="size-8 shrink-0"
                    onClick={() => startEdit(a)}
                    title="Renommer"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                </>
              )}

              {/* Actif */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Switch checked={a.actif} onCheckedChange={() => toggleActif(a)} />
                <span className="text-[10px] text-muted-foreground w-10">
                  {a.actif ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Supprimer */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="size-8 shrink-0 text-destructive hover:text-destructive">
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer « {a.nom} » ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Aucune donnée n'est perdue : les factures, transactions, articles…
                      rattachés à cette activité repasseront « sans activité » et
                      resteront visibles dans la vue consolidée. Vous pourrez les
                      réaffecter à une autre activité.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDelete(a)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}

      {/* Ajout */}
      <div className="space-y-2 pt-1">
        <Label className="text-xs">Nouvelle activité</Label>
        <div className="flex items-end gap-2">
          <input
            type="color"
            value={couleur}
            onChange={(e) => setCouleur(e.target.value)}
            className="h-10 w-10 rounded cursor-pointer border p-0.5 shrink-0"
            title="Couleur"
          />
          <Input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            placeholder="Ex : Hôtel, Bar, Commerce…"
            className="flex-1"
          />
          <Button onClick={handleCreate} disabled={creating || !nom.trim()} className="shrink-0">
            {creating ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Plus className="size-4 mr-1.5" />}
            Ajouter
          </Button>
        </div>
      </div>
    </Card>
  );
};
