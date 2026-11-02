import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cabinetOps, type MissionCabinet } from "@/lib/cabinetOps";
import { missionsCabinet } from "@/lib/missionCabinet";
import { messageErreur } from "@/lib/ebene-utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BoutonConfirme } from "@/components/cabinet/BoutonConfirme";

/** Monté uniquement pour un administrateur du dossier ouvert. */
export function MonCabinetClient({ societeId }: { societeId: string }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const cache = useQueryClient();
  const [cabinet, definirCabinet] = useState("");
  const [mission, definirMission] = useState<MissionCabinet>("tenue_complete");
  const [motif, definirMotif] = useState("");
  const lecture = useQuery({
    queryKey: ["cabinet_client", user?.id, societeId], enabled: !!user,
    staleTime: 0, refetchInterval: 30_000, refetchOnMount: "always",
    queryFn: async () => {
      const { data: lien, error } = await supabase.from("cabinet_dossiers").select("*, cabinets(nom)").eq("societe_id", societeId).neq("etat", "termine").maybeSingle();
      if (error) throw error;
      if (!lien) return null;
      return { lien, collaborateurs: lien.etat === "invitation" ? [] : await cabinetOps.collaborateursDossier(societeId) };
    },
  });
  const annuaire = useQuery({
    queryKey: ["cabinets_annuaire", user?.id], enabled: !!user && lecture.isSuccess && lecture.data === null,
    queryFn: () => cabinetOps.annuaire(),
  });
  const mutation = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => { await Promise.all(["cabinet_client", "cabinet", "cabinets_admin", "dossiers_cabinet"].map(cle => cache.invalidateQueries({ queryKey: [cle] }))); },
    onError: erreur => toast.error(messageErreur(erreur, t("cabinet.erreur"))),
  });
  if (lecture.isError) return <p role="alert">{t("cabinet.erreur")}</p>;
  if (lecture.isPending) return <p role="status">{t("cabinet.chargement")}</p>;
  if (!lecture.data) return <Card className="space-y-3 p-6">
    <h2 className="text-xl font-semibold">{t("cabinet.titre")}</h2>
    <h3>{t("cabinet10.inviter")}</h3>
    {annuaire.isPending && <p role="status">{t("cabinet.chargement")}</p>}
    {annuaire.isError && <p role="alert">{t("cabinet.erreur")}</p>}
    {annuaire.isSuccess && (annuaire.data.length === 0 ? <p>{t("cabinet10.annuaire_vide")}</p> :
      <form className="space-y-3" onSubmit={evenement => { evenement.preventDefault(); mutation.mutate(() => cabinetOps.inviter(societeId, cabinet, mission)); }}>
        <label className="block">{t("cabinet10.cabinet")}<select required className="ml-3 rounded border bg-background p-2" value={cabinet} onChange={e => definirCabinet(e.target.value)}>
          <option value="">{t("cabinet10.choisir")}</option>{annuaire.data.map(entree => <option key={entree.id} value={entree.id}>{entree.nom}</option>)}
        </select></label>
        <label className="block">{t("cabinet9.mission")}<select className="ml-3 rounded border bg-background p-2" value={mission} onChange={e => definirMission(e.target.value as MissionCabinet)}>{missionsCabinet.map(valeur => <option key={valeur} value={valeur}>{t(`societe_switcher.missions.${valeur}`)}</option>)}</select></label>
        <Button disabled={mutation.isPending || !cabinet}>{t("cabinet10.inviter")}</Button>
      </form>)}
  </Card>;
  const { lien, collaborateurs } = lecture.data;
  return <Card className="space-y-3 p-6">
    <h2 className="text-xl font-semibold">{t("cabinet.titre")}</h2>
    {lien.etat === "invitation" ? <>
      <p>{t("cabinet10.invitation_attente", { cabinet: lien.cabinets?.nom })}</p>
      <BoutonConfirme disabled={mutation.isPending} message={t("cabinet10.confirmer_retrait")} onConfirmer={() => mutation.mutate(() => cabinetOps.annulerInvitation(lien.id))}>{t("cabinet10.retirer")}</BoutonConfirme>
    </> : lien.etat === "depart_demande" ? <>
      <p>{lien.cabinets?.nom}</p>
      <p>{t("cabinet10.depart_attente", { date: new Date(lien.depart_demande_le!).toLocaleDateString(i18n.language) })}</p>
    </> : <>
    <p>{lien.cabinets?.nom}</p>
    <p>{t("cabinet9.depuis", { date: new Date(lien.created_at).toLocaleDateString(i18n.language) })} — {t(`cabinet.etats.${lien.etat}`)}</p>
    <label className="block">{t("cabinet9.mission")}<select className="ml-3 rounded border bg-background p-2" value={lien.mission} disabled={mutation.isPending} onChange={e => { const nouvelleMission = e.target.value as MissionCabinet; mutation.mutate(() => cabinetOps.changerMission(lien.id, nouvelleMission)); }}>{missionsCabinet.map(mission => <option key={mission} value={mission}>{t(`societe_switcher.missions.${mission}`)}</option>)}</select></label>
    <label className="block">{t("cabinet10.motif")}<textarea className="block w-full rounded border bg-background p-2" maxLength={500} value={motif} onChange={e => definirMotif(e.target.value)} /></label>
    <BoutonConfirme disabled={mutation.isPending} message={t("cabinet10.confirmer_depart")} onConfirmer={() => mutation.mutate(() => cabinetOps.demanderDepart(lien.id, motif))}>{t("cabinet10.demander_depart")}</BoutonConfirme>
    </>}
    {lien.etat !== "invitation" && <>
    <ul>{collaborateurs.map(personne => <li key={personne.user_id}>{personne.nom} — {t(`cabinet.roles.${personne.role}`)} — {t(`societe_switcher.missions.${personne.mission}`)}</li>)}</ul>
    <p className="text-sm text-muted-foreground">{t("cabinet9.audit")}</p>
    </>}
  </Card>;
}
