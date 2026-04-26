import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Header } from "@/components/ebene/Header";
import { MoisNav } from "@/components/ebene/MoisNav";
import { Dashboard } from "@/components/ebene/Dashboard";
import { Comptabilite } from "@/components/ebene/Comptabilite";
import { Fiscalite } from "@/components/ebene/Fiscalite";
import { Factures } from "@/components/ebene/Factures";
import { GRH } from "@/components/ebene/GRH";
import { Stock } from "@/components/ebene/Stock";
import { Immobilisations } from "@/components/ebene/Immobilisations";
import { RecapAnnuelModal } from "@/components/ebene/RecapAnnuelModal";
import { ArchivesModal } from "@/components/ebene/ArchivesModal";
import { FacturePreview } from "@/components/ebene/FacturePreview";
import { useEbeneStore } from "@/hooks/useEbeneStore";
import { Facture } from "@/types/ebene";
import { tauxPourMois } from "@/lib/ebene-utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getAlertes } from "@/lib/alertes";

const Index = () => {
  const now = new Date();
  const [annee, setAnnee] = useState(now.getFullYear());
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [showRecap, setShowRecap] = useState(false);
  const [showArchives, setShowArchives] = useState(false);
  const [previewFacture, setPreviewFacture] = useState<Facture | null>(null);
  const { inServiceCompta, inServiceGrh, isChefCompta, isChefGrh, isAdmin, canViewDashboard } = useAuth();

  const store = useEbeneStore();
  const data = store.getMois(annee, mois);
  const taux = tauxPourMois(store.tauxHistorique, annee, mois);

  const alertes = useMemo(
    () =>
      getAlertes({
        donneesMensuelles: store.donneesMensuelles,
        employes: store.employes,
        articles: store.articles,
      }),
    [store.donneesMensuelles, store.employes, store.articles]
  );

  const exportJSON = () => {
    const payload = {
      version: "1.3",
      exportDate: new Date().toISOString(),
      donneesMensuelles: store.donneesMensuelles,
      employes: store.employes,
      paramsAnnuels: store.paramsAnnuels,
      tauxHistorique: store.tauxHistorique,
      articles: store.articles,
      fournisseurs: store.fournisseurs,
      categoriesStock: store.categoriesStock,
      sanctions: store.sanctions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `EBENE_Archive_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Archive exportée");
  };

  const importJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(String(e.target?.result || ""));
        if (!data || typeof data !== "object") throw new Error("invalide");
        if (!confirm("⚠️ Cela va écraser toutes les données actuelles. Continuer ?")) return;
        store.importerDonnees(data);
        toast.success("Import réussi");
      } catch {
        toast.error("Fichier invalide ou corrompu");
      }
    };
    reader.readAsText(file);
  };

  // Helpers : un no-op + toast pour les actions interdites selon le service
  const blocked = (msg: string) => () => toast.error(msg);
  const blockedId = (msg: string) => (_id: number) => toast.error(msg);

  return (
    <div className="min-h-screen bg-background">
      <Header
        onExport={exportJSON}
        onImport={importJSON}
        onShowRecap={() => setShowRecap(true)}
        onShowArchives={() => setShowArchives(true)}
        lastSaved={store.lastSaved}
        alertes={alertes}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <MoisNav
          mois={mois}
          annee={annee}
          annees={store.anneesDisponibles}
          onMois={setMois}
          onAnnee={setAnnee}
        />

        <div className="card-elevated p-4 sm:p-6 no-print">
          <Tabs defaultValue={canViewDashboard ? "dashboard" : "compta"} className="w-full">
            <TabsList className={`grid grid-cols-2 ${canViewDashboard ? "sm:grid-cols-6" : "sm:grid-cols-5"} w-full mb-5 h-auto`}>
              {canViewDashboard && (
                <TabsTrigger value="dashboard" className="py-2.5 text-sm font-semibold">
                  📊 Dashboard
                </TabsTrigger>
              )}
              <TabsTrigger value="compta" className="py-2.5 text-sm font-semibold">
                💰 Comptabilité
              </TabsTrigger>
              <TabsTrigger value="fisc" className="py-2.5 text-sm font-semibold">
                🧮 Fiscalité
              </TabsTrigger>
              <TabsTrigger value="fact" className="py-2.5 text-sm font-semibold">
                📄 Factures
              </TabsTrigger>
              <TabsTrigger value="stock" className="py-2.5 text-sm font-semibold">
                📦 Stock
              </TabsTrigger>
              <TabsTrigger value="grh" className="py-2.5 text-sm font-semibold">
                👥 GRH
              </TabsTrigger>
            </TabsList>

            {canViewDashboard && (
              <TabsContent value="dashboard">
                <Dashboard
                  donneesMensuelles={store.donneesMensuelles}
                  employes={store.employes}
                  tauxHistorique={store.tauxHistorique}
                  annee={annee}
                  mois={mois}
                />
              </TabsContent>
            )}

            <TabsContent value="compta">
              <Comptabilite
                data={data}
                annee={annee}
                mois={mois}
                employes={store.employes}
                taux={taux}
                onAdd={inServiceCompta
                  ? (t) => store.addTransaction(annee, mois, t)
                  : blocked("Lecture seule : seul le service Comptabilité peut saisir.")}
                onRemove={isChefCompta
                  ? (id) => store.removeTransaction(annee, mois, id)
                  : blockedId("Suppression réservée au chef de service Comptabilité.")}
                isChefCompta={isChefCompta}
                onValider={(id) => store.validerTransaction(annee, mois, id)}
                onRejeter={(id, motif) => store.rejeterTransaction(annee, mois, id, motif)}
              />
            </TabsContent>

            <TabsContent value="fisc">
              <Fiscalite
                data={data}
                employes={store.employes}
                annee={annee}
                mois={mois}
                paramsAnnee={store.getParamAnnuel(annee)}
                onUpdateParams={isChefCompta
                  ? (p) => store.setParamAnnuel(annee, p)
                  : () => toast.error("Modification des paramètres réservée au chef Comptabilité / admin.")}
                donneesMensuelles={store.donneesMensuelles}
                tauxHistorique={store.tauxHistorique}
                onAjouterTaux={isChefCompta ? store.ajouterTaux : () => toast.error("Modification des taux fiscaux réservée au chef Comptabilité / admin.")}
                onSupprimerTaux={isChefCompta ? store.supprimerTaux : () => toast.error("Suppression des taux réservée au chef Comptabilité / admin.")}
              />
            </TabsContent>

            <TabsContent value="fact">
              <Factures
                annee={annee}
                donneesMensuelles={store.donneesMensuelles}
                data={data}
                onAdd={inServiceCompta
                  ? (f) => store.addFacture(annee, mois, f)
                  : ((_f: Omit<Facture, "id">) => { toast.error("Lecture seule : seul le service Comptabilité peut créer une facture."); return 0; })}
                onRemove={isChefCompta
                  ? (id) => store.removeFacture(annee, mois, id)
                  : blockedId("Suppression réservée au chef de service Comptabilité.")}
                onMarquerPayee={inServiceCompta
                  ? (id) => store.marquerPayee(annee, mois, id)
                  : blockedId("Action réservée au service Comptabilité.")}
                onConvertir={inServiceCompta
                  ? (id, num) => store.convertirProforma(annee, mois, id, num)
                  : (() => toast.error("Action réservée au service Comptabilité."))}
                onPreview={setPreviewFacture}
                isChefCompta={isChefCompta}
                onValider={(id) => store.validerFacture(annee, mois, id)}
                onRejeter={(id, motif) => store.rejeterFacture(annee, mois, id, motif)}
                onAddDevis={inServiceCompta
                  ? (d) => store.addDevis(annee, mois, d)
                  : ((_d) => { toast.error("Lecture seule : seul le service Comptabilité peut créer un devis."); return 0; })}
                onRemoveDevis={isChefCompta
                  ? (id) => store.removeDevis(annee, mois, id)
                  : blockedId("Suppression réservée au chef de service Comptabilité.")}
                onConvertirDevis={inServiceCompta
                  ? (id, num) => { store.convertirDevisEnFacture(annee, mois, id, num); }
                  : (() => toast.error("Action réservée au service Comptabilité."))}
              />
            </TabsContent>

            <TabsContent value="stock">
              <Stock
                data={data}
                annee={annee}
                mois={mois}
                articles={store.articles}
                fournisseurs={store.fournisseurs}
                categories={store.categoriesStock}
                onAddArticle={inServiceCompta ? store.addArticle : blocked("Action réservée au service Comptabilité.")}
                onUpdateArticle={inServiceCompta ? store.updateArticle : (() => toast.error("Action réservée au service Comptabilité."))}
                onRemoveArticle={isChefCompta ? store.removeArticle : blockedId("Suppression réservée au chef Comptabilité.")}
                onAddFournisseur={inServiceCompta ? store.addFournisseur : blocked("Action réservée au service Comptabilité.")}
                onRemoveFournisseur={isChefCompta ? store.removeFournisseur : blockedId("Suppression réservée au chef Comptabilité.")}
                onAddCategorie={inServiceCompta ? store.addCategorieStock : blocked("Action réservée au service Comptabilité.")}
                onRemoveCategorie={isChefCompta ? store.removeCategorieStock : blockedId("Suppression réservée au chef Comptabilité.")}
                onAddMouvement={inServiceCompta ? (a, m, mv) => store.addMouvementStock(a, m, mv) : (() => { toast.error("Action réservée au service Comptabilité."); return 0; })}
                onRemoveMouvement={isChefCompta ? store.removeMouvementStock : ((_a: number, _m: number, _id: number) => toast.error("Suppression réservée au chef Comptabilité."))}
              />
            </TabsContent>

            <TabsContent value="grh">
              <GRH
                employes={store.employes}
                data={data}
                annee={annee}
                mois={mois}
                sanctions={store.sanctions}
                isChefGrh={isChefGrh}
                onAddEmploye={inServiceGrh ? store.addEmploye : blocked("Lecture seule : seul le service GRH peut saisir.")}
                onUpdateEmploye={inServiceGrh ? store.updateEmploye : (() => toast.error("Modification réservée au service GRH."))}
                onRemoveEmploye={isChefGrh ? store.removeEmploye : blockedId("Suppression réservée au chef GRH.")}
                onAddPrime={inServiceGrh ? (eid, p) => store.addPrime(annee, mois, eid, p) : (() => toast.error("Action réservée au service GRH."))}
                onRemovePrime={isChefGrh ? (eid, pid) => store.removePrime(annee, mois, eid, pid) : (() => toast.error("Suppression réservée au chef GRH."))}
                onAddAbsence={inServiceGrh ? (a) => store.addAbsence(annee, mois, a) : (() => toast.error("Action réservée au service GRH."))}
                onRemoveAbsence={isChefGrh ? (id) => store.removeAbsence(annee, mois, id) : (() => toast.error("Suppression réservée au chef GRH."))}
                onSetHeuresSup={inServiceGrh ? (eid, hs) => store.setHeuresSup(annee, mois, eid, hs) : (() => toast.error("Action réservée au service GRH."))}
                onSetRetenue={inServiceGrh ? (eid, m) => store.setRetenue(annee, mois, eid, m) : (() => toast.error("Action réservée au service GRH."))}
                onAddSanction={inServiceGrh ? store.addSanction : blocked("Action réservée au service GRH.")}
                onRemoveSanction={isChefGrh ? store.removeSanction : blockedId("Suppression réservée au chef GRH.")}
                onValiderPrime={(eid, pid) => store.validerPrime(annee, mois, eid, pid)}
                onRejeterPrime={(eid, pid, motif) => store.rejeterPrime(annee, mois, eid, pid, motif)}
                onValiderAbsence={(id) => store.validerAbsence(annee, mois, id)}
                onRejeterAbsence={(id, motif) => store.rejeterAbsence(annee, mois, id, motif)}
                onValiderHeuresSup={(eid) => store.validerHeuresSup(annee, mois, eid)}
                onRejeterHeuresSup={(eid, motif) => store.rejeterHeuresSup(annee, mois, eid, motif)}
                onValiderSanction={(id) => store.validerSanction(id)}
                onRejeterSanction={(id, motif) => store.rejeterSanction(id, motif)}
              />
            </TabsContent>
          </Tabs>
        </div>

        <footer className="text-center text-xs text-muted-foreground py-4 no-print">
          EBENE SERVICES — Données stockées localement (sauvegarde auto). Pensez à exporter votre
          archive régulièrement.
        </footer>
      </main>

      <RecapAnnuelModal
        open={showRecap}
        onOpenChange={setShowRecap}
        annee={annee}
        donneesMensuelles={store.donneesMensuelles}
      />
      <ArchivesModal
        open={showArchives}
        onOpenChange={setShowArchives}
        donneesMensuelles={store.donneesMensuelles}
        onJump={(a, m) => {
          setAnnee(a);
          setMois(m);
        }}
      />
      <FacturePreview facture={previewFacture} onClose={() => setPreviewFacture(null)} />
    </div>
  );
};

export default Index;
