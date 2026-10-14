import { Employe, MoisData, MOIS_NOMS } from "@/types/ebene";
import { tauxPourMois } from "@/lib/ebene-utils";
import { calculerPaie, contenuBulletin } from "@/lib/paie";
import { useTauxHistoriqueCourant } from "@/hooks/data/useTauxHistorique";
import { Button } from "@/components/ui/button";
import { Printer, X, FileDown, FileText } from "lucide-react";
import { exportElementToPDF, exportElementToWord } from "@/lib/exportDocs";
import { printElementById } from "@/lib/print";
import { useTranslation } from "react-i18next";
import { useTenant } from "@/hooks/useTenant";
import { useIdentification } from "@/hooks/data/useIdentification";
import { DocumentBulletin } from "@/components/impression/DocumentBulletin";
import { useSocieteDocument } from "@/components/impression/useSocieteDocument";

interface Props {
  employe: Employe;
  data: MoisData;
  annee: number;
  mois: number;
  onClose: () => void;
}

export const BulletinPaie = ({ employe, data, annee, mois, onClose }: Props) => {
  const { t } = useTranslation();
  const { currentSociete } = useTenant();
  const { identification } = useIdentification(currentSociete?.id ?? null);
  const societe = useSocieteDocument();
  const historique = useTauxHistoriqueCourant();
  const c = calculerPaie(employe, data, annee, mois, tauxPourMois(historique, annee, mois));
  const filename = `Bulletin_${employe.nom.replace(/\s+/g, "_")}_${MOIS_NOMS[mois - 1]}_${annee}`;
  const exportPDF = async () => {
    const el = document.getElementById("print-area");
    if (el) await exportElementToPDF(el, filename);
  };
  const exportWord = async () => {
    const el = document.getElementById("print-area");
    if (el) await exportElementToWord(el, filename);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box w-full max-w-[860px]">
        <div className="flex items-center justify-between mb-4 no-print">
          <h2 className="text-xl font-bold">{t("grh_bulletin.title")}</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => printElementById("print-area", `Bulletin ${employe.nom}`)} className="gap-1.5">
              <Printer className="size-4" /> {t("grh_bulletin.print")}
            </Button>
            <Button size="sm" variant="outline" onClick={exportPDF} className="gap-1.5">
              <FileDown className="size-4" /> PDF
            </Button>
            <Button size="sm" variant="outline" onClick={exportWord} className="gap-1.5">
              <FileText className="size-4" /> Word
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <DocumentBulletin
            id="print-area"
            employe={employe}
            contenu={contenuBulletin(c, employe)}
            annee={annee}
            mois={mois}
            anciennete={c.anciennete}
            societe={societe}
            cnssEmployeur={identification.cnssEmployeur}
          />
        </div>
      </div>
    </div>
  );
};
