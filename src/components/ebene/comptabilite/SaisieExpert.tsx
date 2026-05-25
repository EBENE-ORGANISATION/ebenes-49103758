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
import { Plus, Trash2, Check, AlertCircle, Loader2 } from "lucide-react";
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
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [saving, setSaving]   = useState(false);
  const [lignes, setLignes]   = useState<LigneForm[]>([ligneVide(1), ligneVide(2)]);

  const totalDebit  = lignes.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredit = lignes.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const equilibre   = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const updateLigne = (id: number, patch: Partial<LigneForm>) =>
    setLignes((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // F3 — Autocomplétion plan comptable SYSCOHADA
  const handleCompteChange = (id: number, val: string) => {
    const suggestions = rechercherComptes(val, 8).map((c) => ({
      code: c.code,
      intitule: c.intitule,
    }));
    updateLigne(id, { compte: val, intitule: suggestions[0]?.intitule ?? "", suggestions });
  };

  const selectSuggestion = (id: number, code: string, intitule: string) =>
    updateLigne(id, { compte: code, intitule, suggestions: [] });

  const addLigne = () => setLignes((prev) => [...prev, ligneVide(Date.now())]);

  const removeLigne = (id: number) => {
    if (lignes.length <= 2) return;
    setLignes((prev) => prev.filter((l) => l.id !== id));
  };

  // F6 — Validation avec erreurs granulaires
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!date)           errs.date    = "Date obligatoire";
    if (!libelle.trim()) errs.libelle = "Libellé obligatoire";
    if (!equilibre) {
      if (totalDebit === 0 && totalCredit === 0)
        errs.global = "Saisissez au moins 2 lignes avec montants";
      else
        errs.global = `Écriture déséquilibrée — écart : ${Math.abs(totalDebit - totalCredit).toLocaleString("fr-FR")} FCFA`;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // F7 — Spinner + async save
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 300));
    setSaving(false);

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

    if (lignesValides.length < 2 || !isEcritureEquilibree(lignesValides)) {
      setErrors({ global: "Écriture déséquilibrée — vérifiez les lignes" });
      return;
    }

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
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Journal *</Label>
          <Select value={journal} onValueChange={(v) => setJournal(v as CodeJournal)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(JOURNAL_LABELS) as [CodeJournal, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>{k} — {v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Date *</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setErrors((p) => ({ ...p, date: "" })); }}
            className={errors.date ? "border-destructive" : ""}
          />
          {errors.date && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="size-3" /> {errors.date}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">N° Pièce (auto)</Label>
          <Input
            value={genererNumeroPiece(journal, annee, sequenceEcritures + 1)}
            readOnly
            className="bg-muted/40 font-mono text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Libellé *</Label>
        <Input
          value={libelle}
          onChange={(e) => { setLibelle(e.target.value); setErrors((p) => ({ ...p, libelle: "" })); }}
          placeholder="Description de l'opération"
          className={errors.libelle ? "border-destructive" : ""}
        />
        {errors.libelle && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="size-3" /> {errors.libelle}
          </p>
        )}
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
                {/* T2 — Headers débit bleu / crédit vert */}
                <th className="text-right p-2 font-semibold w-28 text-blue-700 dark:text-blue-400">Débit</th>
                <th className="text-right p-2 font-semibold w-28 text-emerald-700 dark:text-emerald-400">Crédit</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, idx) => (
                <tr key={l.id} className={`border-t ${idx % 2 === 0 ? "bg-background" : "bg-muted/10"}`}>
                  {/* F3 — Compte avec autocomplétion SYSCOHADA */}
                  <td className="p-1 relative">
                    <Input
                      value={l.compte}
                      onChange={(e) => handleCompteChange(l.id, e.target.value)}
                      className="font-mono h-8 text-sm"
                      placeholder="ex: 701"
                    />
                    {l.suggestions.length > 0 && (
                      <div className="absolute z-20 top-full left-0 w-80 bg-popover border-2 border-primary/20 rounded-md shadow-lg max-h-52 overflow-y-auto">
                        {/* F3 — En-tête dropdown */}
                        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/50 border-b">
                          Plan comptable SYSCOHADA
                        </div>
                        {l.suggestions.map((s) => (
                          <button
                            key={s.code}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex gap-2 items-center"
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
                  {/* T2 — Débit en bleu */}
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
                      className="h-8 text-sm text-right font-mono text-blue-700 dark:text-blue-400"
                      placeholder="0"
                    />
                  </td>
                  {/* T2 — Crédit en vert */}
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
                      className="h-8 text-sm text-right font-mono text-emerald-700 dark:text-emerald-400"
                      placeholder="0"
                    />
                  </td>
                  {/* Supprimer */}
                  <td className="p-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive hover:bg-destructive/10"
                      onClick={() => removeLigne(l.id)}
                      disabled={lignes.length <= 2}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}

              {/* T4 — Totaux avec séparation forte */}
              <tr className="bg-muted/60 font-bold border-t-4 border-foreground/20">
                <td colSpan={3} className="p-2 text-sm uppercase tracking-wide">TOTAUX</td>
                <td className={`p-2 text-right text-sm tabular-nums font-mono ${
                  !equilibre && totalDebit > 0 ? "text-destructive" : "text-blue-700 dark:text-blue-400"
                }`}>
                  {totalDebit.toLocaleString("fr-FR")}
                </td>
                <td className={`p-2 text-right text-sm tabular-nums font-mono ${
                  !equilibre && totalCredit > 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
                }`}>
                  {totalCredit.toLocaleString("fr-FR")}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={addLigne} className="gap-1.5">
          <Plus className="size-4" /> Ajouter une ligne
        </Button>
        {/* Badge équilibre */}
        <div className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
          equilibre
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200"
            : totalDebit === 0 && totalCredit === 0
              ? "bg-muted text-muted-foreground border-border"
              : "bg-destructive/15 text-destructive border-destructive/30"
        }`}>
          {equilibre ? (
            <><Check className="size-3" /> Écriture équilibrée</>
          ) : totalDebit === 0 && totalCredit === 0 ? (
            "Saisir les montants"
          ) : (
            `Écart : ${Math.abs(totalDebit - totalCredit).toLocaleString("fr-FR")} FCFA`
          )}
        </div>
      </div>

      {/* F6 — Erreur globale inline */}
      {errors.global && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="size-4 shrink-0" /> {errors.global}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        {/* F7 — Bouton avec spinner */}
        <Button onClick={handleSave} disabled={saving || !libelle.trim()}>
          {saving ? (
            <><Loader2 className="size-4 mr-1.5 animate-spin" /> Enregistrement…</>
          ) : (
            <><Check className="size-4 mr-1.5" /> Enregistrer</>
          )}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Annuler
        </Button>
      </div>
    </div>
  );
};
