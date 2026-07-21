import { Layers } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useTenant } from "@/hooks/useTenant";
import { useActivites } from "@/hooks/data/useActivites";

const NONE = "__none__";

interface ActiviteSelectProps {
  value: string | null | undefined;
  onChange: (activiteId: string | null) => void;
  label?: string;
  /** Affiche l'option « Sans activité ». Défaut : true. */
  allowNone?: boolean;
  className?: string;
}

/**
 * Sélecteur d'activité réutilisable dans les formulaires de saisie
 * (transaction, facture, devis, article, immobilisation). Ne s'affiche que si
 * la société possède au moins 2 activités actives — sinon rien n'est rendu et
 * l'estampillage automatique du store suffit.
 */
export const ActiviteSelect = ({
  value,
  onChange,
  label = "Activité",
  allowNone = true,
  className,
}: ActiviteSelectProps) => {
  const { currentSociete } = useTenant();
  const { activitesActives } = useActivites(currentSociete?.id ?? null);

  if (activitesActives.length < 2) return null;

  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs flex items-center gap-1.5">
        <Layers className="size-3.5 text-muted-foreground" />
        {label}
      </Label>
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Choisir une activité" />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE}>Sans activité</SelectItem>}
          {activitesActives.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: a.couleur }} />
                {a.nom}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
