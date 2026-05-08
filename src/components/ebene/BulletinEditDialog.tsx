import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatMontant } from "@/lib/ebene-utils";
import { MOIS_NOMS, type BulletinPaieRecord } from "@/types/ebene";

type EditableKeys =
  | "salaire_base"
  | "sursalaire"
  | "prime_anciennete"
  | "hs_montant"
  | "primes_diverses"
  | "indemnites"
  | "cnss_sal"
  | "amu_sal"
  | "irpp"
  | "retenues_diverses";

const FIELDS: { key: EditableKeys; label: string; group: "gains" | "retenues" }[] = [
  { key: "salaire_base",      label: "Salaire de base",       group: "gains" },
  { key: "sursalaire",        label: "Sursalaire",            group: "gains" },
  { key: "prime_anciennete",  label: "Prime d'ancienneté",    group: "gains" },
  { key: "hs_montant",        label: "Heures supplémentaires",group: "gains" },
  { key: "primes_diverses",   label: "Primes diverses",       group: "gains" },
  { key: "indemnites",        label: "Indemnités",            group: "gains" },
  { key: "cnss_sal",          label: "CNSS salarié",          group: "retenues" },
  { key: "amu_sal",           label: "AMU salarié",           group: "retenues" },
  { key: "irpp",              label: "IRPP",                  group: "retenues" },
  { key: "retenues_diverses", label: "Retenues diverses",     group: "retenues" },
];

interface Props {
  bulletin: BulletinPaieRecord | null;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Record<EditableKeys, number>>) => Promise<boolean>;
}

export const BulletinEditDialog = ({ bulletin, onClose, onSave }: Props) => {
  const [values, setValues] = useState<Record<EditableKeys, number>>({} as Record<EditableKeys, number>);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!bulletin) return;
    const init: Record<EditableKeys, number> = {} as Record<EditableKeys, number>;
    FIELDS.forEach((f) => { init[f.key] = Number(bulletin[f.key] ?? 0); });
    setValues(init);
  }, [bulletin]);

  if (!bulletin) return null;

  const set = (k: EditableKeys, v: string) => {
    const n = parseFloat(v.replace(",", "."));
    setValues((prev) => ({ ...prev, [k]: Number.isFinite(n) ? n : 0 }));
  };

  const brut =
    values.salaire_base + values.sursalaire + values.prime_anciennete +
    values.hs_montant + values.primes_diverses + values.indemnites;
  const totalRet = values.cnss_sal + values.amu_sal + values.irpp + values.retenues_diverses;
  const net = brut - totalRet;

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(bulletin.id, values);
    setSaving(false);
    if (ok) {
      toast.success("Bulletin mis à jour");
      onClose();
    } else {
      toast.error("Échec de la mise à jour");
    }
  };

  return (
    <Dialog open={!!bulletin} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le bulletin — {bulletin.employe_nom}</DialogTitle>
          <DialogDescription>
            {MOIS_NOMS[bulletin.mois - 1]} {bulletin.annee} · brouillon — les totaux sont recalculés automatiquement.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-success">Gains</h4>
            {FIELDS.filter((f) => f.group === "gains").map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={f.key} className="text-xs">{f.label}</Label>
                <Input
                  id={f.key}
                  type="number"
                  step="1"
                  min="0"
                  value={values[f.key] ?? 0}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-destructive">Retenues</h4>
            {FIELDS.filter((f) => f.group === "retenues").map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={f.key} className="text-xs">{f.label}</Label>
                <Input
                  id={f.key}
                  type="number"
                  step="1"
                  min="0"
                  value={values[f.key] ?? 0}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Brut</p>
            <p className="font-bold">{formatMontant(brut)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total retenues</p>
            <p className="font-bold text-destructive">{formatMontant(totalRet)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net à payer</p>
            <p className="font-bold text-success">{formatMontant(net)}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulletinEditDialog;