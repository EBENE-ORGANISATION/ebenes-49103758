import { Layers, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenant } from "@/hooks/useTenant";
import { useActivites } from "@/hooks/data/useActivites";
import { useActiviteFilter } from "@/hooks/useActiviteFilter";

/**
 * Sélecteur de compartiment d'activité, affiché dans le header à côté du
 * sélecteur de société. Ne s'affiche QUE si la société possède au moins 2
 * activités actives (sinon la dimension est « dormante » et l'app se comporte
 * comme avant). Permet de basculer entre « Toutes les activités » (vue
 * consolidée) et une activité précise (filtrage + estampillage des saisies).
 */
export const ActiviteSwitcher = () => {
  const { currentSociete } = useTenant();
  const { activitesActives } = useActivites(currentSociete?.id ?? null);
  const { currentActiviteId, setActiviteId } = useActiviteFilter();

  // Dimension dormante : rien à choisir tant qu'il n'y a pas ≥2 activités.
  if (activitesActives.length < 2) return null;

  const current = activitesActives.find((a) => a.id === currentActiviteId) ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-1.5 max-w-[200px]">
          {current ? (
            <span
              className="size-2.5 rounded-full shrink-0"
              style={{ backgroundColor: current.couleur }}
            />
          ) : (
            <Layers className="size-4 shrink-0" />
          )}
          <span className="truncate">{current?.nom ?? "Toutes les activités"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-h-96 overflow-y-auto">
        <DropdownMenuLabel>Compartiment d'activité</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setActiviteId(null)}
          className={!current ? "bg-accent/40 font-medium" : ""}
        >
          <Layers className="size-4 shrink-0 mr-2 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-sm truncate">Toutes les activités</div>
            <div className="text-[10px] text-muted-foreground truncate">
              Vue consolidée
            </div>
          </div>
          {!current && <Check className="size-4 text-primary shrink-0 ml-2" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {activitesActives.map((a) => {
          const active = current?.id === a.id;
          return (
            <DropdownMenuItem
              key={a.id}
              onClick={() => setActiviteId(a.id)}
              className={active ? "bg-accent/40 font-medium" : ""}
            >
              <span
                className="size-2.5 rounded-full shrink-0 mr-2"
                style={{ backgroundColor: a.couleur }}
              />
              <span className="text-sm truncate flex-1">{a.nom}</span>
              {active && <Check className="size-4 text-primary shrink-0 ml-2" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
