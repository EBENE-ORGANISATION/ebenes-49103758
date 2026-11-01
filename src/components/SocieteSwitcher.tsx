import { useState } from "react";
import { useDossiersCabinet } from "@/hooks/useDossiersCabinet";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Building2, Check, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenant, useTenantNavigate } from "@/hooks/useTenant";
import { useTranslation } from "react-i18next";

/**
 * Sélecteur de société, affiché dans le header.
 * Visible si l'utilisateur a accès à au moins 2 sociétés (super-admin = toutes,
 * admin multi-sociétés = ses sociétés). Permet de basculer instantanément le
 * contexte courant.
 */
export const SocieteSwitcher = () => {
  const { societes, currentSociete, isSuperAdmin } = useTenant();
  const navigate = useTenantNavigate();
  const { t } = useTranslation();

  const { dossiers } = useDossiersCabinet();
  const [recherche, definirRecherche] = useState("");
  const clients = dossiers.filter(dossier => dossier.etat === "actif" || dossier.etat === "depart_demande");
  const estGroupe = clients.length > 0;
  const identifiantsClients = new Set(clients.map(dossier => dossier.societe_id));
  // La liste tenant contient aussi les sociétés accessibles par le cabinet.
  const mesSocietes = societes.filter(societe => !identifiantsClients.has(societe.id));
  const total = mesSocietes.length + clients.length;
  const filtre = recherche.trim().toLocaleLowerCase();
  const societesVisibles = mesSocietes.filter(societe => !estGroupe || (societe.nom + " " + (societe.slug ?? "")).toLocaleLowerCase().includes(filtre));
  const clientsVisibles = clients.filter(dossier => dossier.societe_nom.toLocaleLowerCase().includes(filtre));

  // On n'affiche le sélecteur que si l'utilisateur peut réellement choisir.
  if (total < 2 && !isSuperAdmin) return null;
  if (total === 0) return null;

  return (
    <DropdownMenu onOpenChange={() => definirRecherche("")}>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-1.5 max-w-[200px]">
          {currentSociete ? (
            <Building2 className="size-4 shrink-0" />
          ) : (
            <Home className="size-4 shrink-0" />
          )}
          <span className="truncate">{currentSociete?.nom ?? t("societe_switcher.parent_app")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-96 overflow-y-auto">
        {estGroupe && total > 8 && (
          <div className="p-2">
            <Input
              aria-label={t("societe_switcher.search")}
              placeholder={t("societe_switcher.search")}
              value={recherche}
              onChange={evenement => definirRecherche(evenement.target.value)}
              onKeyDown={evenement => {
                // Empêche la recherche clavier du menu de voler le focus au champ.
                if (evenement.key !== "Escape" && evenement.key !== "Tab") evenement.stopPropagation();
              }}
            />
          </div>
        )}
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t(estGroupe ? "societe_switcher.my_companies" : "societe_switcher.societes")}</span>
          {isSuperAdmin && (
            <span className="text-[10px] uppercase tracking-wide text-primary font-bold">
              {t("societe_switcher.super_admin")}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isSuperAdmin && (
          <>
            <DropdownMenuItem
              onClick={() => navigate(null)}
              className={!currentSociete ? "bg-accent/40 font-medium" : ""}
            >
              <Home className="size-4 shrink-0 mr-2 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{t("societe_switcher.parent_app_emoji")}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {t("societe_switcher.super_admin_global_view")}
                </div>
              </div>
              {!currentSociete && <Check className="size-4 text-primary shrink-0 ml-2" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {societesVisibles.map((s) => {
          const active = currentSociete?.id === s.id;
          return (
            <DropdownMenuItem
              key={s.id}
              onClick={() => navigate(s.id)}
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
        {estGroupe && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("societe_switcher.firm_clients")}</DropdownMenuLabel>
            {clientsVisibles.map(dossier => (
              <DropdownMenuItem
                key={dossier.societe_id}
                onClick={() => navigate(dossier.societe_id)}
                className={currentSociete?.id === dossier.societe_id ? "bg-accent/40 font-medium" : ""}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{dossier.societe_nom}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="secondary">{t(`societe_switcher.missions.${dossier.mission}`)}</Badge>
                    {dossier.etat === "depart_demande" && <Badge variant="outline">{t("societe_switcher.departure")}</Badge>}
                  </div>
                </div>
                {currentSociete?.id === dossier.societe_id && <Check className="size-4 text-primary shrink-0 ml-2" />}
              </DropdownMenuItem>
            ))}
            {societesVisibles.length === 0 && clientsVisibles.length === 0 && (
              <div role="status" className="p-2 text-sm text-muted-foreground">{t("societe_switcher.no_results")}</div>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
