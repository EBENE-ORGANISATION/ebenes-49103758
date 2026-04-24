import { useMemo, useState } from "react";
import { Employe, Sanction, TypeSanction, TYPE_SANCTION_LABELS } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, X, AlertTriangle, ShieldAlert } from "lucide-react";
import { todayISO } from "@/lib/ebene-utils";

interface Props {
  employes: Employe[];
  sanctions: Sanction[];
  onAdd: (s: Omit<Sanction, "id">) => void;
  onRemove: (id: number) => void;
}

export const DisciplinePanel = ({ employes, sanctions, onAdd, onRemove }: Props) => {
  const [showForm, setShowForm] = useState(false);
  const [employeId, setEmployeId] = useState<string>("");
  const [type, setType] = useState<TypeSanction>("avertissement_oral");
  const [date, setDate] = useState<string>(todayISO());
  const [motif, setMotif] = useState("");
  const [jours, setJours] = useState("");
  const [obs, setObs] = useState("");

  const reset = () => {
    setEmployeId("");
    setType("avertissement_oral");
    setDate(todayISO());
    setMotif("");
    setJours("");
    setObs("");
    setShowForm(false);
  };

  const submit = () => {
    const eid = parseInt(employeId, 10);
    if (!eid) return alert("Sélectionnez un employé");
    if (!motif.trim()) return alert("Le motif est obligatoire");
    const payload: Omit<Sanction, "id"> = {
      employeId: eid,
      date,
      type,
      motif: motif.trim(),
      observations: obs.trim() || undefined,
    };
    if (type === "mise_a_pied") {
      const j = parseInt(jours, 10);
      if (isNaN(j) || j <= 0) return alert("Indiquez le nombre de jours de mise à pied");
      payload.joursMiseAPied = j;
    }
    onAdd(payload);
    reset();
  };

  const getEmploye = (id: number) => employes.find((e) => e.id === id);

  const sortedSanctions = useMemo(
    () => [...sanctions].sort((a, b) => b.date.localeCompare(a.date)),
    [sanctions]
  );

  return (
    <div className="space-y-4">
      <div className="card-elevated p-4 bg-warning/5 border-l-4 border-l-warning">
        <p className="text-sm flex items-start gap-2">
          <ShieldAlert className="size-4 text-warning shrink-0 mt-0.5" />
          <span>
            Échelle des sanctions selon le <strong>Code du travail togolais</strong> et la
            convention interprofessionnelle : avertissement oral → écrit → blâme → mise à pied →
            licenciement (faute simple, grave ou lourde).
          </span>
        </p>
      </div>

      {showForm ? (
        <div className="card-elevated p-5 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" /> Enregistrer une sanction
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Employé *</Label>
              <Select value={employeId} onValueChange={setEmployeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un employé" />
                </SelectTrigger>
                <SelectContent>
                  {employes.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.nom} {e.matricule ? `(${e.matricule})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Type de sanction *</Label>
              <Select value={type} onValueChange={(v) => setType(v as TypeSanction)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_SANCTION_LABELS).map(([k, lbl]) => (
                    <SelectItem key={k} value={k}>
                      {lbl}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {type === "mise_a_pied" && (
              <div>
                <Label>Nombre de jours *</Label>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={jours}
                  onChange={(e) => setJours(e.target.value)}
                  placeholder="Max 8 jours (Code du travail)"
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <Label>Motif *</Label>
              <Textarea
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Faits reprochés, dates, contexte..."
                rows={2}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Observations</Label>
              <Textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Réponse de l'employé, mesures complémentaires..."
                rows={2}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={reset}>
              <X className="size-4" /> Annuler
            </Button>
            <Button onClick={submit}>✓ Enregistrer</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setShowForm(true)} className="gap-1.5">
          <Plus className="size-4" /> Nouvelle sanction
        </Button>
      )}

      {sortedSanctions.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 italic">
          Aucune sanction enregistrée
        </p>
      ) : (
        <div className="space-y-2">
          {sortedSanctions.map((s) => {
            const emp = getEmploye(s.employeId);
            const grave =
              s.type === "licenciement_faute_grave" ||
              s.type === "licenciement_faute_lourde";
            return (
              <div
                key={s.id}
                className={`list-item border-l-4 ${
                  grave
                    ? "border-l-destructive"
                    : s.type.startsWith("licenciement")
                    ? "border-l-warning"
                    : "border-l-info"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">
                      {emp ? `${emp.nom}${emp.matricule ? ` (${emp.matricule})` : ""}` : "Employé supprimé"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.date} • <strong>{TYPE_SANCTION_LABELS[s.type]}</strong>
                      {s.joursMiseAPied ? ` (${s.joursMiseAPied} j)` : ""}
                    </p>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{s.motif}</p>
                    {s.observations && (
                      <p className="text-xs italic text-muted-foreground mt-1">
                        Obs : {s.observations}
                      </p>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => {
                      if (confirm("Supprimer cette sanction ?")) onRemove(s.id);
                    }}
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
