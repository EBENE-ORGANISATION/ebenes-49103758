import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Facture } from "@/types/ebene";
import { formatMontant } from "@/lib/ebene-utils";
import { Printer, X } from "lucide-react";

interface Props {
  facture: Facture | null;
  onClose: () => void;
}

export const FacturePreview = ({ facture, onClose }: Props) => {
  if (!facture) return null;

  const isProforma = facture.statut === "proforma";
  const sousTotal = facture.lignes.reduce((a, l) => a + l.montant, 0);

  return (
    <Dialog open={!!facture} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between gap-2 p-4 border-b border-border bg-muted/30 no-print">
          <h2 className="font-bold">Aperçu — {facture.numero}</h2>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => window.print()} className="gap-1.5">
              <Printer className="size-4" /> Imprimer
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div id="print-area" className="p-8 bg-card text-foreground">
          <div className="flex items-start justify-between mb-8 border-b-2 border-primary pb-4">
            <div>
              <h1 className="text-3xl font-bold text-primary tracking-tight">EBENE SERVICES</h1>
              <p className="text-sm text-muted-foreground mt-1">Système de Gestion d'Entreprise</p>
              <p className="text-xs text-muted-foreground mt-0.5">NIF : 1 002 088 759</p>
              <p className="text-xs text-muted-foreground">contact@ebeneservices.gmail.com</p>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${isProforma ? "text-warning" : "text-info"}`}>
                {isProforma ? "FACTURE PROFORMA" : "FACTURE"}
              </p>
              <p className="font-mono font-bold text-lg mt-1">{facture.numero}</p>
              <p className="text-sm text-muted-foreground mt-1">Date : {facture.date}</p>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-xs uppercase font-bold text-muted-foreground tracking-wide">Facturé à</p>
            <p className="text-lg font-semibold mt-1">{facture.client}</p>
          </div>

          <table className="w-full mb-6 text-sm">
            <thead className="bg-primary text-primary-foreground">
              <tr>
                <th className="text-left py-2 px-3">Description</th>
                <th className="text-right py-2 px-3 w-40">Montant</th>
              </tr>
            </thead>
            <tbody>
              {facture.lignes.map((l, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="py-2 px-3">{l.description}</td>
                  <td className="py-2 px-3 text-right amount">{formatMontant(l.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-full sm:w-80 space-y-1 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Sous-total</span>
                <span className="amount">{formatMontant(sousTotal)}</span>
              </div>
              {facture.reduction > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Réduction</span>
                  <span className="amount text-destructive">- {formatMontant(facture.reduction)}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-t border-border pt-1">
                <span className="text-muted-foreground">Total HT</span>
                <span className="amount">{formatMontant(facture.totalHT)}</span>
              </div>
              {facture.avecTva && (
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">TVA 18%</span>
                  <span className="amount">{formatMontant(facture.totalTva)}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-t-2 border-primary text-lg font-bold">
                <span>TOTAL TTC</span>
                <span className="amount text-primary">{formatMontant(facture.totalTtc)}</span>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-4 border-t border-border text-center text-xs text-muted-foreground">
            <p>Merci pour votre confiance.</p>
            <p className="mt-2 italic">Document généré par EBENE SERVICES</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};