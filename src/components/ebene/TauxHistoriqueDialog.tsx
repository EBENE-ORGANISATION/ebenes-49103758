import { useState } from "react";
import { TauxFiscaux, TAUX_DEFAUT } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  historique: TauxFiscaux[];
  onAjouter: (t: TauxFiscaux) => void;
  onSupprimer: (dateEffet: string) => void;
}

const Field = ({
  label, value, onChange, type = "number", step = "0.0001",
}: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; step?: string;
}) => (
  <div>
    <Label className="text-xs font-bold uppercase">{label}</Label>
    <Input type={type} step={step} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 mt-1" />
  </div>
);

export const TauxHistoriqueDialog = ({ open, onOpenChange, historique, onAjouter, onSupprimer }: Props) => {
  const [showForm, setShowForm] = useState(false);
  const last = historique[historique.length - 1] || TAUX_DEFAUT;
  const [t, setT] = useState<TauxFiscaux>({ ...last, dateEffet: new Date().toISOString().split("T")[0] });

  const submit = () => {
    if (!t.dateEffet) return toast.error("Date d'effet obligatoire");
    onAjouter(t);
    setShowForm(false);
    toast.success("Nouveau jeu de taux enregistré (non rétroactif)");
  };

  const upd = <K extends keyof TauxFiscaux>(k: K, v: TauxFiscaux[K]) => setT((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historique des taux fiscaux & sociaux</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Les taux ne sont jamais rétroactifs : un nouvel enregistrement n'affecte que les périodes postérieures à sa date d'effet.
          </p>

          {historique.length === 0 ? (
            <p className="italic text-sm text-muted-foreground">Aucun jeu de taux.</p>
          ) : (
            <div className="space-y-2">
              {[...historique]
                .sort((a, b) => new Date(b.dateEffet).getTime() - new Date(a.dateEffet).getTime())
                .map((x) => (
                  <div key={x.dateEffet} className="border-2 border-border rounded-lg p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-sm">En vigueur depuis le {x.dateEffet}</p>
                      <Button
                        size="icon" variant="ghost" className="size-7 text-destructive"
                        onClick={() => { if (confirm("Supprimer ce jeu de taux ?")) onSupprimer(x.dateEffet); }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-muted-foreground">
                      <span>TVA : <strong>{(x.tva * 100).toFixed(2)}%</strong></span>
                      <span>IS : <strong>{(x.is * 100).toFixed(2)}%</strong></span>
                      <span>IMF : <strong>{(x.imfTaux * 100).toFixed(2)}%</strong></span>
                      <span>IMF min : <strong>{x.imfMin.toLocaleString("fr-FR")} F</strong></span>
                      <span>Patente serv. : <strong>{(x.patenteService * 100).toFixed(2)}%</strong></span>
                      <span>Patente comm. : <strong>{(x.patenteCommerce * 100).toFixed(2)}%</strong></span>
                      <span>CNSS sal/emp : <strong>{(x.cnssSal*100).toFixed(1)}/{(x.cnssEmp*100).toFixed(1)}%</strong></span>
                      <span>AMU sal/emp : <strong>{(x.amuSal*100).toFixed(1)}/{(x.amuEmp*100).toFixed(1)}%</strong></span>
                      <span>Activité par déf. : <strong>{x.activiteDefaut}</strong></span>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {!showForm ? (
            <Button onClick={() => setShowForm(true)} className="gap-1.5">
              <Plus className="size-4" /> Nouveau jeu de taux
            </Button>
          ) : (
            <div className="border-2 border-primary rounded-lg p-4 space-y-3 bg-muted/30">
              <p className="font-bold text-sm">Nouveau jeu de taux</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Date d'effet" type="date" step="" value={t.dateEffet} onChange={(v) => upd("dateEffet", v)} />
                <Field label="TVA" value={t.tva} onChange={(v) => upd("tva", parseFloat(v) || 0)} />
                <Field label="IS" value={t.is} onChange={(v) => upd("is", parseFloat(v) || 0)} />
                <Field label="IMF taux" value={t.imfTaux} onChange={(v) => upd("imfTaux", parseFloat(v) || 0)} />
                <Field label="IMF minimum (FCFA/an)" step="1" value={t.imfMin} onChange={(v) => upd("imfMin", parseFloat(v) || 0)} />
                <Field label="Patente service" value={t.patenteService} onChange={(v) => upd("patenteService", parseFloat(v) || 0)} />
                <Field label="Patente commerce" value={t.patenteCommerce} onChange={(v) => upd("patenteCommerce", parseFloat(v) || 0)} />
                <Field label="CNSS salarié" value={t.cnssSal} onChange={(v) => upd("cnssSal", parseFloat(v) || 0)} />
                <Field label="CNSS employeur" value={t.cnssEmp} onChange={(v) => upd("cnssEmp", parseFloat(v) || 0)} />
                <Field label="AMU salarié" value={t.amuSal} onChange={(v) => upd("amuSal", parseFloat(v) || 0)} />
                <Field label="AMU employeur" value={t.amuEmp} onChange={(v) => upd("amuEmp", parseFloat(v) || 0)} />
              </div>
              <p className="text-xs italic text-muted-foreground">Saisissez les taux en décimal (ex : 0,18 pour 18%).</p>
              <div className="flex gap-2">
                <Button onClick={submit} className="bg-success text-success-foreground hover:bg-success/90">✓ Enregistrer</Button>
                <Button variant="ghost" onClick={() => setShowForm(false)}>Annuler</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
