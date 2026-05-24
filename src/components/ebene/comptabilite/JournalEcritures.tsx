import { useState } from "react";
import { type EcritureComptable, type StatutEcriture, JOURNAL_LABELS } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, XCircle, ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  ecritures: EcritureComptable[];
  isChefCompta?: boolean;
  onValider?: (id: number) => void;
  onRejeter?: (id: number, motif: string) => void;
  onSupprimer?: (id: number) => void;
}

const STATUT_STYLE: Record<StatutEcriture, string> = {
  brouillon: "bg-muted text-muted-foreground",
  valide:    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  cloture:   "bg-primary/15 text-primary",
};

const STATUT_LABEL: Record<StatutEcriture, string> = {
  brouillon: "Brouillon",
  valide:    "✓ Validé",
  cloture:   "🔒 Clôturé",
};

export const JournalEcritures = ({
  ecritures,
  isChefCompta,
  onValider,
  onRejeter,
  onSupprimer,
}: Props) => {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (ecritures.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8 italic">
        Aucune écriture comptable ce mois-ci.
        <br />
        <span className="text-sm">Utilisez l'onglet "📒 Saisie SYSCOHADA" pour créer une écriture.</span>
      </p>
    );
  }

  const sorted = [...ecritures].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-2">
      {sorted.map((e) => {
        const totalDebit = e.lignes.reduce((s, l) => s + l.debit, 0);
        const isOpen     = expanded === e.id;

        return (
          <div key={e.id} className="border rounded-lg overflow-hidden">
            {/* En-tête de l'écriture */}
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => setExpanded(isOpen ? null : e.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                {isOpen
                  ? <ChevronDown  className="size-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-primary">{e.numeroPiece}</span>
                    <Badge variant="outline" className="text-xs">
                      {e.journal} — {JOURNAL_LABELS[e.journal]}
                    </Badge>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_STYLE[e.statut]}`}>
                      {STATUT_LABEL[e.statut]}
                    </span>
                  </div>
                  <p className="text-sm font-medium truncate mt-0.5">{e.libelle}</p>
                  <p className="text-xs text-muted-foreground">{e.date}</p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 ml-2">
                <span className="text-sm font-semibold tabular-nums">
                  {totalDebit.toLocaleString("fr-FR")} FCFA
                </span>

                {/* Actions chef compta — visibles sur les brouillons uniquement */}
                {isChefCompta && e.statut === "brouillon" && (
                  <>
                    {onValider && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-emerald-600 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                        onClick={(ev) => { ev.stopPropagation(); onValider(e.id); }}
                        title="Valider l'écriture"
                      >
                        <Check className="size-4" />
                      </Button>
                    )}
                    {onRejeter && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-amber-600 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          const motif = window.prompt("Motif du rejet :", "");
                          if (motif?.trim()) onRejeter(e.id, motif.trim());
                        }}
                        title="Rejeter l'écriture"
                      >
                        <XCircle className="size-4" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Détail des lignes — affiché quand expanded */}
            {isOpen && (
              <div className="border-t px-3 pb-3 pt-2 bg-muted/20">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[480px]">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1 pr-3 font-semibold">Compte</th>
                        <th className="text-left py-1 pr-3 font-semibold">Intitulé</th>
                        <th className="text-left py-1 pr-3 font-semibold">Tiers</th>
                        <th className="text-right py-1 pr-3 font-semibold">Débit</th>
                        <th className="text-right py-1 font-semibold">Crédit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.lignes.map((l) => (
                        <tr key={l.id} className="border-b border-border/40">
                          <td className="py-1 pr-3 font-mono font-bold text-primary">{l.compte}</td>
                          <td className="py-1 pr-3 text-muted-foreground">{l.intitule}</td>
                          <td className="py-1 pr-3 text-muted-foreground">{l.tiers || "—"}</td>
                          <td className="py-1 pr-3 text-right tabular-nums">
                            {l.debit > 0 ? l.debit.toLocaleString("fr-FR") : ""}
                          </td>
                          <td className="py-1 text-right tabular-nums">
                            {l.credit > 0 ? l.credit.toLocaleString("fr-FR") : ""}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-bold border-t">
                        <td colSpan={3} className="py-1 pr-3">TOTAUX</td>
                        <td className="py-1 pr-3 text-right tabular-nums">
                          {e.lignes.reduce((s, l) => s + l.debit,  0).toLocaleString("fr-FR")}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {e.lignes.reduce((s, l) => s + l.credit, 0).toLocaleString("fr-FR")}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {e.motifRejet && (
                  <p className="text-xs text-destructive mt-2 italic">
                    ✗ Motif de rejet : {e.motifRejet}
                  </p>
                )}

                {/* Bouton supprimer (chef compta, brouillon uniquement) */}
                {isChefCompta && e.statut === "brouillon" && onSupprimer && (
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-7"
                      onClick={() => {
                        if (confirm("Supprimer définitivement cette écriture ?")) onSupprimer(e.id);
                      }}
                    >
                      Supprimer l'écriture
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
