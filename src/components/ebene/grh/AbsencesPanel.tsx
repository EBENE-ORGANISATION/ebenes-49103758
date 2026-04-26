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
import { Plus, Trash2, X, Check, XCircle } from "lucide-react";
import { formatJours } from "@/lib/ebene-utils";
import { StatutValidationBadge } from "./StatutValidationBadge";

interface Props {
  employes: Employe[];
  absences: Absence[];
  onAdd: (a: Omit<Absence, "id">) => void;
  onRemove: (id: number) => void;
  isChefGrh: boolean;
  onValider: (id: number) => void;
  onRejeter: (id: number, motif: string) => void;
}

export const AbsencesPanel = ({
  employes,
  absences,
  onAdd,
  onRemove,
  isChefGrh,
  onValider,
  onRejeter,
}: Props) => {
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
          {absences.map((a) => {
            const statut = a.statutValidation;
            return (
              <div
                key={a.id}
                className={`list-item flex items-center justify-between ${
                  statut === "brouillon" ? "opacity-50" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{empName(a.employeId)}</p>
                    <StatutValidationBadge statut={statut} motifRejet={a.motifRejet} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_ABSENCE_LABELS[a.type].label} • {a.dateDebut} → {a.dateFin} • {formatJours(a.jours)}
                  </p>
                  {a.motif && <p className="text-xs italic mt-0.5">{a.motif}</p>}
                  {statut === "rejete" && a.motifRejet && (
                    <p className="text-xs text-destructive mt-1 italic">
                      Motif du rejet : {a.motifRejet}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isChefGrh && statut !== "valide" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-success hover:text-success hover:bg-success/10"
                      onClick={() => onValider(a.id)}
                      title="Valider"
                    >
                      <Check className="size-4" />
                    </Button>
                  )}
                  {isChefGrh && statut !== "rejete" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-warning hover:text-warning hover:bg-warning/10"
                      onClick={() => {
                        const motif = window.prompt("Motif du rejet :", "");
                        if (motif && motif.trim()) onRejeter(a.id, motif.trim());
                      }}
                      title="Rejeter"
                    >
                      <XCircle className="size-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-destructive hover:bg-destructive/10"
                    onClick={() => onRemove(a.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};