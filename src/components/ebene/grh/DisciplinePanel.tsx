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
import { Plus, Trash2, X, AlertTriangle, ShieldAlert, Check, XCircle } from "lucide-react";
import { todayISO } from "@/lib/ebene-utils";
import { StatutValidationBadge } from "./StatutValidationBadge";
import { Trans, useTranslation } from "react-i18next";

interface Props {
  employes: Employe[];
  sanctions: Sanction[];
  onAdd: (s: Omit<Sanction, "id">) => void;
  onRemove: (id: number) => void;
  isChefGrh: boolean;
  onValider: (id: number) => void;
  onRejeter: (id: number, motif: string) => void;
}

export const DisciplinePanel = ({
  employes,
  sanctions,
  onAdd,
  onRemove,
  isChefGrh,
  onValider,
  onRejeter,
}: Props) => {
  const { t } = useTranslation();
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
    if (!eid) return alert(t("grh_discipline.err_employee"));
    if (!motif.trim()) return alert(t("grh_discipline.err_motif"));
    const payload: Omit<Sanction, "id"> = {
      employeId: eid,
      date,
      type,
      motif: motif.trim(),
      observations: obs.trim() || undefined,
    };
    if (type === "mise_a_pied") {
      const j = parseInt(jours, 10);
      if (isNaN(j) || j <= 0) return alert(t("grh_discipline.err_days"));
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
            <Trans i18nKey="grh_discipline.info" components={[<span key="0" />, <strong key="1" />]} />
          </span>
        </p>
      </div>

      {showForm ? (
        <div className="card-elevated p-5 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" /> {t("grh_discipline.record_title")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{t("grh_discipline.employee")}</Label>
              <Select value={employeId} onValueChange={setEmployeId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("grh_discipline.employee_ph")} />
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
              <Label>{t("grh_discipline.date")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("grh_discipline.type")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as TypeSanction)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_SANCTION_LABELS).map(([k, lbl]) => (
                    <SelectItem key={k} value={k}>
                      {t(`type_sanction.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {type === "mise_a_pied" && (
              <div>
                <Label>{t("grh_discipline.days")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={jours}
                  onChange={(e) => setJours(e.target.value)}
                  placeholder={t("grh_discipline.days_ph")}
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <Label>{t("grh_discipline.motif")}</Label>
              <Textarea
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder={t("grh_discipline.motif_ph")}
                rows={2}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("grh_discipline.obs")}</Label>
              <Textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder={t("grh_discipline.obs_ph")}
                rows={2}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={reset}>
              <X className="size-4" /> {t("grh_discipline.cancel")}
            </Button>
            <Button onClick={submit}>{t("grh_discipline.save")}</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setShowForm(true)} className="gap-1.5">
          <Plus className="size-4" /> {t("grh_discipline.new_btn")}
        </Button>
      )}

      {sortedSanctions.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 italic">
          {t("grh_discipline.empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {sortedSanctions.map((s) => {
            const emp = getEmploye(s.employeId);
            const grave =
              s.type === "licenciement_faute_grave" ||
              s.type === "licenciement_faute_lourde";
            const statut = s.statutValidation;
            return (
              <div
                key={s.id}
                className={`list-item border-l-4 ${
                  grave
                    ? "border-l-destructive"
                    : s.type.startsWith("licenciement")
                    ? "border-l-warning"
                    : "border-l-info"
                } ${statut === "brouillon" ? "opacity-50" : ""}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold">
                        {emp ? `${emp.nom}${emp.matricule ? ` (${emp.matricule})` : ""}` : t("grh_discipline.employee_deleted")}
                      </p>
                      <StatutValidationBadge statut={statut} motifRejet={s.motifRejet} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.date} • <strong>{t(`type_sanction.${s.type}`)}</strong>
                      {s.joursMiseAPied ? ` (${t("grh_discipline.days_short", { n: s.joursMiseAPied })})` : ""}
                    </p>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{s.motif}</p>
                    {s.observations && (
                      <p className="text-xs italic text-muted-foreground mt-1">
                        {t("grh_discipline.obs_label", { val: s.observations })}
                      </p>
                    )}
                    {statut === "rejete" && s.motifRejet && (
                      <p className="text-xs text-destructive mt-1 italic">
                        {t("grh_discipline.reject_label", { val: s.motifRejet })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isChefGrh && statut !== "valide" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-success hover:text-success hover:bg-success/10"
                        onClick={() => onValider(s.id)}
                        title={t("grh_discipline.validate")}
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
                          const motif = window.prompt(t("grh_discipline.prompt_reject"), "");
                          if (motif && motif.trim()) onRejeter(s.id, motif.trim());
                        }}
                        title={t("grh_discipline.reject")}
                      >
                        <XCircle className="size-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm(t("grh_discipline.confirm_delete"))) onRemove(s.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
