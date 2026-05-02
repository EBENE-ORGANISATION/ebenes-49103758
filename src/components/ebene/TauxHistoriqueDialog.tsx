import { useState } from "react";
import { TauxFiscaux, TAUX_DEFAUT } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const last = historique[historique.length - 1] || TAUX_DEFAUT;
  const [taux, setTaux] = useState<TauxFiscaux>({ ...last, dateEffet: new Date().toISOString().split("T")[0] });

  const submit = () => {
    if (!taux.dateEffet) return toast.error(t("taux.err_date"));
    onAjouter(taux);
    setShowForm(false);
    toast.success(t("taux.save_ok"));
  };

  const upd = <K extends keyof TauxFiscaux>(k: K, v: TauxFiscaux[K]) => setTaux((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("taux.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("taux.intro")}</p>

          {historique.length === 0 ? (
            <p className="italic text-sm text-muted-foreground">{t("taux.none")}</p>
          ) : (
            <div className="space-y-2">
              {[...historique]
                .sort((a, b) => new Date(b.dateEffet).getTime() - new Date(a.dateEffet).getTime())
                .map((x) => (
                  <div key={x.dateEffet} className="border-2 border-border rounded-lg p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-sm">{t("taux.in_force_since", { date: x.dateEffet })}</p>
                      <Button
                        size="icon" variant="ghost" className="size-7 text-destructive"
                        onClick={() => { if (confirm(t("taux.confirm_delete"))) onSupprimer(x.dateEffet); }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-muted-foreground">
                      <span>{t("taux.lbl_tva")} : <strong>{(x.tva * 100).toFixed(2)}%</strong></span>
                      <span>{t("taux.lbl_is")} : <strong>{(x.is * 100).toFixed(2)}%</strong></span>
                      <span>{t("taux.lbl_imf")} : <strong>{(x.imfTaux * 100).toFixed(2)}%</strong></span>
                      <span>{t("taux.lbl_imf_min")} : <strong>{x.imfMin.toLocaleString("fr-FR")} F</strong></span>
                      <span>{t("taux.lbl_patente_service")} : <strong>{(x.patenteService * 100).toFixed(2)}%</strong></span>
                      <span>{t("taux.lbl_patente_commerce")} : <strong>{(x.patenteCommerce * 100).toFixed(2)}%</strong></span>
                      <span>{t("taux.lbl_cnss")} : <strong>{(x.cnssSal*100).toFixed(1)}/{(x.cnssEmp*100).toFixed(1)}%</strong></span>
                      <span>{t("taux.lbl_amu")} : <strong>{(x.amuSal*100).toFixed(1)}/{(x.amuEmp*100).toFixed(1)}%</strong></span>
                      <span>{t("taux.lbl_activity_default")} : <strong>{x.activiteDefaut}</strong></span>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {!showForm ? (
            <Button onClick={() => setShowForm(true)} className="gap-1.5">
              <Plus className="size-4" /> {t("taux.new_set")}
            </Button>
          ) : (
            <div className="border-2 border-primary rounded-lg p-4 space-y-3 bg-muted/30">
              <p className="font-bold text-sm">{t("taux.new_set")}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label={t("taux.f_date_effet")} type="date" step="" value={taux.dateEffet} onChange={(v) => upd("dateEffet", v)} />
                <Field label={t("taux.f_tva")} value={taux.tva} onChange={(v) => upd("tva", parseFloat(v) || 0)} />
                <Field label={t("taux.f_is")} value={taux.is} onChange={(v) => upd("is", parseFloat(v) || 0)} />
                <Field label={t("taux.f_imf_taux")} value={taux.imfTaux} onChange={(v) => upd("imfTaux", parseFloat(v) || 0)} />
                <Field label={t("taux.f_imf_min")} step="1" value={taux.imfMin} onChange={(v) => upd("imfMin", parseFloat(v) || 0)} />
                <Field label={t("taux.f_patente_service")} value={taux.patenteService} onChange={(v) => upd("patenteService", parseFloat(v) || 0)} />
                <Field label={t("taux.f_patente_commerce")} value={taux.patenteCommerce} onChange={(v) => upd("patenteCommerce", parseFloat(v) || 0)} />
                <Field label={t("taux.f_cnss_sal")} value={taux.cnssSal} onChange={(v) => upd("cnssSal", parseFloat(v) || 0)} />
                <Field label={t("taux.f_cnss_emp")} value={taux.cnssEmp} onChange={(v) => upd("cnssEmp", parseFloat(v) || 0)} />
                <Field label={t("taux.f_amu_sal")} value={taux.amuSal} onChange={(v) => upd("amuSal", parseFloat(v) || 0)} />
                <Field label={t("taux.f_amu_emp")} value={taux.amuEmp} onChange={(v) => upd("amuEmp", parseFloat(v) || 0)} />
              </div>
              <p className="text-xs italic text-muted-foreground">{t("taux.decimal_hint")}</p>
              <div className="flex gap-2">
                <Button onClick={submit} className="bg-success text-success-foreground hover:bg-success/90">{t("taux.save")}</Button>
                <Button variant="ghost" onClick={() => setShowForm(false)}>{t("taux.cancel")}</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
