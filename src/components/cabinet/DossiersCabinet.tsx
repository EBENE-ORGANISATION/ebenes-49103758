import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cabinetOps, type FormeJuridiqueDossier } from "@/lib/cabinetOps";
import type { useCabinet } from "@/hooks/data/useCabinet";
import { AttributionsDossier } from "./AttributionsDossier";

export function DossiersCabinet({ donnees }: { donnees: ReturnType<typeof useCabinet> }) {
  const { t } = useTranslation();
  const [creation, definirCreation] = useState(false);
  const responsable = donnees.role === "responsable";
  const nombre = donnees.dossiers.filter(d => d.etat !== "termine").length;
  const limite = nombre >= (donnees.cabinet?.max_dossiers ?? 0);
  const creer = async (evenement: FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    const champs = new FormData(evenement.currentTarget);
    const valeur = (cle: string) => String(champs.get(cle) ?? "").trim();
    try {
      await donnees.executer(() => cabinetOps.creerDossier(donnees.cabinet!.id, valeur("nom"), { nif: valeur("nif"), rccm: valeur("rccm"), formeJuridique: (valeur("forme") || null) as FormeJuridiqueDossier | null, debutExercice: valeur("debut") || null }));
      definirCreation(false);
    } catch { /* Le refus de la base est affiché par useCabinet. */ }
  };
  return <div className="space-y-4">
    {responsable && <>
      <p>{nombre} / {donnees.cabinet?.max_dossiers}</p>
      <Button disabled={limite || donnees.enCours} aria-describedby={limite ? "limite-dossiers" : undefined} onClick={() => definirCreation(true)}>{t("cabinet.nouveau")}</Button>
      {limite && <p id="limite-dossiers">{t("cabinet.limite", { max: donnees.cabinet?.max_dossiers })}</p>}
      {creation && <form className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2" onSubmit={creer}>
        <label>{t("cabinet.nom_client")}<Input name="nom" required maxLength={200} /></label>
        <label>NIF<Input name="nif" maxLength={50} /></label>
        <label>RCCM<Input name="rccm" maxLength={100} /></label>
        <label>{t("cabinet.forme")}<select name="forme" className="block w-full rounded border bg-background p-2"><option value="">—</option>{["SA_PUBLIQUE", "SA", "SARL", "SCS", "SNC", "SP", "GIE", "ASSOCIATION", "SAS", "EI", "AUTRE"].map(f => <option key={f}>{f}</option>)}</select></label>
        <label>{t("cabinet.debut")}<Input name="debut" type="date" min="1900-01-01" max="2100-12-31" /></label>
        <div className="flex gap-2"><Button type="submit" disabled={limite || donnees.enCours}>{t("cabinet.creer")}</Button><Button type="button" variant="outline" onClick={() => definirCreation(false)}>{t("common.cancel")}</Button></div>
      </form>}
    </>}
    {donnees.dossiers.length === 0 && <p>{t("cabinet.aucun_dossier")}</p>}
    {donnees.dossiers.map(dossier => <Card key={dossier.id}>
      <CardHeader><CardTitle className="break-words">{dossier.nom}</CardTitle><div className="flex flex-wrap gap-2"><Badge>{t(`societe_switcher.missions.${dossier.mission}`)}</Badge><Badge variant="outline">{t(`cabinet.etats.${dossier.etat}`)}</Badge></div></CardHeader>
      <CardContent className="space-y-4">
        {responsable && <p className="text-sm text-muted-foreground">{t("cabinet.support_admin")}</p>}
        {responsable && dossier.etat !== "termine" && <AttributionsDossier dossier={dossier} membres={donnees.membres} attributions={donnees.attributions} executer={donnees.executer} enCours={donnees.enCours} />}
      </CardContent>
    </Card>)}
  </div>;
}
