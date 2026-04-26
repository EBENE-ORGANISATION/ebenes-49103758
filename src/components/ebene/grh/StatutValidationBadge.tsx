import { StatutValidation } from "@/types/ebene";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const STATUT_BADGES: Record<StatutValidation, { cls: string; label: string }> = {
  brouillon: { cls: "bg-muted text-muted-foreground", label: "Brouillon" },
  en_validation: { cls: "bg-warning/15 text-warning", label: "En validation" },
  valide: { cls: "bg-success/15 text-success", label: "✓ Validé" },
  rejete: { cls: "bg-destructive/15 text-destructive", label: "✗ Rejeté" },
};

interface Props {
  statut?: StatutValidation;
  motifRejet?: string;
  className?: string;
}

/**
 * Badge réutilisable pour afficher le statut de validation d'un élément GRH.
 * Si le statut est 'rejete' et qu'un motif est renseigné, un tooltip l'affiche.
 */
export const StatutValidationBadge = ({ statut, motifRejet, className = "" }: Props) => {
  const s = statut || "en_validation";
  const def = STATUT_BADGES[s];
  if (s === "rejete" && motifRejet) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`badge-soft cursor-help ${def.cls} ${className}`}>
              {def.label}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs max-w-xs">Motif : {motifRejet}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return <span className={`badge-soft ${def.cls} ${className}`}>{def.label}</span>;
};