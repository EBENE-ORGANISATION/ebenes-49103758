import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DonneesMensuelles, MOIS_NOMS } from "@/types/ebene";
import { formatMontant, moisKey } from "@/lib/ebene-utils";
import { useMemo } from "react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  annee: number;
  donneesMensuelles: DonneesMensuelles;
}

export const RecapAnnuelModal = ({ open, onOpenChange, annee, donneesMensuelles }: Props) => {
  const lignes = useMemo(() => {
    return MOIS_NOMS.map((nom, i) => {
      const m = donneesMensuelles[moisKey(annee, i + 1)];
      const trans = m?.transactions || [];
      const rec = trans.filter((t) => t.type === "r").reduce((a, t) => a + t.m, 0);
      const dep = Math.abs(trans.filter((t) => t.type === "d").reduce((a, t) => a + t.m, 0));
      const factures = m?.factures || [];
      return {
        mois: nom,
        rec,
        dep,
        solde: rec - dep,
        nbFactures: factures.length,
        nbPayees: factures.filter((f) => f.statut === "payee").length,
      };
    });
  }, [annee, donneesMensuelles]);

  const totals = lignes.reduce(
    (a, l) => ({ rec: a.rec + l.rec, dep: a.dep + l.dep, solde: a.solde + l.solde }),
    { rec: 0, dep: 0, solde: 0 }
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">📊 Récapitulatif Annuel {annee}</DialogTitle>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-border text-xs uppercase text-muted-foreground">
                <th className="text-left py-2 px-2">Mois</th>
                <th className="text-right py-2 px-2">Recettes</th>
                <th className="text-right py-2 px-2">Dépenses</th>
                <th className="text-right py-2 px-2">Solde</th>
                <th className="text-right py-2 px-2">Factures</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.mois} className="border-b border-border hover:bg-muted/30">
                  <td className="py-2 px-2 font-semibold">{l.mois}</td>
                  <td className="py-2 px-2 text-right amount text-success">{formatMontant(l.rec)}</td>
                  <td className="py-2 px-2 text-right amount text-destructive">{formatMontant(l.dep)}</td>
                  <td className={`py-2 px-2 text-right amount ${l.solde >= 0 ? "text-info" : "text-destructive"}`}>
                    {formatMontant(l.solde)}
                  </td>
                  <td className="py-2 px-2 text-right text-xs text-muted-foreground">
                    {l.nbPayees}/{l.nbFactures}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-foreground font-bold">
                <td className="py-3 px-2">TOTAL {annee}</td>
                <td className="py-3 px-2 text-right amount text-success">{formatMontant(totals.rec)}</td>
                <td className="py-3 px-2 text-right amount text-destructive">{formatMontant(totals.dep)}</td>
                <td className={`py-3 px-2 text-right amount ${totals.solde >= 0 ? "text-info" : "text-destructive"}`}>
                  {formatMontant(totals.solde)}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
};