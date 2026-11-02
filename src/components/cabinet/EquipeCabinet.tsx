import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cabinetOps, type RoleCabinet } from "@/lib/cabinetOps";
import type { MembreCabinet } from "@/hooks/data/useCabinet";
import type { ActionsCabinet } from "./AttributionsDossier";
import { toast } from "sonner";
import { BoutonConfirme } from "@/components/cabinet/BoutonConfirme";

export function EquipeCabinet({ cabinetId, membres, executer, enCours }: ActionsCabinet & { cabinetId: string; membres: MembreCabinet[] }) {
  const { t } = useTranslation();
  const [email, definirEmail] = useState("");
  const [nom, definirNom] = useState("");
  const [role, definirRole] = useState<RoleCabinet>("collaborateur");
  const envoyer = async (evenement: FormEvent) => {
    evenement.preventDefault();
    try {
      await executer(async () => {
        const resultat = await cabinetOps.ajouterMembre({ email: email.trim(), nom: nom.trim(), role });
        if (!resultat.email_envoye) toast.warning(t("cabinet.email_non_envoye"));
      });
      definirEmail(""); definirNom("");
    } catch { /* L'erreur Edge reste générique et est affichée par useCabinet. */ }
  };
  return <div className="space-y-6">
    <form onSubmit={envoyer} className="flex flex-wrap items-end gap-3">
      <label>{t("cabinet.email")}<Input type="email" required value={email} onChange={e => definirEmail(e.target.value)} /></label>
      <label>{t("cabinet.nom")}<Input value={nom} onChange={e => definirNom(e.target.value)} /></label>
      <label>{t("cabinet.role")}<select className="block rounded border bg-background p-2" value={role} onChange={e => definirRole(e.target.value as RoleCabinet)}>{["responsable", "collaborateur", "stagiaire"].map(r => <option key={r} value={r}>{t(`cabinet.roles.${r}`)}</option>)}</select></label>
      <Button disabled={enCours} type="submit">{t("cabinet.ajouter")}</Button>
    </form>
    {membres.map(membre => <div key={membre.user_id} className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
      <span className="min-w-0 break-all">{membre.nom} — {t(membre.actif ? "cabinet.actif" : "cabinet.inactif")}</span>
      <select className="rounded border bg-background p-2" aria-label={t("cabinet.role_de", { nom: membre.nom })} value={membre.role} disabled={enCours} onChange={e => { const nouveauRole = e.target.value as RoleCabinet; void executer(() => cabinetOps.definirMembre(cabinetId, membre.user_id, nouveauRole, membre.actif)).catch(() => {}); }}>
        {["responsable", "collaborateur", "stagiaire"].map(r => <option key={r} value={r}>{t(`cabinet.roles.${r}`)}</option>)}
      </select>
      <Button variant="outline" disabled={enCours} onClick={() => void executer(() => cabinetOps.definirMembre(cabinetId, membre.user_id, membre.role, !membre.actif)).catch(() => {})}>{t(membre.actif ? "cabinet.desactiver" : "cabinet.reactiver")}</Button>
      <Button variant="outline" disabled={enCours} onClick={() => void executer(() => cabinetOps.renvoyerInvitation(membre.user_id)).catch(() => {})}>{t("cabinet.renvoyer")}</Button>
      {membre.deja_connecte === false && !(membre.role === "responsable" && membre.actif) && <BoutonConfirme variant="destructive" disabled={enCours} message={t("cabinet.confirmer_retrait", { nom: membre.nom })} onConfirmer={() => void executer(() => cabinetOps.detacherMembre(cabinetId, membre.user_id)).catch(() => {})}>{t("cabinet.retirer")}</BoutonConfirme>}
    </div>)}
  </div>;
}
