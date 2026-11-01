import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cabinetOps } from "@/lib/cabinetOps";
import { missionCouvre, missionsCabinet } from "@/lib/missionCabinet";
import type { MissionCabinet } from "@/lib/cabinetOps";
import type { AttributionCabinet, DossierGestion, MembreCabinet } from "@/hooks/data/useCabinet";

export interface ActionsCabinet {
  enCours: boolean;
  executer: (operation: () => Promise<unknown>) => Promise<unknown>;
}
export function AttributionsDossier({ dossier, membres, attributions, executer, enCours }: ActionsCabinet & { dossier: DossierGestion; membres: MembreCabinet[]; attributions: AttributionCabinet[] }) {
  const { t } = useTranslation();
  return <div className="space-y-3">{membres.filter(m => m.actif && m.role !== "responsable").map(membre => {
    const attribution = attributions.find(a => a.user_id === membre.user_id && a.dossier_id === dossier.id);
    return <div key={membre.user_id} className="flex flex-wrap items-center gap-2">
      <label className="flex flex-wrap items-center gap-2">{membre.nom}
        <select className="rounded-md border bg-background p-2" aria-label={t("cabinet.mission_de", { nom: membre.nom })} disabled={enCours} value={attribution?.mission ?? ""} onChange={e => { const mission = e.target.value as MissionCabinet; if (mission) void executer(() => cabinetOps.attribuer(dossier.id, membre.user_id, mission)).catch(() => {}); }}>
          <option value="">{t("cabinet.non_attribue")}</option>
          {attribution && !missionCouvre(dossier.mission, attribution.mission) && <option value={attribution.mission} disabled>{t(`societe_switcher.missions.${attribution.mission}`)}</option>}
          {missionsCabinet.filter(m => missionCouvre(dossier.mission, m)).map(m => <option key={m} value={m}>{t(`societe_switcher.missions.${m}`)}</option>)}
        </select>
      </label>
      {attribution && <Button variant="outline" disabled={enCours} onClick={() => void executer(() => cabinetOps.retirerAttribution(dossier.id, membre.user_id)).catch(() => {})}>{t("cabinet.retirer_attribution")}</Button>}
    </div>;
  })}</div>;
}
