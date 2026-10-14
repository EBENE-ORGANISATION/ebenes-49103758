import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Devis } from "@/types/ebene";
import { Printer, X, FileDown, FileText } from "lucide-react";
import { exportElementToPDF, exportElementToWord } from "@/lib/exportDocs";
import { printElementById } from "@/lib/print";
import { useTenant } from "@/hooks/useTenant";
import { useTranslation } from "react-i18next";
import { useActivites } from "@/hooks/data/useActivites";
import { DocumentCommercial } from "@/components/impression/DocumentCommercial";
import { useSocieteDocument } from "@/components/impression/useSocieteDocument";

interface Props {
  devis: Devis | null;
  onClose: () => void;
}

export const DevisPreview = ({ devis, onClose }: Props) => {
  const { t } = useTranslation();
  const { currentSociete, societeConfig } = useTenant();
  const { activites } = useActivites(currentSociete?.id ?? null);
  const societe = useSocieteDocument();
  if (!devis) return null;

  const filename = `Devis_${devis.numero.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const exportPDF = async () => {
    const el = document.getElementById("print-area-devis");
    if (el) await exportElementToPDF(el, filename);
  };
  const exportWord = async () => {
    const el = document.getElementById("print-area-devis");
    if (el) await exportElementToWord(el, filename);
  };

  return (
    <Dialog open={!!devis} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[860px] max-h-[90vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between gap-2 p-4 border-b border-border bg-muted/30 no-print">
          <h2 className="font-bold">Devis {devis.numero}</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => printElementById("print-area-devis", `Devis ${devis.numero}`)} className="gap-1.5">
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
            id="print-area-devis"
            type="devis"
            numero={devis.numero}
            date={devis.date}
            dateValidite={devis.dateValidite}
            client={devis.client}
            lignes={devis.lignes}
            reduction={devis.reduction}
            avecTva={devis.avecTva}
            totalHT={devis.totalHT}
            totalTva={devis.totalTva}
            totalTtc={devis.totalTtc}
            activiteId={devis.activiteId}
            activites={activites}
            societe={societe}
            mention={societeConfig?.mention_facture?.trim() || undefined}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
