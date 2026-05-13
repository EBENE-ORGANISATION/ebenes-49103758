import { useState, useEffect } from "react";
import { Employe, CATEGORIES_LABELS, CategorieProf, TypeContrat } from "@/types/ebene";
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
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  initial?: Employe;
  onSubmit: (data: Omit<Employe, "id">) => void;
  onCancel: () => void;
}

export const EmployeForm = ({ initial, onSubmit, onCancel }: Props) => {
  const { t } = useTranslation();
  const [form, setForm] = useState<Omit<Employe, "id">>({
    nom: "",
    poste: "",
    salaire: 0,
    situation: "celibataire",
    enfants: 0,
    matricule: "",
    sexe: "M",
    nationalite: "Togolaise",
    typeContrat: "cdi",
    dateEmbauche: new Date().toISOString().split("T")[0],
    categorie: "E1",
    echelon: 1,
    indemniteTransport: 0,
    indemniteLogement: 0,
    indemniteFonction: 0,
    sursalaire: 0,
    soldeConges: 0,
  });

  useEffect(() => {
    if (initial) {
      const { id: _id, ...rest } = initial;
      setForm((f) => ({ ...f, ...rest }));
    }
  }, [initial]);

  const update = <K extends keyof Omit<Employe, "id">>(k: K, v: Omit<Employe, "id">[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const submit = () => {
    if (!form.nom.trim()) return alert(t("grh_form.err_name"));
    if (!form.poste.trim()) return alert(t("grh_form.err_job"));
    if (!form.salaire || form.salaire <= 0) return alert(t("grh_form.err_salary"));
    onSubmit(form);
  };

  return (
    <div className="bg-muted/40 border-2 border-border rounded-xl p-5 space-y-4">
      <h3 className="font-bold text-lg">{initial ? t("grh_form.title_edit") : t("grh_form.title_new")}</h3>

      <div>
        <p className="text-xs font-bold uppercase text-muted-foreground mb-2">{t("grh_form.section_identity")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t("grh_form.full_name")}>
            <Input value={form.nom} onChange={(e) => update("nom", e.target.value)} />
          </Field>
          <Field label={t("grh_form.matricule")}>
            <Input
              value={form.matricule || ""}
              onChange={(e) => update("matricule", e.target.value)}
              placeholder={initial ? "" : t("grh_form.matricule_ph")}
            />
          </Field>
          <Field label={t("grh_form.sex")}>
            <Select value={form.sexe || "M"} onValueChange={(v) => update("sexe", v as "M" | "F")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="M">{t("grh_form.male")}</SelectItem>
                <SelectItem value="F">{t("grh_form.female")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("grh_form.birth_date")}>
            <Input type="date" value={form.dateNaissance || ""} onChange={(e) => update("dateNaissance", e.target.value)} />
          </Field>
          <Field label={t("grh_form.birth_place")}>
            <Input value={form.lieuNaissance || ""} onChange={(e) => update("lieuNaissance", e.target.value)} />
          </Field>
          <Field label={t("grh_form.nationality")}>
            <Input value={form.nationalite || ""} onChange={(e) => update("nationalite", e.target.value)} />
          </Field>
          <Field label={t("grh_form.cni")}>
            <Input value={form.cni || ""} onChange={(e) => update("cni", e.target.value)} />
          </Field>
          <Field label={t("grh_form.cnss")}>
            <Input value={form.numCnss || ""} onChange={(e) => update("numCnss", e.target.value)} />
          </Field>
          <Field label={t("grh_form.phone")}>
            <Input value={form.telephone || ""} onChange={(e) => update("telephone", e.target.value)} />
          </Field>
          <Field label={t("grh_form.email")}>
            <Input type="email" value={form.email || ""} onChange={(e) => update("email", e.target.value)} />
          </Field>
          <Field label={t("grh_form.address")} full>
            <Input value={form.adresse || ""} onChange={(e) => update("adresse", e.target.value)} />
          </Field>
          <Field label={t("grh_form.user_uuid")} full>
            <Input
              value={form.userId || ""}
              onChange={(e) => update("userId", e.target.value || undefined)}
              placeholder={t("grh_form.user_uuid_ph")}
            />
          </Field>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase text-muted-foreground mb-2">{t("grh_form.section_contract")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t("grh_form.job")}>
            <Input value={form.poste} onChange={(e) => update("poste", e.target.value)} />
          </Field>
          <Field label={t("grh_form.qualification")}>
            <Input value={form.qualification || ""} onChange={(e) => update("qualification", e.target.value)} />
          </Field>
          <Field label={t("grh_form.contract_type")}>
            <Select value={form.typeContrat || "cdi"} onValueChange={(v) => update("typeContrat", v as TypeContrat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="essai">{t("grh_form.contract_essai")}</SelectItem>
                <SelectItem value="cdd">{t("grh_form.contract_cdd")}</SelectItem>
                <SelectItem value="cdi">{t("grh_form.contract_cdi")}</SelectItem>
                <SelectItem value="stage">{t("grh_form.contract_stage")}</SelectItem>
                <SelectItem value="interim">{t("grh_form.contract_interim")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("grh_form.category")}>
            <Select value={form.categorie || "E1"} onValueChange={(v) => update("categorie", v as CategorieProf)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORIES_LABELS).map(([k, lbl]) => (
                  <SelectItem key={k} value={k}>{lbl}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("grh_form.echelon")}>
            <Input type="number" min={1} max={10} value={form.echelon || 1} onChange={(e) => update("echelon", parseInt(e.target.value, 10) || 1)} />
          </Field>
          <Field label={t("grh_form.hire_date")}>
            <Input type="date" value={form.dateEmbauche || ""} onChange={(e) => update("dateEmbauche", e.target.value)} />
          </Field>
          {form.typeContrat === "cdd" && (
            <Field label={t("grh_form.end_date")}>
              <Input type="date" value={form.dateFinContrat || ""} onChange={(e) => update("dateFinContrat", e.target.value)} />
            </Field>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase text-muted-foreground mb-2">{t("grh_form.section_pay")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label={t("grh_form.base_salary")}>
            <Input type="number" value={form.salaire || ""} onChange={(e) => update("salaire", parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label={t("grh_form.sursalaire")}>
            <Input type="number" value={form.sursalaire || 0} onChange={(e) => update("sursalaire", parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label={t("grh_form.indem_transport")}>
            <Input type="number" value={form.indemniteTransport || 0} onChange={(e) => update("indemniteTransport", parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label={t("grh_form.indem_logement")}>
            <Input type="number" value={form.indemniteLogement || 0} onChange={(e) => update("indemniteLogement", parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label={t("grh_form.indem_fonction")}>
            <Input type="number" value={form.indemniteFonction || 0} onChange={(e) => update("indemniteFonction", parseFloat(e.target.value) || 0)} />
          </Field>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase text-muted-foreground mb-2">{t("grh_form.section_family")}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("grh_form.situation")}>
            <Select value={form.situation} onValueChange={(v) => update("situation", v as "celibataire" | "marie")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="celibataire">{t("grh_form.sit_celibataire")}</SelectItem>
                <SelectItem value="marie">{t("grh_form.sit_marie")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("grh_form.children")}>
            <Input type="number" min={0} value={form.enfants} onChange={(e) => update("enfants", parseInt(e.target.value, 10) || 0)} />
          </Field>
        </div>
      </div>

      {/* ── Déductions fiscales IRPP (optionnel) ─────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase text-muted-foreground mb-1">
          Déductions fiscales IRPP (optionnel)
        </p>
        <p className="text-xs text-muted-foreground mb-2">
          À renseigner si l'employé bénéficie de ces déductions selon le CGI togolais.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="VI — Intérêt prêt immobilier (F/mois)">
            <Input
              type="number" min={0}
              value={form.interetPretImmobilier ?? 0}
              onChange={(e) => update("interetPretImmobilier", parseFloat(e.target.value) || 0)}
              placeholder="0"
            />
          </Field>
          <Field label="VII — Assurance-vie (F/mois)">
            <Input
              type="number" min={0}
              value={form.assuranceVie ?? 0}
              onChange={(e) => update("assuranceVie", parseFloat(e.target.value) || 0)}
              placeholder="0"
            />
          </Field>
          <Field label="VIII — Retraite complémentaire (F/mois)">
            <Input
              type="number" min={0}
              value={form.retraiteComplementaire ?? 0}
              onChange={(e) => update("retraiteComplementaire", parseFloat(e.target.value) || 0)}
              placeholder="0"
            />
          </Field>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={submit} className="bg-success text-success-foreground hover:bg-success/90">
          {t("grh_form.save")}
        </Button>
        <Button variant="outline" onClick={onCancel} className="gap-1.5">
          <X className="size-4" /> {t("grh_form.cancel")}
        </Button>
      </div>
    </div>
  );
};

const Field = ({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) => (
  <div className={full ? "sm:col-span-2" : ""}>
    <Label className="text-xs font-bold uppercase text-muted-foreground">{label}</Label>
    <div className="mt-1">{children}</div>
  </div>
);