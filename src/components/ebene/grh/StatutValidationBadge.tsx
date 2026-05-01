import { StatutValidation } from "@/types/ebene";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";

export const STATUT_BADGES: Record<StatutValidation, { cls: string; key: string }> = {
  brouillon: { cls: "bg-muted text-muted-foreground", key: "grh_statut.brouillon" },
  en_validation: { cls: "bg-warning/15 text-warning", key: "grh_statut.en_validation" },
  valide: { cls: "bg-success/15 text-success", key: "grh_statut.valide" },
  rejete: { cls: "bg-destructive/15 text-destructive", key: "grh_statut.rejete" },
};

interface Props {
  statut?: StatutValidation;
  motifRejet?: string;
  className?: string;
}

export const StatutValidationBadge = ({ statut, motifRejet, className = "" }: Props) => {
  const { t } = useTranslation();
  const s = statut || "en_validation";
  const def = STATUT_BADGES[s];
  const label = t(def.key);
  if (s === "rejete" && motifRejet) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`badge-soft cursor-help ${def.cls} ${className}`}>
              {label}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs max-w-xs">{t("grh_statut.motif_label", { motif: motifRejet })}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return <span className={`badge-soft ${def.cls} ${className}`}>{label}</span>;
};