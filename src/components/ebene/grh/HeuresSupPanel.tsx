import { useState } from "react";
import { Employe, HeuresSup, MoisData } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMontant, tauxHoraire, HS_TAUX } from "@/lib/ebene-utils";

interface Props {
  employe: Employe;
  data: MoisData;
  onSave: (hs: HeuresSup) => void;
}

export const HeuresSupPanel = ({ employe, data, onSave }: Props) => {
  const current = (data.heuresSup || {})[employe.id] || {
    jourSemaine: 0,
    jourSup: 0,
    dimancheFerie: 0,
    nuitSemaine: 0,
    nuitDimancheFerie: 0,
  };
  const [hs, setHs] = useState<HeuresSup>(current);
  const th = tauxHoraire(employe.salaire, employe.sursalaire || 0);

  const total =
    hs.jourSemaine * th * HS_TAUX.jourSemaine +
    hs.jourSup * th * HS_TAUX.jourSup +
    hs.dimancheFerie * th * HS_TAUX.dimancheFerie +
    hs.nuitSemaine * th * HS_TAUX.nuitSemaine +
    hs.nuitDimancheFerie * th * HS_TAUX.nuitDimancheFerie;

  const Field = ({ k, label, taux }: { k: keyof HeuresSup; label: string; taux: number }) => (
    <div>
      <Label className="text-xs font-bold uppercase text-muted-foreground">
        {label} <span className="text-info">×{taux}</span>
      </Label>
      <Input
        type="number"
        min={0}
        step={0.5}
        value={hs[k]}
        onChange={(e) => setHs({ ...hs, [k]: parseFloat(e.target.value) || 0 })}
        className="mt-1 h-9"
      />
    </div>
  );

  return (
    <div className="bg-muted/40 border border-border rounded-lg p-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        Taux horaire : <strong className="amount">{formatMontant(th)}</strong> (salaire / 173,33)
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Field k="jourSemaine" label="Jour 41-48h" taux={HS_TAUX.jourSemaine} />
        <Field k="jourSup" label="Jour > 48h" taux={HS_TAUX.jourSup} />
        <Field k="dimancheFerie" label="Dim/Férié" taux={HS_TAUX.dimancheFerie} />
        <Field k="nuitSemaine" label="Nuit semaine" taux={HS_TAUX.nuitSemaine} />
        <Field k="nuitDimancheFerie" label="Nuit dim/férié" taux={HS_TAUX.nuitDimancheFerie} />
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-sm">
          Total HS : <strong className="amount">{formatMontant(total)}</strong>
        </span>
        <Button size="sm" onClick={() => onSave(hs)} className="bg-success text-success-foreground hover:bg-success/90">
          ✓ Enregistrer
        </Button>
      </div>
    </div>
  );
};