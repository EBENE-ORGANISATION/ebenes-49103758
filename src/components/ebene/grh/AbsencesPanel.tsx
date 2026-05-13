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
import { Trans, useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [employeId, setEmployeId] = useState<string>("");
  const [type, setType] = useState<TypeAbsence>("conges_payes");
  const [debut, setDebut] = useState(new Date().toISOString().split("T")[0]);
  const [fin, setFin] = useState(new Date().toISOString().split("T")[0]);
  const [motif, setMotif] = useState("");
  const [motifLegal, setMotifLegal] = useState<string>("");

  // Motifs légaux (CCIT Art. 45) avec nombre de jours légaux (null = pas de remplissage auto)
  const MOTIFS_LEGAUX: { value: string; label: string; jours: number | null }[] = [
    { value: "conge_paye",          label: "Congé payé (2,5 j/mois — Code Art. 200)",           jours: null },
    { value: "deces_conjoint",      label: "Décès conjoint / ascendant / descendant direct",     jours: 4 },
    { value: "deces_beau_parent",   label: "Décès beau-père / belle-mère",                       jours: 3 },
    { value: "deces_frere_soeur",   label: "Décès frère / sœur",                                 jours: 2 },
    { value: "mariage_travailleur", label: "Mariage du travailleur",                              jours: 3 },
    { value: "mariage_enfant",      label: "Mariage enfant / frère / sœur",                      jours: 1 },
    { value: "naissance",           label: "Naissance au foyer",                                 jours: 2 },
    { value: "bapteme",             label: "Baptême",                                             jours: 1 },
    { value: "demenagement",        label: "Déménagement",                                       jours: 1 },
    { value: "maladie",             label: "Maladie (certificat médical requis)",                 jours: null },
    { value: "accident_travail",    label: "Accident du travail",                                 jours: null },
    { value: "maternite",           label: "Maternité (14 semaines — Code Art. 190)",             jours: null },
    { value: "conge_syndical",      label: "Congé syndical",                                     jours: null },
    { value: "autre",               label: "Autre",                                               jours: null },
  ];

  const calcJours = (d1: string, d2: string) => {
    const a = new Date(d1);
    const b = new Date(d2);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
    return Math.max(1, Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000)) + 1);
  };

  const handleMotifLegalChange = (val: string) => {
    setMotifLegal(val);
    const found = MOTIFS_LEGAUX.find((m) => m.value === val);
    if (found && found.jours !== null) {
      // Remplir automatiquement la date de fin selon le nombre de jours légaux
      const debutDate = new Date(debut);
      if (!isNaN(debutDate.getTime())) {
        const finDate = new Date(debutDate);
        finDate.setDate(finDate.getDate() + found.jours - 1);
        setFin(finDate.toISOString().split("T")[0]);
      }
    }
  };

  const submit = () => {
    if (!employeId) return alert(t("grh_absences.err_employee"));
    const eid = parseInt(employeId, 10);
    const jours = calcJours(debut, fin);
    const motifFinal = motifLegal
      ? `[${MOTIFS_LEGAUX.find((m) => m.value === motifLegal)?.label ?? motifLegal}]${motif ? " — " + motif : ""}`
      : motif;
    onAdd({ employeId: eid, type, dateDebut: debut, dateFin: fin, jours, motif: motifFinal });
    setMotif("");
    setMotifLegal("");
    setOpen(false);
  };

  const empName = (id: number) => employes.find((e) => e.id === id)?.nom || "?";

  return (
    <div className="space-y-4">
      {!open ? (
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="size-4" /> {t("grh_absences.new_btn")}
        </Button>
      ) : (
        <div className="bg-muted/40 border-2 border-border rounded-xl p-4 space-y-3">
          <h4 className="font-bold">{t("grh_absences.new_title")}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold uppercase">{t("grh_absences.employee")}</Label>
              <Select value={employeId} onValueChange={setEmployeId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t("grh_absences.employee_ph")} /></SelectTrigger>
                <SelectContent>
                  {employes.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">{t("grh_absences.type")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as TypeAbsence)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_ABSENCE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.jours !== null
                        ? t("grh_absences.type_with_days", { label: t(`type_absence.${k}`, { defaultValue: v.label }), j: v.jours })
                        : t(`type_absence.${k}`, { defaultValue: v.label })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">{t("grh_absences.date_start")}</Label>
              <Input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">{t("grh_absences.date_end")}</Label>
              <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs font-bold uppercase">Motif légal (optionnel)</Label>
              <Select value={motifLegal} onValueChange={handleMotifLegalChange}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="— Sélectionner un motif légal —" />
                </SelectTrigger>
                <SelectContent>
                  {MOTIFS_LEGAUX.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}{m.jours !== null ? ` (${m.jours} j)` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1 italic">
                Permissions exceptionnelles non déductibles du congé annuel et sans réduction de salaire (CCIT Art. 45),
                sous réserve de 6 mois d'ancienneté.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs font-bold uppercase">{t("grh_absences.motif")}</Label>
              <Input value={motif} onChange={(e) => setMotif(e.target.value)} className="mt-1" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            <Trans i18nKey="grh_absences.duration" values={{ n: calcJours(debut, fin) }} components={[<span key="0" />, <strong key="1" />]} />
          </p>
          <div className="flex gap-2">
            <Button onClick={submit} className="bg-success text-success-foreground hover:bg-success/90">
              {t("grh_absences.save")}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}><X className="size-4" /></Button>
          </div>
        </div>
      )}

      {absences.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 italic">{t("grh_absences.empty")}</p>
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
                    {t(`type_absence.${a.type}`, { defaultValue: TYPE_ABSENCE_LABELS[a.type]?.label ?? a.type })} • {a.dateDebut} → {a.dateFin} • {formatJours(a.jours)}
                  </p>
                  {a.motif && <p className="text-xs italic mt-0.5">{a.motif}</p>}
                  {statut === "rejete" && a.motifRejet && (
                    <p className="text-xs text-destructive mt-1 italic">
                      {t("grh_absences.reject_label", { val: a.motifRejet })}
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
                      title={t("grh_absences.validate")}
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
                        const motif = window.prompt(t("grh_absences.prompt_reject"), "");
                        if (motif && motif.trim()) onRejeter(a.id, motif.trim());
                      }}
                      title={t("grh_absences.reject")}
                    >
                      <XCircle className="size-4" />
                    </Button>
                  )}
                  {isChefGrh && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive hover:bg-destructive/10"
                      onClick={() => onRemove(a.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};