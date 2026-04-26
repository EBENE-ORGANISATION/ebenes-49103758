import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DonneesMensuelles, MOIS_NOMS, Immobilisation } from "@/types/ebene";
import { formatMontant, moisKey } from "@/lib/ebene-utils";
import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "./StatCard";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { exportGrandLivre } from "@/lib/exportSYSCOHADA";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  annee: number;
  donneesMensuelles: DonneesMensuelles;
  immobilisations?: Immobilisation[];
}

export const RecapAnnuelModal = ({ open, onOpenChange, annee, donneesMensuelles, immobilisations = [] }: Props) => {
  const [moisSel, setMoisSel] = useState<number>(new Date().getMonth() + 1);

  const lignes = useMemo(() => {
    return MOIS_NOMS.map((nom, i) => {
      const m = donneesMensuelles[moisKey(annee, i + 1)];
      const trans = m?.transactions || [];
      const rec = trans.filter((t) => t.type === "r").reduce((a, t) => a + t.m, 0);
      const dep = Math.abs(trans.filter((t) => t.type === "d").reduce((a, t) => a + t.m, 0));
      const factures = m?.factures || [];
      return {
        mois: nom,
        moisNum: i + 1,
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

  const moisData = lignes.find((l) => l.moisNum === moisSel)!;

  const exportSyscohada = () => {
    try {
      exportGrandLivre(annee, donneesMensuelles, immobilisations);
      toast.success(`Export SYSCOHADA ${annee} généré`);
    } catch (e) {
      toast.error("Échec de l'export SYSCOHADA");
      console.error(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">📊 Récapitulatifs {annee}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 -mt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={exportSyscohada}
            className="gap-1.5"
          >
            <FileSpreadsheet className="size-4" />
            Export SYSCOHADA
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Grand-livre + Balance générale (.xlsx)
          </span>
        </div>

        <Tabs defaultValue="annuel" className="w-full">
          <TabsList className="grid grid-cols-2 w-full mb-4">
            <TabsTrigger value="mensuel">📅 Récap Mensuel</TabsTrigger>
            <TabsTrigger value="annuel">📈 Récap Annuel</TabsTrigger>
          </TabsList>

          <TabsContent value="mensuel" className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground">Mois</label>
              <Select value={String(moisSel)} onValueChange={(v) => setMoisSel(Number(v))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOIS_NOMS.map((nom, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{nom} {annee}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard label="Recettes" value={formatMontant(moisData.rec)} tone="success" />
              <StatCard label="Dépenses" value={formatMontant(moisData.dep)} tone="destructive" />
              <StatCard
                label="Solde"
                value={formatMontant(moisData.solde)}
                tone={moisData.solde >= 0 ? "info" : "destructive"}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {moisData.nbFactures > 0
                ? `${moisData.nbPayees}/${moisData.nbFactures} facture(s) payée(s) ce mois.`
                : "Aucune facture émise ce mois."}
            </div>
          </TabsContent>

          <TabsContent value="annuel">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <StatCard label={`Recettes ${annee}`} value={formatMontant(totals.rec)} tone="success" />
              <StatCard label={`Dépenses ${annee}`} value={formatMontant(totals.dep)} tone="destructive" />
              <StatCard
                label={`Solde ${annee}`}
                value={formatMontant(totals.solde)}
                tone={totals.solde >= 0 ? "info" : "destructive"}
              />
            </div>
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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};