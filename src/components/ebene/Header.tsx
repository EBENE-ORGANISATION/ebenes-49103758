import { Button } from "@/components/ui/button";
import { Download, Upload, FileText, Archive, BarChart3 } from "lucide-react";
import { useRef } from "react";

interface HeaderProps {
  onExport: () => void;
  onImport: (file: File) => void;
  onShowRecap: () => void;
  onShowArchives: () => void;
}

export const Header = ({ onExport, onImport, onShowRecap, onShowArchives }: HeaderProps) => {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <header className="header-gradient text-primary-foreground shadow-lg no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="text-4xl">📊</div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">EBENE SERVICES</h1>
              <p className="text-sm text-primary-foreground/75 font-medium">Système de Gestion d'Entreprise</p>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                <span className="badge-soft bg-success/20 text-success-foreground">✅ Sauvegarde auto</span>
                <span className="badge-soft bg-info/20 text-info-foreground">📅 Multi-années</span>
                <span className="badge-soft bg-warning/20 text-warning-foreground">🔄 Proforma → Facture</span>
                <span className="badge-soft bg-purple/20 text-purple-foreground">✍️ BITHO SIMBAYA</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onShowRecap} variant="secondary" size="sm" className="gap-1.5">
              <BarChart3 className="size-4" /> Récap Annuel
            </Button>
            <Button onClick={onShowArchives} variant="secondary" size="sm" className="gap-1.5">
              <Archive className="size-4" /> Archives
            </Button>
            <Button onClick={onExport} variant="secondary" size="sm" className="gap-1.5">
              <Download className="size-4" /> Exporter JSON
            </Button>
            <Button onClick={() => fileRef.current?.click()} variant="secondary" size="sm" className="gap-1.5">
              <Upload className="size-4" /> Importer JSON
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImport(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>
    </header>
  );
};