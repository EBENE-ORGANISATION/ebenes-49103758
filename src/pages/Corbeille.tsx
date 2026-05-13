/**
 * Corbeille.tsx — Page globale de la corbeille (soft-delete).
 *
 * Liste tous les éléments supprimés de l'application, groupés par type d'entité.
 * Accessible aux admins, chefs compta et chefs GRH.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, Trash2, RotateCcw, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { fetchDeleted, softRestore, softPurge } from "@/lib/softDelete";
import { toast } from "sonner";

// ─── Définition des entités gérées ──────────────────────────────────────────

interface EntityDef {
  table: string;
  label: string;
  emoji: string;
  selectFields: string;
  buildLabel: (row: Record<string, unknown>) => string;
  buildSublabel?: (row: Record<string, unknown>) => string;
}

const ENTITIES: EntityDef[] = [
  {
    table: "employes",
    label: "Employés",
    emoji: "👤",
    selectFields: "id, nom, poste, deleted_at",
    buildLabel: (r) => String(r.nom ?? ""),
    buildSublabel: (r) => String(r.poste ?? ""),
  },
  {
    table: "transactions",
    label: "Transactions",
    emoji: "💳",
    selectFields: "id, description, montant, date, deleted_at",
    buildLabel: (r) => String(r.description ?? ""),
    buildSublabel: (r) => {
      const m = Number(r.montant ?? 0);
      return `${m.toLocaleString("fr-FR")} F — ${r.date ?? ""}`;
    },
  },
  {
    table: "factures",
    label: "Factures",
    emoji: "🧾",
    selectFields: "id, numero, client, total_ttc, deleted_at",
    buildLabel: (r) => `Facture ${r.numero ?? ""}`,
    buildSublabel: (r) => {
      const ttc = Number(r.total_ttc ?? 0);
      return `${r.client ?? ""} — ${ttc.toLocaleString("fr-FR")} F`;
    },
  },
  {
    table: "devis",
    label: "Devis",
    emoji: "📋",
    selectFields: "id, numero, client, total_ttc, deleted_at",
    buildLabel: (r) => `Devis ${r.numero ?? ""}`,
    buildSublabel: (r) => {
      const ttc = Number(r.total_ttc ?? 0);
      return `${r.client ?? ""} — ${ttc.toLocaleString("fr-FR")} F`;
    },
  },
  {
    table: "articles",
    label: "Articles stock",
    emoji: "📦",
    selectFields: "id, reference, designation, deleted_at",
    buildLabel: (r) => String(r.designation ?? ""),
    buildSublabel: (r) => `Réf. ${r.reference ?? ""}`,
  },
  {
    table: "fournisseurs",
    label: "Fournisseurs",
    emoji: "🏭",
    selectFields: "id, nom, email, deleted_at",
    buildLabel: (r) => String(r.nom ?? ""),
    buildSublabel: (r) => String(r.email ?? ""),
  },
  {
    table: "absences",
    label: "Absences",
    emoji: "📅",
    selectFields: "id, type, date_debut, date_fin, jours, deleted_at",
    buildLabel: (r) => `Absence — ${r.type ?? ""}`,
    buildSublabel: (r) => `${r.date_debut ?? ""} → ${r.date_fin ?? ""} (${r.jours ?? 0} j)`,
  },
  {
    table: "sanctions",
    label: "Sanctions",
    emoji: "⚠️",
    selectFields: "id, type, date, motif, deleted_at",
    buildLabel: (r) => `Sanction — ${r.type ?? ""}`,
    buildSublabel: (r) => `${r.date ?? ""} — ${String(r.motif ?? "").slice(0, 50)}`,
  },
  {
    table: "primes",
    label: "Primes",
    emoji: "🎁",
    selectFields: "id, libelle, montant, deleted_at",
    buildLabel: (r) => String(r.libelle ?? ""),
    buildSublabel: (r) => `${Number(r.montant ?? 0).toLocaleString("fr-FR")} F`,
  },
  {
    table: "immobilisations",
    label: "Immobilisations",
    emoji: "🏗️",
    selectFields: "id, libelle, valeur_origine, deleted_at",
    buildLabel: (r) => String(r.libelle ?? ""),
    buildSublabel: (r) =>
      `Valeur d'origine : ${Number(r.valeur_origine ?? 0).toLocaleString("fr-FR")} F`,
  },
];

// ─── Types locaux ────────────────────────────────────────────────────────────

interface DeletedItem {
  id: number | string;
  label: string;
  sublabel?: string;
  deletedAt: string;
  table: string;
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function Corbeille() {
  const { isAdmin, isChefCompta, isChefGrh } = useAuth();
  const { currentSociete } = useTenant();
  const qc = useQueryClient();
  const societeId = currentSociete?.id ?? "";

  // Filtrer les entités selon les droits
  const visibleTables = new Set<string>();
  if (isAdmin || isChefGrh) {
    ["employes", "absences", "sanctions", "primes"].forEach((t) => visibleTables.add(t));
  }
  if (isAdmin || isChefCompta) {
    ["transactions", "factures", "devis", "articles", "fournisseurs", "immobilisations"].forEach(
      (t) => visibleTables.add(t),
    );
  }

  const visibleEntities = ENTITIES.filter((e) => visibleTables.has(e.table));

  // Une seule query qui charge TOUTES les entités visibles d'un coup
  const { data: allItems = {}, isLoading } = useQuery({
    queryKey: ["corbeille-all", societeId, [...visibleTables].sort().join(",")],
    queryFn: async () => {
      if (!societeId) return {} as Record<string, DeletedItem[]>;
      const results: Record<string, DeletedItem[]> = {};
      await Promise.all(
        visibleEntities.map(async (entity) => {
          const rows = await fetchDeleted(entity.table, societeId, entity.selectFields);
          results[entity.table] = rows.map((row) => ({
            id: row.id,
            label: entity.buildLabel(row as Record<string, unknown>),
            sublabel: entity.buildSublabel?.(row as Record<string, unknown>),
            deletedAt: row.deleted_at,
            table: entity.table,
          }));
        }),
      );
      return results;
    },
    enabled: !!societeId,
    staleTime: 30_000,
  });

  const totalItems = Object.values(allItems).reduce((s, arr) => s + arr.length, 0);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["corbeille-all", societeId] });
  };

  const restoreMutation = useMutation({
    mutationFn: async ({ table, id }: { table: string; id: number | string }) => {
      await softRestore(table, id, societeId);
    },
    onSuccess: (_, { table }) => {
      invalidate();
      // Invalide aussi la liste active de l'entité (queryKey = [table, societeId])
      void qc.invalidateQueries({ queryKey: [table, societeId] });
      toast.success("Élément restauré");
    },
    onError: (err) => toast.error(`Erreur : ${(err as Error).message}`),
  });

  const purgeMutation = useMutation({
    mutationFn: async ({ table, id }: { table: string; id: number | string }) => {
      await softPurge(table, id, societeId);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Élément supprimé définitivement");
    },
    onError: (err) => toast.error(`Erreur : ${(err as Error).message}`),
  });

  const handleRestore = (table: string, id: number | string) => {
    restoreMutation.mutate({ table, id });
  };

  const handlePurge = (table: string, id: number | string) => {
    if (!confirm("Supprimer définitivement cet élément ? Cette action est irréversible.")) return;
    purgeMutation.mutate({ table, id });
  };

  if (!societeId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Aucune société sélectionnée.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* En-tête */}
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/">
              <ArrowLeft className="size-4" /> Retour
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Trash2 className="size-6 text-destructive" /> Corbeille
            </h1>
            <p className="text-sm text-muted-foreground">
              Éléments supprimés de l'application — restaurez ou supprimez définitivement.
            </p>
          </div>
          {totalItems > 0 && (
            <Badge variant="destructive" className="text-sm px-3 py-1">
              {totalItems} élément{totalItems > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Chargement */}
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="size-5 animate-spin" /> Chargement de la corbeille…
          </div>
        )}

        {/* Vide */}
        {!isLoading && totalItems === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
            <Package className="size-12 opacity-30" />
            <p className="text-lg font-medium">La corbeille est vide</p>
            <p className="text-sm">Les éléments supprimés apparaîtront ici.</p>
          </div>
        )}

        {/* Groupes par entité */}
        {!isLoading &&
          visibleEntities.map((entity) => {
            const items = allItems[entity.table] ?? [];
            if (items.length === 0) return null;
            return (
              <EntitySection
                key={entity.table}
                entity={entity}
                items={items}
                onRestore={handleRestore}
                onPurge={handlePurge}
                isRestoring={restoreMutation.isPending}
                isPurging={purgeMutation.isPending}
              />
            );
          })}
      </div>
    </div>
  );
}

// ─── Section par type d'entité ───────────────────────────────────────────────

function EntitySection({
  entity,
  items,
  onRestore,
  onPurge,
  isRestoring,
  isPurging,
}: {
  entity: EntityDef;
  items: DeletedItem[];
  onRestore: (table: string, id: number | string) => void;
  onPurge: (table: string, id: number | string) => void;
  isRestoring: boolean;
  isPurging: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card>
      <CardHeader
        className="pb-2 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <span className="text-xl">{entity.emoji}</span>
            <span>{entity.label}</span>
            <Badge variant="secondary" className="ml-1">
              {items.length}
            </Badge>
          </span>
          <span className="text-xs text-muted-foreground font-normal">
            {expanded ? "▲ masquer" : "▼ voir"}
          </span>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="divide-y">
            {items.map((item) => (
              <div key={String(item.id)} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.label}</p>
                  {item.sublabel && (
                    <p className="text-xs text-muted-foreground truncate">{item.sublabel}</p>
                  )}
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    Supprimé le{" "}
                    {new Date(item.deletedAt).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-success border-success/40 hover:bg-success/10"
                    disabled={isRestoring || isPurging}
                    onClick={() => onRestore(item.table, item.id)}
                  >
                    <RotateCcw className="size-3.5" /> Restaurer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                    disabled={isRestoring || isPurging}
                    onClick={() => onPurge(item.table, item.id)}
                  >
                    <Trash2 className="size-3.5" /> Supprimer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
