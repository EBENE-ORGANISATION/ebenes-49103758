import { useState } from "react";
import { Employe, HeuresSup, MoisData } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMontant, tauxHoraire, HS_TAUX } from "@/lib/ebene-utils";
import { Trans, useTranslation } from "react-i18next";

interface Props {
  employe: Employe;
  data: MoisData;
  onSave: (hs: HeuresSup) => void;
}

export const HeuresSupPanel = ({ employe, data, onSave }: Props) => {
  const { t } = useTranslation();
  const current = (data.heuresSup || {})[employe.id] || {
    jourSemaine: 0,
    jourSup: 0,
    dimancheFerie: 0,
    nuitSemaine: 0,
    nuitDimancheFerie: 0,
  };
  const [hs, setHs] = useState<HeuresSup>(current);
  // Texte saisi, conservé tel quel (champ texte, pas « number » : celui-ci
  // renvoie « 10 » pour « 10. » et effacerait la virgule) : on peut taper 10,5 h.
  const [saisie, setSaisie] = useState<Partial<Record<keyof HeuresSup, string>>>({});
  const th = tauxHoraire(employe.salaire, employe.sursalaire || 0);

  const total =
    hs.jourSemaine * th * HS_TAUX.jourSemaine +
    hs.jourSup * th * HS_TAUX.jourSup +
    hs.dimancheFerie * th * HS_TAUX.dimancheFerie +
    hs.nuitSemaine * th * HS_TAUX.nuitSemaine +
    hs.nuitDimancheFerie * th * HS_TAUX.nuitDimancheFerie;

  // Fonction de rendu (et non composant défini ici) : un composant recréé à
  // chaque rendu remonterait l'input et lui ferait perdre le focus à chaque frappe.
  const field = (k: keyof HeuresSup, label: string, taux: number) => (
    <div key={k}>
      <Label className="text-xs font-bold uppercase text-muted-foreground">
        {label} <span className="text-info">×{taux}</span>
      </Label>
      <Input
        type="text"
        inputMode="decimal"
        value={saisie[k] ?? String(hs[k] ?? 0)}
        onChange={(e) => {
          const brut = e.target.value;
          setSaisie((prev) => ({ ...prev, [k]: brut }));
          setHs((prev) => ({ ...prev, [k]: parseFloat(brut.replace(",", ".")) || 0 }));
        }}
        className="mt-1 h-9"
      />
    </div>
  );

  return (
    <div className="bg-muted/40 border border-border rounded-lg p-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        <Trans i18nKey="grh_hs.th_info" values={{ val: formatMontant(th) }} components={[<span key="0" />, <strong key="1" className="amount" />]} />
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {field("jourSemaine", t("grh_hs.jour_semaine"), HS_TAUX.jourSemaine)}
        {field("jourSup", t("grh_hs.jour_sup"), HS_TAUX.jourSup)}
        {field("dimancheFerie", t("grh_hs.dim_ferie"), HS_TAUX.dimancheFerie)}
        {field("nuitSemaine", t("grh_hs.nuit_semaine"), HS_TAUX.nuitSemaine)}
        {field("nuitDimancheFerie", t("grh_hs.nuit_dim_ferie"), HS_TAUX.nuitDimancheFerie)}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-sm">
          <Trans i18nKey="grh_hs.total" values={{ val: formatMontant(total) }} components={[<span key="0" />, <strong key="1" className="amount" />]} />
        </span>
        <Button size="sm" onClick={() => onSave(hs)} className="bg-success text-success-foreground hover:bg-success/90">
          {t("grh_hs.save")}
        </Button>
      </div>
    </div>
  );
};