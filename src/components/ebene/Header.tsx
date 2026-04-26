import { Button } from "@/components/ui/button";
import { Download, Upload, Archive, BarChart3, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import logoEbene from "@/assets/ebene-logo.png";

interface HeaderProps {
  onExport: () => void;
  onImport: (file: File) => void;
  onShowRecap: () => void;
  onShowArchives: () => void;
  lastSaved?: Date;
}

export const Header = ({ onExport, onImport, onShowRecap, onShowArchives, lastSaved }: HeaderProps) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [savedAgo, setSavedAgo] = useState("à l'instant");

  useEffect(() => {
    if (!lastSaved) return;
    const tick = () => {
      const sec = Math.floor((Date.now() - lastSaved.getTime()) / 1000);
      if (sec < 5) setSavedAgo("à l'instant");
      else if (sec < 60) setSavedAgo(`il y a ${sec}s`);
      else if (sec < 3600) setSavedAgo(`il y a ${Math.floor(sec / 60)} min`);
      else setSavedAgo(`il y a ${Math.floor(sec / 3600)} h`);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [lastSaved]);

  return (
    <header className="header-gradient text-primary-foreground shadow-lg no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-primary-foreground/95 rounded-2xl p-3 shadow-xl ring-2 ring-primary-foreground/40">
              <img src={logoEbene} alt="EBENE SERVICES" className="h-20 sm:h-24 w-auto" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">EBENE SERVICES</h1>
              <p className="text-sm text-primary-foreground/80 font-medium">Commerce Général — Système de Gestion</p>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                <span className="badge-soft bg-success/20 text-success-foreground inline-flex items-center gap-1">
                  <Check className="size-3" /> Sauvegardé {savedAgo}
                </span>
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