import { MOIS_NOMS } from "@/types/ebene";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  mois: number;
  annee: number;
  annees: number[];
  onMois: (m: number) => void;
  onAnnee: (a: number) => void;
}

export const MoisNav = ({ mois, annee, annees, onMois, onAnnee }: Props) => {
  return (
    <div className="card-elevated p-4 sm:p-5 no-print">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
            Mois
          </label>
          <Select value={String(mois)} onValueChange={(v) => onMois(Number(v))}>
            <SelectTrigger className="h-11 text-sm font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MOIS_NOMS.map((nom, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
            Année (saisie libre)
          </label>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => onAnnee(annee - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Input
              type="number"
              value={annee}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v > 1900 && v < 9999) onAnnee(v);
              }}
              className="h-11 text-sm font-semibold text-center"
            />
            <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => onAnnee(annee + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};