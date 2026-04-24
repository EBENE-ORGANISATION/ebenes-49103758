import { useState, useEffect } from "react";
import { Employe, CATEGORIES_LABELS, CategorieProf, TypeContrat } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";

interface Props {
  initial?: Employe;
  onSubmit: (data: Omit<Employe, "id">) => void;
  onCancel: () => void;
}

export const EmployeForm = ({ initial, onSubmit, onCancel }: Props) => {
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
    categorie: "1",
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
    if (!form.nom.trim()) return alert("Nom obligatoire");
    if (!form.poste.trim()) return alert("Poste obligatoire");
    if (!form.salaire || form.salaire <= 0) return alert("Salaire invalide");
    onSubmit(form);
  };

  return (
    <div className="bg-muted/40 border-2 border-border rounded-xl p-5 space-y-4">
      <h3 className="font-bold text-lg">{initial ? "Modifier l'employé" : "Nouvel employé"}</h3>

      <div>
        <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Identité</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nom complet *">
            <Input value={form.nom} onChange={(e) => update("nom", e.target.value)} />
          </Field>
          <Field label="Matricule">
            <Input value={form.matricule || ""} onChange={(e) => update("matricule", e.target.value)} />
          </Field>
          <Field label="Sexe">
            <Select value={form.sexe || "M"} onValueChange={(v) => update("sexe", v as "M" | "F")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="M">Masculin</SelectItem>
                <SelectItem value="F">Féminin</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date de naissance">
            <Input type="date" value={form.dateNaissance || ""} onChange={(e) => update("dateNaissance", e.target.value)} />
          </Field>
          <Field label="Lieu de naissance">
            <Input value={form.lieuNaissance || ""} onChange={(e) => update("lieuNaissance", e.target.value)} />
          </Field>
          <Field label="Nationalité">
            <Input value={form.nationalite || ""} onChange={(e) => update("nationalite", e.target.value)} />
          </Field>
          <Field label="N° CNI / Passeport">
            <Input value={form.cni || ""} onChange={(e) => update("cni", e.target.value)} />
          </Field>
          <Field label="N° CNSS">
            <Input value={form.numCnss || ""} onChange={(e) => update("numCnss", e.target.value)} />
          </Field>
          <Field label="Téléphone">
            <Input value={form.telephone || ""} onChange={(e) => update("telephone", e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email || ""} onChange={(e) => update("email", e.target.value)} />
          </Field>
          <Field label="Adresse" full>
            <Input value={form.adresse || ""} onChange={(e) => update("adresse", e.target.value)} />
          </Field>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Contrat & poste</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Poste *">
            <Input value={form.poste} onChange={(e) => update("poste", e.target.value)} />
          </Field>
          <Field label="Qualification">
            <Input value={form.qualification || ""} onChange={(e) => update("qualification", e.target.value)} />
          </Field>
          <Field label="Type de contrat">
            <Select value={form.typeContrat || "cdi"} onValueChange={(v) => update("typeContrat", v as TypeContrat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="essai">Période d'essai</SelectItem>
                <SelectItem value="cdd">CDD</SelectItem>
                <SelectItem value="cdi">CDI</SelectItem>
                <SelectItem value="stage">Stage</SelectItem>
                <SelectItem value="interim">Intérim</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Catégorie professionnelle">
            <Select value={form.categorie || "1"} onValueChange={(v) => update("categorie", v as CategorieProf)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORIES_LABELS).map(([k, lbl]) => (
                  <SelectItem key={k} value={k}>{lbl}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Échelon">
            <Input type="number" min={1} max={10} value={form.echelon || 1} onChange={(e) => update("echelon", parseInt(e.target.value, 10) || 1)} />
          </Field>
          <Field label="Date d'embauche">
            <Input type="date" value={form.dateEmbauche || ""} onChange={(e) => update("dateEmbauche", e.target.value)} />
          </Field>
          {form.typeContrat === "cdd" && (
            <Field label="Date fin de contrat">
              <Input type="date" value={form.dateFinContrat || ""} onChange={(e) => update("dateFinContrat", e.target.value)} />
            </Field>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Rémunération (FCFA)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Salaire de base *">
            <Input type="number" value={form.salaire || ""} onChange={(e) => update("salaire", parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label="Sursalaire">
            <Input type="number" value={form.sursalaire || 0} onChange={(e) => update("sursalaire", parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label="Indemnité transport">
            <Input type="number" value={form.indemniteTransport || 0} onChange={(e) => update("indemniteTransport", parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label="Indemnité logement">
            <Input type="number" value={form.indemniteLogement || 0} onChange={(e) => update("indemniteLogement", parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label="Indemnité fonction">
            <Input type="number" value={form.indemniteFonction || 0} onChange={(e) => update("indemniteFonction", parseFloat(e.target.value) || 0)} />
          </Field>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Situation familiale</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Situation">
            <Select value={form.situation} onValueChange={(v) => update("situation", v as "celibataire" | "marie")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="celibataire">Célibataire</SelectItem>
                <SelectItem value="marie">Marié(e)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Enfants à charge">
            <Input type="number" min={0} value={form.enfants} onChange={(e) => update("enfants", parseInt(e.target.value, 10) || 0)} />
          </Field>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={submit} className="bg-success text-success-foreground hover:bg-success/90">
          ✓ Enregistrer
        </Button>
        <Button variant="outline" onClick={onCancel} className="gap-1.5">
          <X className="size-4" /> Annuler
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