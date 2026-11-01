import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDossiersCabinet } from "@/hooks/useDossiersCabinet";
import { useMarquerDeclaration, useTableauCabinet } from "@/hooks/data/useTableauCabinet";
import { permissionsMission } from "@/lib/missionCabinet";
import { etatsEcheance, periodeParDefaut, type DossierTableauCabinet, type EcheanceCabinet } from "@/lib/tableauCabinet";

export function TableauCabinet() {
  const { t, i18n } = useTranslation();
  const [periode, definirPeriode] = useState(() => periodeParDefaut(new Date()));
  const { dossiers: mesDossiers } = useDossiersCabinet();
  const requete = useTableauCabinet(periode.annee, periode.mois);
  const mutation = useMarquerDeclaration();
  const [choix, definirChoix] = useState<string | null>(null);
  const langue = i18n.resolvedLanguage ?? "fr";
  // Les dates SQL sont civiles : les construire localement évite un décalage de jour.
  const date = (valeur: string) => {
    const [annee, mois, jour] = valeur.split("-").map(Number);
    return new Date(annee, mois - 1, jour).toLocaleDateString(langue);
  };
  const nomMois = (mois: number) => new Date(2026, mois - 1, 1).toLocaleDateString(langue, { month: "long" });
  const echeance = (dossier: DossierTableauCabinet, declaration: EcheanceCabinet) => {
    const style = etatsEcheance[declaration.etat];
    // Mission effective du membre connecté (celle de son attribution), comme les règles d'accès.
    const lien = mesDossiers.find(d => d.societe_id === dossier.societe_id);
    const niveau = lien ? permissionsMission(lien.mission, lien.mon_role, lien.etat).fiscalite : "none";
    const modifiable = (niveau === "write" || niveau === "validate") && ["a_faire", "en_retard"].includes(declaration.etat);
    const cle = `${dossier.dossier_id}-${declaration.type}`;
    const libelle = t(`tableau_cabinet.types.${declaration.type}`);
    const contenu = <><span className="font-medium">{libelle}</span><Badge className={style.couleur}>{t(style.libelle)}</Badge></>;
    return <div key={declaration.type} className="space-y-1">
      {modifiable ? <Popover open={choix === cle} onOpenChange={ouvert => definirChoix(ouvert ? cle : null)}>
        <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-auto flex-wrap gap-2 whitespace-normal" disabled={mutation.isPending} aria-label={`${dossier.societe_nom} — ${libelle} — ${t(style.libelle)}`}>{contenu}</Button></PopoverTrigger>
        <PopoverContent className="w-auto space-y-2" aria-label={libelle}>
          <p className="text-sm font-medium">{libelle} — {dossier.societe_nom}</p>
          <div className="flex gap-2">{(["deposee", "payee"] as const).map(statut => <Button key={statut} size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({
            societe_id: dossier.societe_id, annee: declaration.annee, mois: declaration.mois, type: declaration.type, statut,
          }, { onSuccess: () => definirChoix(null) })}>{t(`tableau_cabinet.${statut}`)}</Button>)}</div>
        </PopoverContent>
      </Popover> : <div className="flex flex-wrap items-center gap-2 text-sm">{contenu}</div>}
      {declaration.echeance && <p className="text-xs text-muted-foreground">{t("tableau_cabinet.echeance", { date: date(declaration.echeance) })}</p>}
      {declaration.etat === "faite" && declaration.marquee && <p className="text-xs text-muted-foreground">{t("tableau_cabinet.marquee", {
        statut: t(`tableau_cabinet.${declaration.marquee.statut}`), nom: declaration.marquee.par_nom ?? t("tableau_cabinet.auteur_inconnu"), date: date(declaration.marquee.date),
      })}</p>}
    </div>;
  };
  return <div className="space-y-6">
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">{t("tableau_cabinet.mois")}<select className="block rounded border bg-background p-2" value={periode.mois} onChange={evenement => { definirChoix(null); definirPeriode({ ...periode, mois: Number(evenement.target.value) }); }}>
        {Array.from({ length: 12 }, (_, indice) => <option key={indice + 1} value={indice + 1}>{nomMois(indice + 1)}</option>)}
      </select></label>
      <label className="text-sm">{t("tableau_cabinet.annee")}<input type="number" min={1} max={9998} className="block w-28 rounded border bg-background p-2" value={periode.annee} onChange={evenement => {
        const annee = Number(evenement.target.value);
        if (Number.isInteger(annee) && annee >= 1 && annee <= 9998) { definirChoix(null); definirPeriode({ ...periode, annee }); }
      }} /></label>
    </div>
    {requete.isLoading ? <p role="status">{t("tableau_cabinet.chargement")}</p> : requete.isError ? <p role="alert">{t("tableau_cabinet.erreur")}</p> : requete.data && <>
      {requete.data.dossiers.length === 0 ? <p>{t("tableau_cabinet.vide")}</p> : <table role="table" className="block w-full md:table md:table-fixed">
        <caption className="sr-only">{t("tableau_cabinet.titre")}</caption>
        <thead role="rowgroup" className="sr-only md:not-sr-only md:table-header-group"><tr role="row">{["dossier", "echeances", "pieces", "avancement"].map(cle => <th scope="col" role="columnheader" key={cle} className="p-3 text-left">{t(`tableau_cabinet.${cle}`)}</th>)}</tr></thead>
        <tbody role="rowgroup" className="block space-y-4 md:table-row-group md:space-y-0">{requete.data.dossiers.map(dossier => {
          const pieces = dossier.pieces;
          const avancement = dossier.avancement;
          return <tr role="row" key={dossier.dossier_id} className="block rounded-lg border p-3 md:table-row md:p-0">
            <td role="cell" className="block min-w-0 space-y-2 p-3 align-top md:table-cell"><p className="break-words font-semibold">{dossier.societe_nom}</p><Badge>{t(`societe_switcher.missions.${dossier.mission}`)}</Badge></td>
            <td role="cell" className="block space-y-3 p-3 align-top md:table-cell">{dossier.echeances.map(declaration => echeance(dossier, declaration))}</td>
            <td role="cell" className="block space-y-2 p-3 align-top md:table-cell"><p>{t("tableau_cabinet.total_pieces", { nombre: pieces.transactions + pieces.factures + pieces.ecritures_brouillon + pieces.sans_justificatif })}</p><p className="text-xs text-muted-foreground">{t("tableau_cabinet.detail_pieces", pieces)}</p></td>
            <td role="cell" className="block space-y-2 p-3 align-top md:table-cell text-sm">
              <p>{t("tableau_cabinet.dernier_mois", { mois: avancement.dernier_mois ?? t("tableau_cabinet.aucune_saisie") })}</p>
              <p>{t("tableau_cabinet.bulletins", { faits: avancement.bulletins_faits, attendus: avancement.bulletins_attendus })}</p>
              <p>{t(avancement.exercice_precedent_cloture ? "tableau_cabinet.exercice_cloture" : "tableau_cabinet.exercice_ouvert", { annee: periode.annee - 1 })}</p>
            </td>
          </tr>;
        })}</tbody>
      </table>}
      {requete.data.charge !== null && <section className="space-y-3" aria-labelledby="charge-equipe">
        <h3 id="charge-equipe" className="text-lg font-semibold">{t("tableau_cabinet.charge")}</h3>
        <ul className="grid gap-3 sm:grid-cols-2">{requete.data.charge.map(membre => <li key={membre.user_id} className="space-y-1 rounded-lg border p-4">
          <p className="break-words font-medium">{membre.nom}</p><p className="text-sm">{t(`cabinet.roles.${membre.role}`)}</p><p className="text-sm text-muted-foreground">{t("tableau_cabinet.charge_membre", membre)}</p>
        </li>)}</ul>
      </section>}
    </>}
  </div>;
}
