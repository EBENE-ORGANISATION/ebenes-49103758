import { Building2, Check } from "lucide-react";
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

/**
 * Sélecteur de société, affiché dans le header.
 * Visible si l'utilisateur a accès à au moins 2 sociétés (super-admin = toutes,
 * admin multi-sociétés = ses sociétés). Permet de basculer instantanément le
 * contexte courant.
 */
export const SocieteSwitcher = () => {
  const { societes, currentSociete, setCurrentSocieteId, isSuperAdmin } = useTenant();

  // On n'affiche le sélecteur que si l'utilisateur peut réellement choisir.
  if (societes.length < 2 && !isSuperAdmin) return null;
  if (societes.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-1.5 max-w-[200px]">
          <Building2 className="size-4 shrink-0" />
          <span className="truncate">{currentSociete?.nom ?? "Choisir une société"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-96 overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Sociétés</span>
          {isSuperAdmin && (
            <span className="text-[10px] uppercase tracking-wide text-primary font-bold">
              Super-admin
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {societes.map((s) => {
          const active = currentSociete?.id === s.id;
          return (
            <DropdownMenuItem
              key={s.id}
              onClick={() => setCurrentSocieteId(s.id)}
              className={active ? "bg-accent/40 font-medium" : ""}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{s.nom}</div>
                {s.slug && (
                  <div className="text-[10px] text-muted-foreground font-mono truncate">
                    {s.slug}
                  </div>
                )}
              </div>
              {active && <Check className="size-4 text-primary shrink-0 ml-2" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};