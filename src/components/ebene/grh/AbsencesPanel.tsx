import { useState } from "react";
import { Absence, Employe, TypeAbsence, TYPE_ABSENCE_LABELS } from "@/types/ebene";
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
import { formatJours } from "@/lib/ebene-utils";

interface Props {
  employes: Employe[];
  absences: Absence[];
  onAdd: (a: Omit<Absence, "id">) => void;
  onRemove: (id: number) => void;
}

export const AbsencesPanel = ({ employes, absences, onAdd, onRemove }: Props) => {
  const [open, setOpen] = useState(false);
  const [employeId, setEmployeId] = useState<string>("");
  const [type, setType] = useState<TypeAbsence>("conges_payes");
  const [debut, setDebut] = useState(new Date().toISOString().split("T")[0]);
  const [fin, setFin] = useState(new Date().toISOString().split("T")[0]);
  const [motif, setMotif] = useState("");

  const calcJours = (d1: string, d2: string) => {
    const a = new Date(d1);
    const b = new Date(d2);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
    return Math.max(1, Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000)) + 1);
  };

  const submit = () => {
    if (!employeId) return alert("Sélectionnez un employé");
    const eid = parseInt(employeId, 10);
    const jours = calcJours(debut, fin);
    onAdd({ employeId: eid, type, dateDebut: debut, dateFin: fin, jours, motif });
    setMotif("");
    setOpen(false);
  };

  const empName = (id: number) => employes.find((e) => e.id === id)?.nom || "?";

  return (
    <div className="space-y-4">
      {!open ? (
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="size-4" /> Saisir une absence
        </Button>
      ) : (
        <div className="bg-muted/40 border-2 border-border rounded-xl p-4 space-y-3">
          <h4 className="font-bold">Nouvelle absence</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold uppercase">Employé *</Label>
              <Select value={employeId} onValueChange={setEmployeId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>
                  {employes.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Type *</Label>
              <Select value={type} onValueChange={(v) => setType(v as TypeAbsence)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_ABSENCE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}{v.jours !== null ? ` (${v.jours}j)` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Date début</Label>
              <Input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Date fin</Label>
              <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs font-bold uppercase">Motif / Justificatif</Label>
              <Input value={motif} onChange={(e) => setMotif(e.target.value)} className="mt-1" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Durée calculée : <strong>{calcJours(debut, fin)} jour(s)</strong>
          </p>
          <div className="flex gap-2">
            <Button onClick={submit} className="bg-success text-success-foreground hover:bg-success/90">
              ✓ Enregistrer
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}><X className="size-4" /></Button>
          </div>
        </div>
      )}

      {absences.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 italic">Aucune absence ce mois</p>
      ) : (
        <div className="space-y-2">
          {absences.map((a) => (
            <div key={a.id} className="list-item flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">{empName(a.employeId)}</p>
                <p className="text-xs text-muted-foreground">
                  {TYPE_ABSENCE_LABELS[a.type].label} • {a.dateDebut} → {a.dateFin} • {formatJours(a.jours)}
                </p>
                {a.motif && <p className="text-xs italic mt-0.5">{a.motif}</p>}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-destructive hover:bg-destructive/10"
                onClick={() => onRemove(a.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};