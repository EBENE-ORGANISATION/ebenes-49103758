import { MOIS_NOMS } from "@/types/ebene";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
            Année
          </label>
          <Select value={String(annee)} onValueChange={(v) => onAnnee(Number(v))}>
            <SelectTrigger className="h-11 text-sm font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {annees.map((a) => (
                <SelectItem key={a} value={String(a)}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};