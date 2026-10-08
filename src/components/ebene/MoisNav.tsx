import { MOIS_NOMS } from "@/types/ebene";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

interface Props {
  mois: number;
  annee: number;
  annees: number[];
  onMois: (m: number) => void;
  onAnnee: (a: number) => void;
}

export const MoisNav = ({ mois, annee, annees, onMois, onAnnee }: Props) => {
  const now = new Date();
  const estMoisCourant = now.getFullYear() === annee && now.getMonth() + 1 === mois;
  const estMoisPasse = new Date(annee, mois - 1, 1) < new Date(now.getFullYear(), now.getMonth(), 1);

  const allerMoisPrecedent = () => {
    if (mois === 1) { onMois(12); onAnnee(annee - 1); }
    else onMois(mois - 1);
  };

  const allerMoisSuivant = () => {
    if (mois === 12) { onMois(1); onAnnee(annee + 1); }
    else onMois(mois + 1);
  };

  const revenirAujourdhui = () => {
    onMois(now.getMonth() + 1);
    onAnnee(now.getFullYear());
  };

  return (
    <div className="card-elevated no-print">
      <div className="px-3 sm:px-5 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-3 flex-wrap">

        {/* Icône + label */}
        <div className="hidden sm:flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <CalendarDays className="size-4 shrink-0" />
          <span className="hidden sm:inline">Période</span>
        </div>

        {/* Navigation centrale */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 justify-start max-w-lg">
          {/* Flèche précédent */}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={allerMoisPrecedent}
            title="Mois précédent"
          >
            <ChevronLeft className="size-4" />
          </Button>

          {/* Sélecteur mois */}
          <Select value={String(mois)} onValueChange={(v) => onMois(Number(v))}>
            <SelectTrigger className="h-9 w-[6.5rem] sm:w-40 text-sm font-semibold">
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

          {/* Sélecteur année */}
          <Select value={String(annee)} onValueChange={(v) => onAnnee(Number(v))}>
            <SelectTrigger className="h-9 w-[4.75rem] sm:w-28 text-sm font-semibold">
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

          {/* Flèche suivant */}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={allerMoisSuivant}
            title="Mois suivant"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Badge statut + bouton "Aujourd'hui" */}
        <div className="flex items-center gap-2 shrink-0">
          {estMoisCourant ? (
            <Badge className="bg-success/15 text-success border-success/30 text-xs font-semibold" title="Mois en cours">
              ●<span className="hidden sm:inline">&nbsp;Mois en cours</span>
            </Badge>
          ) : estMoisPasse ? (
            <Badge variant="secondary" className="text-xs font-medium" title="Période passée">
              🔒<span className="hidden sm:inline">&nbsp;Période passée</span>
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs font-medium text-muted-foreground" title="À venir">
              ○<span className="hidden sm:inline">&nbsp;À venir</span>
            </Badge>
          )}

          {!estMoisCourant && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2 sm:px-3 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={revenirAujourdhui}
            >
              Aujourd'hui
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
