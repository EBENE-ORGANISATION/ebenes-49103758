import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCabinet } from "@/hooks/data/useCabinet";
import { useLienAccueil } from "@/hooks/useTenant";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EquipeCabinet } from "@/components/cabinet/EquipeCabinet";
import { DossiersCabinet } from "@/components/cabinet/DossiersCabinet";

export default function Cabinet() {
  const donnees = useCabinet();
  const { t } = useTranslation();
  const accueil = useLienAccueil();
  return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
    <Link to={accueil}>{t("cabinet.accueil")}</Link>
    <h1 className="text-2xl font-bold">{t("cabinet.titre")}</h1>
    {donnees.isLoading ? <p role="status">{t("cabinet.chargement")}</p> : donnees.isError ? <p role="alert">{t("cabinet.erreur")}</p> : !donnees.cabinet ? <p>{t("cabinet.interdit")}</p> : <>
      <h2 className="text-xl">{donnees.cabinet.nom}</h2>
      <Tabs defaultValue="dossiers">
        <TabsList><TabsTrigger value="dossiers">{t("cabinet.dossiers")}</TabsTrigger>{donnees.role === "responsable" && <TabsTrigger value="equipe">{t("cabinet.equipe")}</TabsTrigger>}</TabsList>
        <TabsContent value="dossiers"><DossiersCabinet donnees={donnees} /></TabsContent>
        {donnees.role === "responsable" && <TabsContent value="equipe"><EquipeCabinet cabinetId={donnees.cabinet.id} membres={donnees.membres} executer={donnees.executer} enCours={donnees.enCours} /></TabsContent>}
      </Tabs>
    </>}
  </main>;
}
