import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DonneesMensuelles, MOIS_NOMS } from "@/types/ebene";
import { formatMontant } from "@/lib/ebene-utils";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  donneesMensuelles: DonneesMensuelles;
  onJump: (annee: number, mois: number) => void;
}

export const ArchivesModal = ({ open, onOpenChange, donneesMensuelles, onJump }: Props) => {
  const { t } = useTranslation();
  const periodes = useMemo(() => {
    return Object.keys(donneesMensuelles)
      .map((k) => {
        const [a, m] = k.split("-").map(Number);
        const d = donneesMensuelles[k];
        const trans = d.transactions || [];
        const rec = trans.filter((t) => t.type === "r").reduce((s, t) => s + t.m, 0);
        const dep = Math.abs(trans.filter((t) => t.type === "d").reduce((s, t) => s + t.m, 0));
        return {
          annee: a,
          mois: m,
          rec,
          dep,
          nbT: trans.length,
          nbF: (d.factures || []).length,
        };
      })
      .filter((p) => p.nbT > 0 || p.nbF > 0)
      .sort((a, b) => b.annee - a.annee || b.mois - a.mois);
  }, [donneesMensuelles]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{t("archives.title")}</DialogTitle>
        </DialogHeader>
        {periodes.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 italic">{t("archives.empty")}</p>
        ) : (
          <div className="space-y-2">
            {periodes.map((p) => (
              <button
                key={`${p.annee}-${p.mois}`}
                onClick={() => {
                  onJump(p.annee, p.mois);
                  onOpenChange(false);
                }}
                className="list-item w-full text-left flex items-center justify-between hover:border-primary"
              >
                <div>
                  <p className="font-bold">
                    {MOIS_NOMS[p.mois - 1]} {p.annee}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("archives.transactions_count", { nbT: p.nbT, nbF: p.nbF })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="amount text-sm text-success">+{formatMontant(p.rec)}</p>
                  <p className="amount text-sm text-destructive">-{formatMontant(p.dep)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};