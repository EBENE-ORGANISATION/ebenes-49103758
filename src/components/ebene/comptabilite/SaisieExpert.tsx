import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Check, AlertCircle } from "lucide-react";
import {
  type EcritureComptable,
  type CodeJournal,
  JOURNAL_LABELS,
  type LigneEcriture,
} from "@/types/ebene";
import {
  rechercherComptes,
  genererNumeroPiece,
  isEcritureEquilibree,
} from "@/lib/planComptable";
import { todayISO } from "@/lib/ebene-utils";

interface Props {
  annee: number;
  mois: number;
  /** Nombre d'écritures existantes ce mois — sert à la numérotation automatique. */
  sequenceEcritures: number;
  onSave: (ecriture: Omit<EcritureComptable, "id">) => void;
  onCancel: () => void;
}

interface LigneForm {
  id: number;
  compte: string;
  intitule: string;
  debit: string;
  credit: string;
  tiers: string;
  suggestions: Array<{ code: string; intitule: string }>;
}

const ligneVide = (id: number): LigneForm => ({
  id,
  compte: "",
  intitule: "",
  debit: "",
  credit: "",
  tiers: "",
  suggestions: [],
});

export const SaisieExpert = ({
  annee,
  mois,
  sequenceEcritures,
  onSave,
  onCancel,
}: Props) => {
  const [journal, setJournal] = useState<CodeJournal>("OD");
  const [date, setDate]       = useState(todayISO());
  const [libelle, setLibelle] = useState("");
  const [error, setError]     = useState("");
  const [lignes, setLignes]   = useState<LigneForm[]>([ligneVide(1), ligneVide(2)]);

  const totalDebit  = lignes.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredit = lignes.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const equilibre   = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const updateLigne = (id: number, patch: Partial<LigneForm>) =>
    setLignes((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const handleCompteChange = (id: number, val: string) => {
    const suggestions = rechercherComptes(val, 8).map((c) => ({
      code: c.code,
      intitule: c.intitule,
    }));
    updateLigne(id, { compte: val, intitule: suggestions[0]?.intitule ?? "", suggestions });
  };

  const selectSuggestion = (id: number, code: string, intitule: string) =>
    updateLigne(id, { compte: code, intitule, suggestions: [] });

  const addLigne = () =>
    setLignes((prev) => [...prev, ligneVide(Date.now())]);

  const removeLigne = (id: number) => {
    if (lignes.length <= 2) return;
    setLignes((prev) => prev.filter((l) => l.id !== id));
  };

  const handleSave = () => {
    setError("");
    if (!date)           { setError("Date obligatoire");    return; }
    if (!libelle.trim()) { setError("Libellé obligatoire"); return; }
    if (!equilibre)      { setError("L'écriture n'est pas équilibrée (Σ débits ≠ Σ crédits)"); return; }

    const lignesValides: LigneEcriture[] = lignes
      .filter((l) => l.compte && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
      .map((l, i) => ({
        id:       i + 1,
        compte:   l.compte,
        intitule: l.intitule || l.compte,
        debit:    parseFloat(l.debit)  || 0,
        credit:   parseFloat(l.credit) || 0,
        tiers:    l.tiers || undefined,
      }));

    if (lignesValides.length < 2)            { setError("Au moins 2 lignes avec montants"); return; }
    if (!isEcritureEquilibree(lignesValides)) { setError("Écriture déséquilibrée");          return; }

    onSave({
      date,
      journal,
      numeroPiece: genererNumeroPiece(journal, annee, sequenceEcritures + 1),
      libelle:     libelle.trim(),
      lignes:      lignesValides,
      statut:      "brouillon",
      annee,
      mois,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Journal *
          </Label>
          <Select value={journal} onValueChange={(v) => setJournal(v as CodeJournal)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(JOURNAL_LABELS) as [CodeJournal, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {k} — {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Date *
          </Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            N° Pièce (auto)
          </Label>
          <Input
            value={genererNumeroPiece(journal, annee, sequenceEcritures + 1)}
            readOnly
            className="bg-muted/40 font-mono text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Libellé *
        </Label>
        <Input
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder="Description de l'opération"
        />
      </div>

      {/* Table des lignes d'écriture */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-2 font-semibold w-28">Compte</th>
                <th className="text-left p-2 font-semibold">Intitulé</th>
                <th className="text-left p-2 font-semibold w-32">Tiers</th>
                <th className="text-right p-2 font-semibold w-28">Débit</th>
                <th className="text-right p-2 font-semibold w-28">Crédit</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id} className="border-t">
                  {/* Compte avec autocomplétion */}
                  <td className="p-1 relative">
                    <Input
                      value={l.compte}
                      onChange={(e) => handleCompteChange(l.id, e.target.value)}
                      className="font-mono h-8 text-sm"
                      placeholder="ex: 701"
                    />
                    {l.suggestions.length > 0 && (
                      <div className="absolute z-20 top-full left-0 w-72 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {l.suggestions.map((s) => (
                          <button
                            key={s.code}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex gap-2"
                            onMouseDown={(e) => {
                              e.preventDefault(); // évite le blur
                              selectSuggestion(l.id, s.code, s.intitule);
                            }}
                          >
                            <span className="font-mono font-bold text-primary w-12 shrink-0">{s.code}</span>
                            <span className="text-muted-foreground truncate">{s.intitule}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  {/* Intitulé */}
                  <td className="p-1">
                    <Input
                      value={l.intitule}
                      onChange={(e) => updateLigne(l.id, { intitule: e.target.value })}
                      className="h-8 text-sm"
                      placeholder="Libellé du compte"
                    />
                  </td>
                  {/* Tiers */}
                  <td className="p-1">
                    <Input
                      value={l.tiers}
                      onChange={(e) => updateLigne(l.id, { tiers: e.target.value })}
                      className="h-8 text-sm"
                      placeholder="Client/Fourn."
                    />
                  </td>
                  {/* Débit */}
                  <td className="p-1">
                    <Input
                      type="number"
                      min="0"
                      value={l.debit}
                      onChange={(e) =>
                        updateLigne(l.id, {
                          debit:  e.target.value,
                          credit: e.target.value ? "" : l.credit,
                        })
                      }
                      className="h-8 text-sm text-right"
                      placeholder="0"
                    />
                  </td>
                  {/* Crédit */}
                  <td className="p-1">
                    <Input
                      type="number"
                      min="0"
                      value={l.credit}
                      onChange={(e) =>
                        updateLigne(l.id, {
                          credit: e.target.value,
                          debit:  e.target.value ? "" : l.debit,
                        })
                      }
                      className="h-8 text-sm text-right"
                      placeholder="0"
                    />
                  </td>
                  {/* Supprimer */}
                  <td className="p-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive"
                      onClick={() => removeLigne(l.id)}
                      disabled={lignes.length <= 2}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}

              {/* Ligne des totaux */}
              <tr className="border-t bg-muted/60 font-bold">
                <td colSpan={3} className="p-2 text-sm">TOTAUX</td>
                <td className="p-2 text-right text-sm tabular-nums">
                  {totalDebit.toLocaleString("fr-FR")}
                </td>
                <td className="p-2 text-right text-sm tabular-nums">
                  {totalCredit.toLocaleString("fr-FR")}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={addLigne} className="gap-1.5">
          <Plus className="size-4" /> Ajouter une ligne
        </Button>
        <Badge variant={equilibre ? "default" : "secondary"} className="text-xs">
          {equilibre
            ? "✓ Écriture équilibrée"
            : totalDebit === 0 && totalCredit === 0
              ? "Saisir les montants"
              : `Écart : ${Math.abs(totalDebit - totalCredit).toLocaleString("fr-FR")} FCFA`}
        </Badge>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button onClick={handleSave} disabled={!equilibre || !libelle.trim()}>
          <Check className="size-4 mr-1.5" /> Enregistrer
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </div>
  );
};
