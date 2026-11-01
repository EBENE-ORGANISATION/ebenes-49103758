import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useCabinetsAdmin } from "@/hooks/data/useCabinetsAdmin";
import { cabinetOps, type MissionCabinet } from "@/lib/cabinetOps";
import { missionsCabinet } from "@/lib/missionCabinet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export function CabinetsPanel() {
  const { t } = useTranslation();
  const { donnees, erreur, chargement, executer, enCours } = useCabinetsAdmin();
  const [nom, definirNom] = useState("");
  const [responsable, definirResponsable] = useState("");
  const [limite, definirLimite] = useState(10);
  const [invitation, definirInvitation] = useState<string | null>(null);
  const [email, definirEmail] = useState("");
  const [nomClient, definirNomClient] = useState("");
  const lancer = (operation: () => Promise<unknown>) => { void executer(operation).catch(() => {}); };
  if (erreur) return <p role="alert">{t("cabinet.erreur")}</p>;
  if (chargement || !donnees) return <p role="status">{t("cabinet.chargement")}</p>;
  const creer = (evenement: FormEvent) => {
    evenement.preventDefault();
    lancer(async () => { await cabinetOps.creerCabinet(nom.trim(), responsable, limite); definirNom(""); });
  };
  return <div className="space-y-6">
    <form onSubmit={creer} className="flex flex-wrap items-end gap-3">
      <label>{t("cabinet.nom")}<Input required value={nom} onChange={e => definirNom(e.target.value)} /></label>
      <label>{t("cabinet9.responsable")}<select required className="block rounded border bg-background p-2" value={responsable} onChange={e => definirResponsable(e.target.value)}><option value="">{t("cabinet9.choisir")}</option>{donnees.comptes.filter(compte => !compte.roles.includes("admin_general")).map(compte => <option key={compte.id} value={compte.id}>{compte.profile?.nom || compte.email || compte.id}</option>)}</select></label>
      <label>{t("cabinet9.limite")}<Input type="number" min={0} required value={limite} onChange={e => definirLimite(Number(e.target.value))} /></label>
      <Button disabled={enCours || !nom.trim()}>{t("cabinet9.creer")}</Button>
    </form>
    {donnees.cabinets.map(cabinet => {
      const dossiers = donnees.dossiers.filter(d => d.cabinet_id === cabinet.id && d.etat !== "termine");
      const membres = donnees.equipes.find(e => e.cabinetId === cabinet.id)?.membres ?? [];
      return <Card key={cabinet.id} className="space-y-4 p-5">
        <h2 className="text-xl font-semibold">{cabinet.nom} — {dossiers.length} / {cabinet.max_dossiers} — {t(cabinet.actif ? "cabinet.actif" : "cabinet.inactif")}</h2>
        <p>{t("cabinet9.responsable")} : {membres.filter(m => m.role === "responsable" && m.actif).map(m => m.nom).join(", ")}</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={evenement => {
          evenement.preventDefault(); const valeurs = new FormData(evenement.currentTarget);
          lancer(() => cabinetOps.rattacher(cabinet.id, String(valeurs.get("societe")), String(valeurs.get("mission")) as MissionCabinet));
        }}>
          <label>{t("cabinet9.societe")}<select required name="societe" className="block rounded border bg-background p-2"><option value="">{t("cabinet9.choisir")}</option>{donnees.societes.filter(s => s.id !== cabinet.societe_propre_id && !donnees.dossiers.some(d => d.societe_id === s.id && d.etat !== "termine")).map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></label>
          <label>{t("cabinet9.mission")}<select name="mission" className="block rounded border bg-background p-2">{missionsCabinet.map(m => <option key={m} value={m}>{t(`societe_switcher.missions.${m}`)}</option>)}</select></label>
          <Button disabled={enCours || !cabinet.actif}>{t("cabinet9.rattacher")}</Button>
        </form>
        {dossiers.map(dossier => {
          const administrateur = donnees.comptes.some(compte => compte.roles.includes("admin") && compte.societes.some(s => s.societe_id === dossier.societe_id));
          const doubles = membres.filter(m => donnees.comptes.some(compte => compte.id === m.user_id && compte.societes.some(s => s.societe_id === dossier.societe_id)));
          return <div key={dossier.id} className="space-y-2 rounded border p-3">
            <h3>{donnees.societes.find(s => s.id === dossier.societe_id)?.nom ?? dossier.societe_id} — {t(`cabinet.etats.${dossier.etat}`)}</h3>
            <label>{t("cabinet9.mission")}<select className="ml-3 rounded border bg-background p-2" value={dossier.mission} disabled={enCours} onChange={e => { const mission = e.target.value as MissionCabinet; lancer(() => cabinetOps.changerMission(dossier.id, mission)); }}>{missionsCabinet.map(m => <option key={m} value={m}>{t(`societe_switcher.missions.${m}`)}</option>)}</select></label>
            {doubles.map(m => <p role="status" key={m.user_id}>{t("cabinet9.double", { nom: m.nom })}</p>)}
            {!administrateur && <Button variant="outline" disabled={enCours} onClick={() => { definirInvitation(dossier.societe_id); definirEmail(""); definirNomClient(""); }}>{t("cabinet9.inviter")}</Button>}
            {invitation === dossier.societe_id && !administrateur && <form className="flex flex-wrap items-end gap-3" onSubmit={evenement => {
              evenement.preventDefault(); lancer(async () => {
                const resultat = await cabinetOps.inviterAdminClient({ societeId: dossier.societe_id, email: email.trim(), nom: nomClient.trim() });
                if (!resultat.email_envoye) toast.warning(t("cabinet.email_non_envoye"));
                definirInvitation(null);
              });
            }}><label>{t("cabinet.email")}<Input type="email" required value={email} onChange={e => definirEmail(e.target.value)} /></label><label>{t("cabinet.nom")}<Input value={nomClient} onChange={e => definirNomClient(e.target.value)} /></label><Button disabled={enCours}>{t("cabinet9.envoyer")}</Button><Button type="button" variant="ghost" onClick={() => definirInvitation(null)}>{t("cabinet9.annuler")}</Button></form>}
          </div>;
        })}
        {membres.map(m => <div key={m.user_id} className="flex flex-wrap items-center gap-3"><span>{m.nom} — {t(`cabinet.roles.${m.role}`)} — {t(m.actif ? "cabinet.actif" : "cabinet.inactif")}</span>{!(m.role === "responsable" && m.actif) && <Button variant="destructive" disabled={enCours} onClick={() => { if (window.confirm(t("cabinet.confirmer_retrait", { nom: m.nom }))) lancer(() => cabinetOps.detacherMembre(cabinet.id, m.user_id)); }}>{t("cabinet9.detacher")}</Button>}</div>)}
      </Card>;
    })}
  </div>;
}
