import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Facture } from "@/types/ebene";
import { Printer, X, FileDown, FileText } from "lucide-react";
import { exportElementToPDF, exportElementToWord } from "@/lib/exportDocs";
import { printElementById } from "@/lib/print";
import { useTenant } from "@/hooks/useTenant";
import { useTranslation } from "react-i18next";
import { useActivites } from "@/hooks/data/useActivites";
import { useIdentification } from "@/hooks/data/useIdentification";
import { DocumentCommercial } from "@/components/impression/DocumentCommercial";
import { useSocieteDocument } from "@/components/impression/useSocieteDocument";

interface Props {
  facture: Facture | null;
  onClose: () => void;
}

export const FacturePreview = ({ facture, onClose }: Props) => {
  const { t } = useTranslation();
  const { currentSociete, societeConfig } = useTenant();
  const { activites } = useActivites(currentSociete?.id ?? null);
  const { identification } = useIdentification(currentSociete?.id ?? null);
  const societe = useSocieteDocument();
  if (!facture) return null;

  const isProforma = facture.statut === "proforma";
  const filename = `${isProforma ? "Proforma" : "Facture"}_${facture.numero.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const exportPDF = async () => {
    const el = document.getElementById("print-area");
    if (el) await exportElementToPDF(el, filename);
  };
  const exportWord = async () => {
    const el = document.getElementById("print-area");
    if (el) await exportElementToWord(el, filename);
  };

  return (
    <Dialog open={!!facture} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[860px] max-h-[90vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between gap-2 p-4 border-b border-border bg-muted/30 no-print">
          <h2 className="font-bold">{t("facture_preview.header", { numero: facture.numero })}</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => printElementById("print-area", `Facture ${facture.numero}`)} className="gap-1.5">
              <Printer className="size-4" /> {t("facture_preview.print")}
            </Button>
            <Button size="sm" variant="outline" onClick={exportPDF} className="gap-1.5">
              <FileDown className="size-4" /> {t("facture_preview.pdf")}
            </Button>
            <Button size="sm" variant="outline" onClick={exportWord} className="gap-1.5">
              <FileText className="size-4" /> {t("facture_preview.word")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <DocumentCommercial
            id="print-area"
            type={isProforma ? "proforma" : "facture"}
            numero={facture.numero}
            date={facture.date}
            client={facture.client}
            lignes={facture.lignes}
            reduction={facture.reduction}
            avecTva={facture.avecTva}
            totalHT={facture.totalHT}
            totalTva={facture.totalTva}
            totalTtc={facture.totalTtc}
            taxeSejour={facture.taxeSejour}
            activiteId={facture.activiteId}
            activites={activites}
            societe={societe}
            payee={facture.statut === "payee"}
            annulee={facture.statut === "annulee"}
            banques={identification.banques}
            mention={societeConfig?.mention_facture?.trim() || undefined}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
