import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cabinetOps, type MissionCabinet } from "@/lib/cabinetOps";
import { missionsCabinet } from "@/lib/missionCabinet";
import { messageErreur } from "@/lib/ebene-utils";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

/** Monté uniquement pour un administrateur du dossier ouvert. */
export function MonCabinetClient({ societeId }: { societeId: string }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const cache = useQueryClient();
  const lecture = useQuery({
    queryKey: ["cabinet_client", user?.id, societeId], enabled: !!user,
    staleTime: 0, refetchInterval: 30_000, refetchOnMount: "always",
    queryFn: async () => {
      const { data: lien, error } = await supabase.from("cabinet_dossiers").select("*, cabinets(nom)").eq("societe_id", societeId).neq("etat", "termine").maybeSingle();
      if (error) throw error;
      if (!lien) return null;
      return { lien, collaborateurs: await cabinetOps.collaborateursDossier(societeId) };
    },
  });
  const mutation = useMutation({
    mutationFn: (mission: MissionCabinet) => cabinetOps.changerMission(lecture.data!.lien.id, mission),
    onSuccess: async () => { await Promise.all(["cabinet_client", "cabinet", "cabinets_admin", "dossiers_cabinet"].map(cle => cache.invalidateQueries({ queryKey: [cle] }))); },
    onError: erreur => toast.error(messageErreur(erreur, t("cabinet.erreur"))),
  });
  if (lecture.isError) return <p role="alert">{t("cabinet.erreur")}</p>;
  if (!lecture.data) return null;
  const { lien, collaborateurs } = lecture.data;
  return <Card className="space-y-3 p-6">
    <h2 className="text-xl font-semibold">{t("cabinet.titre")}</h2>
    <p>{lien.cabinets?.nom}</p>
    <p>{t("cabinet9.depuis", { date: new Date(lien.created_at).toLocaleDateString(i18n.language) })} — {t(`cabinet.etats.${lien.etat}`)}</p>
    <label className="block">{t("cabinet9.mission")}<select className="ml-3 rounded border bg-background p-2" value={lien.mission} disabled={mutation.isPending} onChange={e => mutation.mutate(e.target.value as MissionCabinet)}>{missionsCabinet.map(mission => <option key={mission} value={mission}>{t(`societe_switcher.missions.${mission}`)}</option>)}</select></label>
    <ul>{collaborateurs.map(personne => <li key={personne.user_id}>{personne.nom} — {t(`cabinet.roles.${personne.role}`)} — {t(`societe_switcher.missions.${personne.mission}`)}</li>)}</ul>
    <p className="text-sm text-muted-foreground">{t("cabinet9.audit")}</p>
  </Card>;
}
