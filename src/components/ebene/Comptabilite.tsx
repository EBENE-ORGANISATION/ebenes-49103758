import { useMemo, useState } from "react";
import { MoisData, Transaction } from "@/types/ebene";
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
import { Plus, Trash2, X } from "lucide-react";
import { StatCard } from "./StatCard";
import { formatMontant, formatMontantSigne, todayISO } from "@/lib/ebene-utils";

interface Props {
  data: MoisData;
  onAdd: (t: Omit<Transaction, "id">) => void;
  onRemove: (id: number) => void;
}

export const Comptabilite = ({ data, onAdd, onRemove }: Props) => {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState<"r" | "d">("r");
  const [desc, setDesc] = useState("");
  const [montant, setMontant] = useState("");

  const totals = useMemo(() => {
    const rec = data.transactions.filter((t) => t.type === "r").reduce((a, t) => a + t.m, 0);
    const recFact = data.transactions
      .filter((t) => t.type === "r" && t.source === "facture")
      .reduce((a, t) => a + t.m, 0);
    const dep = Math.abs(
      data.transactions.filter((t) => t.type === "d").reduce((a, t) => a + t.m, 0)
    );
    return { rec, recFact, dep, solde: rec - dep };
  }, [data.transactions]);

  const sorted = useMemo(
    () =>
      [...data.transactions].sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [data.transactions]
  );

  const submit = () => {
    const m = parseFloat(montant);
    if (!desc.trim()) return alert("La description est obligatoire.");
    if (isNaN(m) || m <= 0) return alert("Montant invalide.");
    if (!date) return alert("Date obligatoire.");
    onAdd({
      date,
      desc: desc.trim(),
      type,
      m: type === "d" ? -m : m,
      source: "manuelle",
    });
    setDesc("");
    setMontant("");
    setOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Recettes (Mois)"
          value={formatMontant(totals.rec)}
          tone="success"
          hint={`Dont factures : ${formatMontant(totals.recFact)}`}
        />
        <StatCard label="Dépenses (Mois)" value={formatMontant(totals.dep)} tone="destructive" />
        <StatCard
          label="Solde (Mois)"
          value={formatMontantSigne(totals.solde)}
          tone={totals.solde >= 0 ? "info" : "destructive"}
        />
      </div>

      {!open ? (
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="size-4" /> Ajouter Transaction
        </Button>
      ) : (
        <div className="bg-muted/40 border-2 border-border rounded-xl p-5 space-y-4">
          <h3 className="font-bold text-lg">Nouvelle Transaction</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Date *
              </Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Type *
              </Label>
              <Select value={type} onValueChange={(v) => setType(v as "r" | "d")}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="r">💚 Recette</SelectItem>
                  <SelectItem value="d">❤️ Dépense</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Description *
            </Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Montant (FCFA) *
            </Label>
            <Input
              type="number"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={submit} className="bg-success text-success-foreground hover:bg-success/90">
              ✓ Enregistrer
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} className="gap-1.5">
              <X className="size-4" /> Annuler
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 italic">
            Aucune transaction pour ce mois
          </p>
        ) : (
          sorted.map((t) => (
            <div
              key={t.id}
              className={`list-item flex items-center justify-between gap-3 ${
                t.source === "facture" ? "border-l-4 border-l-info" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold truncate">{t.desc}</p>
                  {t.source === "facture" && (
                    <span className="badge-soft bg-info/15 text-info">Facture</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t.date} • {t.type === "r" ? "Recette" : "Dépense"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`amount text-sm sm:text-base ${
                    t.m >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {t.m >= 0 ? "+" : "-"} {Math.abs(t.m).toLocaleString("fr-FR")} F
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (
                      t.source === "facture" && t.factureId
                        ? confirm(
                            "Cette transaction est liée à une facture payée. La supprimer remettra la facture en attente. Confirmer ?"
                          )
                        : confirm("Supprimer cette transaction ?")
                    ) {
                      onRemove(t.id);
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};