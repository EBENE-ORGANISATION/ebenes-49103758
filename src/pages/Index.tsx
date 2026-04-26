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
import { PortailEmploye } from "@/components/employe/PortailEmploye";

const Index = () => {
  const now = new Date();
  const [annee, setAnnee] = useState(now.getFullYear());
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [showRecap, setShowRecap] = useState(false);
  const [showArchives, setShowArchives] = useState(false);
  const [previewFacture, setPreviewFacture] = useState<Facture | null>(null);
  const { perms, can, isEmployeOnly } = useAuth();

  const store = useEbeneStore();
  const data = store.getMois(annee, mois);
  const taux = tauxPourMois(store.tauxHistorique, annee, mois);

  // Employés effectivement intégrés à la paie (validés ou créés avant le
  // workflow de validation — donc statutValidation absent). Les employés
  // 'en_validation' ou 'rejete' sont visibles uniquement côté GRH.
  const employesPaie = useMemo(
    () =>
      store.employes.filter(
        (e) => !e.statutValidation || e.statutValidation === "valide"
      ),
    [store.employes]
  );

  // Compte 'employe' pur → portail self-service uniquement
  if (isEmployeOnly) {
    return <PortailEmploye />;
  }

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
      immobilisations: store.immobilisations,
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

  // Niveaux par module
  const lvlCompta = perms.compta;
  const lvlFact = perms.factures;
  const lvlStock = perms.stock;
  const lvlImmo = perms.immobilisations;
  const lvlFisc = perms.fiscalite;
  const lvlParamSoc = perms.parametres_sociaux;
  const lvlGrh = perms.grh;

  // Helpers permissions
  const comptaWrite = can("compta", "write");
  const comptaValidate = can("compta", "validate");
  const factWrite = can("factures", "write");
  const factValidate = can("factures", "validate");
  const stockWrite = can("stock", "write");
  const stockValidate = can("stock", "validate");
  const immoWrite = can("immobilisations", "write");
  const immoValidate = can("immobilisations", "validate");
  const fiscWrite = can("fiscalite", "write");
  const grhWrite = can("grh", "write");
  const grhValidate = can("grh", "validate");

  // Visibilité des onglets
  const showDashboard = can("dashboard", "read");
  const showCompta = lvlCompta !== "none";
  const showFact = lvlFact !== "none";
  const showStock = lvlStock !== "none";
  const showImmo = lvlImmo !== "none";
  const showFisc = lvlFisc !== "none" || lvlParamSoc !== "none";
  const showGrh = lvlGrh !== "none";

  const visibleTabs = [
    showDashboard, showCompta, showFisc, showFact, showStock, showGrh, showImmo,
  ].filter(Boolean).length;
  const defaultTab = showDashboard
    ? "dashboard"
    : showCompta ? "compta"
    : showFact ? "fact"
    : showStock ? "stock"
    : showGrh ? "grh"
    : showFisc ? "fisc"
    : showImmo ? "immo"
    : "compta";
  const gridCols = visibleTabs >= 7 ? "sm:grid-cols-7"
    : visibleTabs === 6 ? "sm:grid-cols-6"
    : visibleTabs === 5 ? "sm:grid-cols-5"
    : visibleTabs === 4 ? "sm:grid-cols-4"
    : visibleTabs === 3 ? "sm:grid-cols-3"
    : visibleTabs === 2 ? "sm:grid-cols-2"
    : "sm:grid-cols-1";

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
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className={`grid grid-cols-2 ${gridCols} w-full mb-5 h-auto`}>
              {showDashboard && (
                <TabsTrigger value="dashboard" className="py-2.5 text-sm font-semibold">
                  📊 Dashboard
                </TabsTrigger>
              )}
              {showCompta && (
                <TabsTrigger value="compta" className="py-2.5 text-sm font-semibold">
                  💰 Comptabilité
                </TabsTrigger>
              )}
              {showFisc && (
                <TabsTrigger value="fisc" className="py-2.5 text-sm font-semibold">
                  🧮 Fiscalité
                </TabsTrigger>
              )}
              {showFact && (
                <TabsTrigger value="fact" className="py-2.5 text-sm font-semibold">
                  📄 Factures
                </TabsTrigger>
              )}
              {showStock && (
                <TabsTrigger value="stock" className="py-2.5 text-sm font-semibold">
                  📦 Stock
                </TabsTrigger>
              )}
              {showGrh && (
                <TabsTrigger value="grh" className="py-2.5 text-sm font-semibold">
                  👥 GRH
                </TabsTrigger>
              )}
              {showImmo && (
                <TabsTrigger value="immo" className="py-2.5 text-sm font-semibold">
                  🏢 Immobilisations
                </TabsTrigger>
              )}
            </TabsList>

            {showDashboard && (
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

            {showCompta && (
            <TabsContent value="compta">
              <Comptabilite
                data={data}
                annee={annee}
                mois={mois}
                employes={store.employes}
                taux={taux}
                donneesMensuelles={store.donneesMensuelles}
                onAdd={comptaWrite
                  ? (t) => store.addTransaction(annee, mois, t)
                  : blocked("Lecture seule : seul le service Comptabilité peut saisir.")}
                onRemove={comptaValidate
                  ? (id) => store.removeTransaction(annee, mois, id)
                  : blockedId("Suppression réservée au chef de service Comptabilité.")}
                isChefCompta={comptaValidate}
                onValider={(id) => store.validerTransaction(annee, mois, id)}
                onRejeter={(id, motif) => store.rejeterTransaction(annee, mois, id, motif)}
              />
            </TabsContent>
            )}

            {showFisc && (
            <TabsContent value="fisc">
              <Fiscalite
                data={data}
                employes={store.employes}
                annee={annee}
                mois={mois}
                paramsAnnee={store.getParamAnnuel(annee)}
                onUpdateParams={fiscWrite
                  ? (p) => store.setParamAnnuel(annee, p)
                  : () => toast.error("Modification des paramètres réservée au chef Comptabilité / admin.")}
                donneesMensuelles={store.donneesMensuelles}
                tauxHistorique={store.tauxHistorique}
                onAjouterTaux={fiscWrite ? store.ajouterTaux : () => toast.error("Modification des taux fiscaux réservée au chef Comptabilité / admin.")}
                onSupprimerTaux={fiscWrite ? store.supprimerTaux : () => toast.error("Suppression des taux réservée au chef Comptabilité / admin.")}
              />
            </TabsContent>
            )}

            {showFact && (
            <TabsContent value="fact">
              <Factures
                annee={annee}
                donneesMensuelles={store.donneesMensuelles}
                data={data}
                onAdd={factWrite
                  ? (f) => store.addFacture(annee, mois, f)
                  : ((_f: Omit<Facture, "id">) => { toast.error("Lecture seule : seul le service Comptabilité peut créer une facture."); return 0; })}
                onRemove={factValidate
                  ? (id) => store.removeFacture(annee, mois, id)
                  : blockedId("Suppression réservée au chef de service Comptabilité.")}
                onMarquerPayee={factWrite
                  ? (id) => store.marquerPayee(annee, mois, id)
                  : blockedId("Action réservée au service Comptabilité.")}
                onConvertir={factWrite
                  ? (id, num) => store.convertirProforma(annee, mois, id, num)
                  : (() => toast.error("Action réservée au service Comptabilité."))}
                onPreview={setPreviewFacture}
                isChefCompta={factValidate}
                onValider={(id) => store.validerFacture(annee, mois, id)}
                onRejeter={(id, motif) => store.rejeterFacture(annee, mois, id, motif)}
                onAddDevis={factWrite
                  ? (d) => store.addDevis(annee, mois, d)
                  : ((_d) => { toast.error("Lecture seule : seul le service Comptabilité peut créer un devis."); return 0; })}
                onRemoveDevis={factValidate
                  ? (id) => store.removeDevis(annee, mois, id)
                  : blockedId("Suppression réservée au chef de service Comptabilité.")}
                onConvertirDevis={factWrite
                  ? (id, num) => { store.convertirDevisEnFacture(annee, mois, id, num); }
                  : (() => toast.error("Action réservée au service Comptabilité."))}
              />
            </TabsContent>
            )}

            {showStock && (
            <TabsContent value="stock">
              <Stock
                data={data}
                annee={annee}
                mois={mois}
                articles={store.articles}
                fournisseurs={store.fournisseurs}
                categories={store.categoriesStock}
                onAddArticle={stockWrite ? store.addArticle : blocked("Action réservée au service Comptabilité.")}
                onUpdateArticle={stockWrite ? store.updateArticle : (() => toast.error("Action réservée au service Comptabilité."))}
                onRemoveArticle={stockValidate ? store.removeArticle : blockedId("Suppression réservée au chef Comptabilité.")}
                onAddFournisseur={stockWrite ? store.addFournisseur : blocked("Action réservée au service Comptabilité.")}
                onRemoveFournisseur={stockValidate ? store.removeFournisseur : blockedId("Suppression réservée au chef Comptabilité.")}
                onAddCategorie={stockWrite ? store.addCategorieStock : blocked("Action réservée au service Comptabilité.")}
                onRemoveCategorie={stockValidate ? store.removeCategorieStock : blockedId("Suppression réservée au chef Comptabilité.")}
                onAddMouvement={stockWrite ? (a, m, mv) => store.addMouvementStock(a, m, mv) : (() => { toast.error("Action réservée au service Comptabilité."); return 0; })}
                onRemoveMouvement={stockValidate ? store.removeMouvementStock : ((_a: number, _m: number, _id: number) => toast.error("Suppression réservée au chef Comptabilité."))}
              />
            </TabsContent>
            )}

            {showGrh && (
            <TabsContent value="grh">
              <GRH
                employes={store.employes}
                data={data}
                annee={annee}
                mois={mois}
                sanctions={store.sanctions}
                isChefGrh={grhValidate}
                onAddEmploye={grhWrite ? store.addEmploye : blocked("Lecture seule : seul le service GRH peut saisir.")}
                onUpdateEmploye={grhWrite ? store.updateEmploye : (() => toast.error("Modification réservée au service GRH."))}
                onRemoveEmploye={grhValidate ? store.removeEmploye : blockedId("Suppression réservée au chef GRH.")}
                onAddPrime={grhWrite ? (eid, p) => store.addPrime(annee, mois, eid, p) : (() => toast.error("Action réservée au service GRH."))}
                onRemovePrime={grhValidate ? (eid, pid) => store.removePrime(annee, mois, eid, pid) : (() => toast.error("Suppression réservée au chef GRH."))}
                onAddAbsence={grhWrite ? (a) => store.addAbsence(annee, mois, a) : (() => toast.error("Action réservée au service GRH."))}
                onRemoveAbsence={grhValidate ? (id) => store.removeAbsence(annee, mois, id) : (() => toast.error("Suppression réservée au chef GRH."))}
                onSetHeuresSup={grhWrite ? (eid, hs) => store.setHeuresSup(annee, mois, eid, hs) : (() => toast.error("Action réservée au service GRH."))}
                onSetRetenue={grhWrite ? (eid, m) => store.setRetenue(annee, mois, eid, m) : (() => toast.error("Action réservée au service GRH."))}
                onAddSanction={grhWrite ? store.addSanction : blocked("Action réservée au service GRH.")}
                onRemoveSanction={grhValidate ? store.removeSanction : blockedId("Suppression réservée au chef GRH.")}
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
            )}

            {showImmo && (
            <TabsContent value="immo">
              <Immobilisations
                annee={annee}
                immobilisations={store.immobilisations}
                onAdd={immoWrite
                  ? store.addImmobilisation
                  : ((_i) => { toast.error("Action réservée au chef Comptabilité / admin."); return 0; })}
                onRemove={immoValidate
                  ? store.removeImmobilisation
                  : blockedId("Suppression réservée au chef Comptabilité / admin.")}
                canEdit={immoWrite}
              />
            </TabsContent>
            )}
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
        immobilisations={store.immobilisations}
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
