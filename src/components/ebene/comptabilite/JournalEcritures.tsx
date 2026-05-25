import { useState } from "react";
import { type EcritureComptable, type StatutEcriture, JOURNAL_LABELS } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check, XCircle, ChevronDown, ChevronRight,
  Trash2, Printer, BookOpen,
} from "lucide-react";
import { formatMontant } from "@/lib/ebene-utils";

interface Props {
  ecritures: EcritureComptable[];
  isChefCompta?: boolean;
  onValider?: (id: number) => void;
  onRejeter?: (id: number, motif: string) => void;
  onSupprimer?: (id: number) => void;
}

const STATUT_STYLE: Record<StatutEcriture, string> = {
  brouillon: "bg-muted text-muted-foreground border-muted",
  valide:    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200",
  cloture:   "bg-primary/15 text-primary border-primary/20",
};

const STATUT_LABEL: Record<StatutEcriture, string> = {
  brouillon: "Brouillon",
  valide:    "✓ Validé",
  cloture:   "🔒 Clôturé",
};

// Couleurs par type de journal
const JOURNAL_COLORS: Record<string, string> = {
  VE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200",
  AC: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-200",
  BQ: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200",
  CA: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-200",
  OD: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-200",
  AN: "bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-200",
};

export const JournalEcritures = ({
  ecritures, isChefCompta, onValider, onRejeter, onSupprimer,
}: Props) => {
  const [expanded, setExpanded] = useState<number | null>(null);

  // T2 — Empty state illustré
  if (ecritures.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <BookOpen className="size-8 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-base">Aucune écriture ce mois</p>
          <p className="text-sm text-muted-foreground mt-1">
            Utilisez l'onglet <strong>📒 Saisie</strong> pour créer votre première écriture SYSCOHADA.
          </p>
        </div>
      </div>
    );
  }

  const sorted = [...ecritures].sort((a, b) => {
    const dateA = a.date ?? `${a.annee}-${String(a.mois).padStart(2, "0")}-01`;
    const dateB = b.date ?? `${b.annee}-${String(b.mois).padStart(2, "0")}-01`;
    return dateB.localeCompare(dateA);
  });

  const totalMouvements = ecritures
    .filter((e) => e.statut !== "brouillon")
    .reduce((s, e) => s + (Array.isArray(e.lignes) ? e.lignes : []).reduce((a, l) => a + l.debit, 0), 0);
  const brouillons = ecritures.filter((e) => e.statut === "brouillon").length;
  const validees   = ecritures.filter((e) => e.statut === "valide").length;

  return (
    <div className="space-y-3">
      {/* En-tête : stats + bouton imprimer */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs gap-1.5">
            <span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" />
            {brouillons} brouillon{brouillons > 1 ? "s" : ""}
          </Badge>
          <Badge variant="outline" className="text-xs gap-1.5 text-emerald-700 dark:text-emerald-400 border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            {validees} validée{validees > 1 ? "s" : ""}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Total mouvements :{" "}
            <span className="font-mono font-semibold">{formatMontant(totalMouvements)}</span>
          </span>
        </div>
        {/* T7 — Imprimer */}
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => window.print()}>
          <Printer className="size-3.5" /> Imprimer
        </Button>
      </div>

      {/* Liste des écritures */}
      <div className="space-y-1.5">
        {sorted.map((e) => {
          const lignes       = Array.isArray(e.lignes) ? e.lignes : [];
          const totalDebit   = lignes.reduce((s, l) => s + l.debit,  0);
          const totalCredit  = lignes.reduce((s, l) => s + l.credit, 0);
          const equilibree   = Math.abs(totalDebit - totalCredit) < 0.01;
          const isOpen       = expanded === e.id;
          const journalCls   = JOURNAL_COLORS[e.journal] ?? "bg-muted text-muted-foreground border-muted";
          const dateAffichee = e.date ?? (e.annee && e.mois
            ? `${e.annee}-${String(e.mois).padStart(2, "0")}-01`
            : "—");

          return (
            <div
              key={e.id}
              className={`border rounded-lg overflow-hidden transition-shadow ${
                e.statut === "brouillon" ? "opacity-70 border-dashed" : "shadow-sm"
              }`}
            >
              {/* En-tête écriture */}
              <div
                className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded(isOpen ? null : e.id)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isOpen
                    ? <ChevronDown  className="size-3.5 text-muted-foreground shrink-0" />
                    : <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />}

                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-primary">{e.numeroPiece}</span>
                      {/* Badge journal coloré */}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${journalCls}`}>
                        {e.journal} — {JOURNAL_LABELS[e.journal]}
                      </span>
                      {/* Badge statut */}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${STATUT_STYLE[e.statut]}`}>
                        {STATUT_LABEL[e.statut]}
                      </span>
                      {/* Alerte déséquilibre */}
                      {!equilibree && lignes.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 font-medium">
                          ⚠ Déséquilibre
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate">{e.libelle}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {dateAffichee} · {lignes.length} ligne{lignes.length > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {/* Totaux D/C visibles sur desktop */}
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-400">
                      D {formatMontant(totalDebit)}
                    </p>
                    <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
                      C {formatMontant(totalCredit)}
                    </p>
                  </div>

                  {/* Actions chef compta */}
                  {isChefCompta && e.statut === "brouillon" && (
                    <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
                      {onValider && (
                        <Button size="icon" variant="ghost"
                          className="size-7 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                          onClick={() => onValider(e.id)} title="Valider">
                          <Check className="size-3.5" />
                        </Button>
                      )}
                      {onRejeter && (
                        <Button size="icon" variant="ghost"
                          className="size-7 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                          onClick={() => {
                            const motif = window.prompt("Motif du rejet :", "");
                            if (motif?.trim()) onRejeter(e.id, motif.trim());
                          }} title="Rejeter">
                          <XCircle className="size-3.5" />
                        </Button>
                      )}
                      {onSupprimer && (
                        <Button size="icon" variant="ghost"
                          className="size-7 text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm("Supprimer définitivement cette écriture ?")) onSupprimer(e.id);
                          }} title="Supprimer">
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* T1/T2 — Détail lignes avec alternance et couleurs débit/crédit */}
              {isOpen && (
                <div className="border-t bg-muted/10">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[480px]">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="text-left px-3 py-2 font-semibold w-20">Compte</th>
                          <th className="text-left px-2 py-2 font-semibold">Intitulé</th>
                          <th className="text-left px-2 py-2 font-semibold hidden sm:table-cell">Tiers</th>
                          <th className="text-right px-3 py-2 font-semibold w-28 text-blue-700 dark:text-blue-400">Débit</th>
                          <th className="text-right px-3 py-2 font-semibold w-28 text-emerald-700 dark:text-emerald-400">Crédit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* T1 — Alternance paires/impaires */}
                        {lignes.map((l, i) => (
                          <tr
                            key={l.id}
                            className={`border-b border-border/30 hover:bg-muted/30 transition-colors ${
                              i % 2 === 0 ? "bg-background" : "bg-muted/10"
                            }`}
                          >
                            <td className="px-3 py-1.5 font-mono font-bold text-primary">{l.compte}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{l.intitule}</td>
                            <td className="px-2 py-1.5 text-muted-foreground hidden sm:table-cell">{l.tiers || "—"}</td>
                            {/* T2 — Débit en bleu */}
                            <td className="px-3 py-1.5 text-right tabular-nums font-mono font-semibold text-blue-700 dark:text-blue-400">
                              {l.debit > 0 ? l.debit.toLocaleString("fr-FR") : ""}
                            </td>
                            {/* T2 — Crédit en vert */}
                            <td className="px-3 py-1.5 text-right tabular-nums font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                              {l.credit > 0 ? l.credit.toLocaleString("fr-FR") : ""}
                            </td>
                          </tr>
                        ))}
                        {/* Totaux */}
                        <tr className="bg-muted/40 font-bold border-t-2 border-border">
                          <td colSpan={3} className="px-3 py-2 text-xs uppercase tracking-wide">Totaux</td>
                          <td className={`px-3 py-2 text-right tabular-nums font-mono ${
                            !equilibree ? "text-destructive" : "text-blue-700 dark:text-blue-400"
                          }`}>
                            {totalDebit.toLocaleString("fr-FR")}
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums font-mono ${
                            !equilibree ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
                          }`}>
                            {totalCredit.toLocaleString("fr-FR")}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {e.motifRejet && (
                    <p className="text-xs text-destructive px-3 py-2 italic border-t">
                      ✗ Motif de rejet : {e.motifRejet}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
