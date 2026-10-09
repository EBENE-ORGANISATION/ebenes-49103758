import { useState, useMemo, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/ebene/Header";
import { MoisNav } from "@/components/ebene/MoisNav";
import { Dashboard } from "@/components/ebene/Dashboard";
import { RecapAnnuelModal } from "@/components/ebene/RecapAnnuelModal";
import { ArchivesModal } from "@/components/ebene/ArchivesModal";
import { FacturePreview } from "@/components/ebene/FacturePreview";
import { SupabaseStatus } from "@/components/ebene/SupabaseStatus";
import { UpdateBanner } from "@/components/ebene/UpdateBanner";
import { OfflineBanner } from "@/components/ebene/OfflineBanner";
import { Skeleton } from "@/components/ui/skeleton";
import { useEbeneStoreRemote as useEbeneStore, nettoyerAncienCacheLocalStorage } from "@/hooks/useEbeneStoreRemote";
import { Facture } from "@/types/ebene";
import { tauxPourMois, todayISO } from "@/lib/ebene-utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getAlertes } from "@/lib/alertes";
import { useTenant } from "@/hooks/useTenant";
import { useActivites } from "@/hooks/data/useActivites";
import { useActiviteFilter } from "@/hooks/useActiviteFilter";
import { UpdateNotifier } from "@/components/electron/UpdateNotifier";
import { isElectron } from "@/lib/platform";
import { partActivite } from "@/lib/resultatActivites";

// ── Lazy-loaded : chargé uniquement pour les comptes "employé pur" ───────────
const PortailEmploye = lazy(() =>
  import("@/components/employe/PortailEmploye").then((m) => ({ default: m.PortailEmploye }))
);

// ── Onglets chargés à l'ouverture (Radix démonte les onglets inactifs) ──────
// Évite de télécharger jsPDF / xlsx / modules métier avant le premier affichage.
const Comptabilite = lazy(() => import("@/components/ebene/Comptabilite").then((m) => ({ default: m.Comptabilite })));
const Fiscalite = lazy(() => import("@/components/ebene/Fiscalite").then((m) => ({ default: m.Fiscalite })));
const Factures = lazy(() => import("@/components/ebene/Factures").then((m) => ({ default: m.Factures })));
const GRH = lazy(() => import("@/components/ebene/GRH").then((m) => ({ default: m.GRH })));
const MonPortail = lazy(() => import("@/components/ebene/MonPortail").then((m) => ({ default: m.MonPortail })));
const Stock = lazy(() => import("@/components/ebene/Stock").then((m) => ({ default: m.Stock })));
const Immobilisations = lazy(() => import("@/components/ebene/Immobilisations").then((m) => ({ default: m.Immobilisations })));

const PortalFallback = () => (
  <div className="p-8 space-y-3">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const Index = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const now = new Date();
  const [annee, setAnnee] = useState(now.getFullYear());
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [showRecap, setShowRecap] = useState(false);
  const [showArchives, setShowArchives] = useState(false);
  const [previewFacture, setPreviewFacture] = useState<Facture | null>(null);
  const { perms, can, isEmployeOnly, isEmploye } = useAuth();
  const { societeConfig, currentSociete, isSuperAdmin, societes } = useTenant();

  const effectiveSocieteId = currentSociete?.id ?? null;
  const qc = useQueryClient();

  // ─── Compartiment d'activité courant ──────────────────────────────────────
  const { activites } = useActivites(effectiveSocieteId);
  const { currentActiviteId } = useActiviteFilter();
  // On ne retient l'activité de l'URL que si elle appartient à la société.
  const validActiviteId = useMemo(
    () => (activites.some((a) => a.id === currentActiviteId) ? currentActiviteId : null),
    [activites, currentActiviteId],
  );

  // ─── Purge globale du cache React Query au changement de société ──────────
  // • Quand l'ID change (null → A, A → B, B → A) : supprime le cache de
  //   l'ancienne société pour éviter tout affichage de données croisées.
  // • Premier montage avec un ID valide : invalide tout le cache de cette
  //   société pour forcer un rechargement propre depuis Supabase.
  const prevSidRef = useRef<string | null | undefined>(undefined); // undefined = pas encore initialisé
  useEffect(() => {
    const prev = prevSidRef.current;
    const current = effectiveSocieteId;

    if (prev === undefined) {
      // Premier rendu avec une société : invalide pour forcer un fetch frais
      if (current) {
        qc.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return Array.isArray(key) && key[1] === current;
          },
        });
      }
    } else if (prev !== null && prev !== current) {
      // Changement de société : efface entièrement le cache de l'ancienne
      qc.removeQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[1] === prev;
        },
      });
    }

    prevSidRef.current = current;
  }, [effectiveSocieteId, qc]);

  const store = useEbeneStore(effectiveSocieteId, {
    activiteId: validActiviteId,
  });
  useEffect(() => {
    if (currentSociete?.id) {
      nettoyerAncienCacheLocalStorage(currentSociete.id);
    }
  }, [currentSociete?.id]);
  const data = store.getMois(annee, mois);
  const taux = tauxPourMois(store.tauxHistorique, annee, mois);

  // Employés effectivement intégrés à la paie (validés ou créés avant le
  // workflow de validation — donc statutValidation absent). Les employés
  // 'en_validation' ou 'rejete' sont visibles uniquement côté GRH.
  // Activité affichée : seuls ses employés (paie, GRH, masse salariale)
  const employesActivite = useMemo(
    () => (validActiviteId ? store.employes.filter((e) => partActivite(e, validActiviteId) > 0) : store.employes),
    [store.employes, validActiviteId],
  );
  const employesPaie = useMemo(
    () =>
      employesActivite.filter(
        (e) => !e.statutValidation || e.statutValidation === "valide"
      ),
    [employesActivite]
  );

  // Toute la société, quelle que soit l'activité affichée : alertes (caisse,
  // échéances) et fiscalité (déclarations) sont communes.
  const employesSociete = useMemo(
    () => store.employes.filter((e) => !e.statutValidation || e.statutValidation === "valide"),
    [store.employes],
  );
  const dataSociete = store.donneesConsolidees[`${annee}-${mois}`] ?? data;

  const alertes = useMemo(
    () =>
      getAlertes({
        donneesMensuelles: store.donneesConsolidees,
        employes: employesSociete,
        articles: store.articles,
      }),
    [store.donneesConsolidees, employesSociete, store.articles]
  );

  // (La redirection des comptes 'employe' purs vers le portail se fait plus bas,
  //  après le dernier hook — voir juste avant le return principal.)
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
    a.download = t("index_page.archive_filename", { date: todayISO() });
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("index_page.archive_exported"));
  };

  const importJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(String(e.target?.result || ""));
        if (!data || typeof data !== "object") throw new Error("invalide");
        if (!confirm(t("index_page.confirm_import"))) return;
        // importerDonnees indique lui-même ce qui a été importé (import partiel)
        store.importerDonnees(data);
      } catch {
        toast.error(t("index_page.import_invalid"));
      }
    };
    reader.readAsText(file);
  };

  // Helpers : un no-op + toast pour les actions interdites selon le service
  const blocked = (msg: string) => () => toast.error(msg);
  const blockedId = (msg: string) => (_id: number) => toast.error(msg);
  const tp = (k: string) => t(`index_page.perms.${k}`);

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
  // Module guards : si une société est sélectionnée, on respecte ses
  // modules activés. Sans config (pas de société courante), on garde le
  // comportement historique (tout autorisé selon les permissions).
  const cfg = societeConfig;
  const modOk = (key: keyof NonNullable<typeof cfg>): boolean =>
    cfg ? Boolean(cfg[key]) : true;
  const showDashboard = can("dashboard", "read");
  const showCompta = lvlCompta !== "none";
  const showCommercial = lvlFact !== "none";
  const showStock = lvlStock !== "none" && modOk("module_stock");
  const showImmo = lvlImmo !== "none" && modOk("module_immobilisations");
  const showFisc = (lvlFisc !== "none" || lvlParamSoc !== "none") && modOk("module_fiscalite");
  const showGrh = lvlGrh !== "none" && modOk("module_grh");
  const showPortail = showGrh || (isEmploye && !isEmployeOnly);

  const visibleTabs = [
    showDashboard, showCompta, showFisc, showCommercial, showStock, showImmo, showGrh, showPortail,
  ].filter(Boolean).length;
  const defaultTab = showDashboard
    ? "dashboard"
    : showCompta ? "compta"
    : showCommercial ? "commercial"
    : showStock ? "stock"
    : showImmo ? "immo"
    : showGrh ? "grh"
    : showFisc ? "fisc"
    : "compta";
  const gridCols = visibleTabs >= 8 ? "lg:grid-cols-8"
    : visibleTabs === 7 ? "lg:grid-cols-7"
    : visibleTabs === 6 ? "lg:grid-cols-6"
    : visibleTabs === 5 ? "lg:grid-cols-5"
    : visibleTabs === 4 ? "lg:grid-cols-4"
    : visibleTabs === 3 ? "lg:grid-cols-3"
    : visibleTabs === 2 ? "lg:grid-cols-2"
    : "lg:grid-cols-1";

  // ── Onglet actif piloté par les search params React Router ──────────────
  // useLocation() est réactif : se met à jour automatiquement sur Back/Forward.
  // useNavigate() pousse une vraie entrée dans la pile React Router (= Back fonctionne).
  const searchParams = new URLSearchParams(location.search);
  const tabFromUrl = searchParams.get("tab");
  const effectiveTab = tabFromUrl || defaultTab;

  // Stable entre les rendus : évite de réinstaller l'écouteur clavier à chaque rendu
  const handleTabChange = useCallback((value: string) => {
    const params = new URLSearchParams(location.search);
    params.set("tab", value);
    navigate({ search: params.toString() });
  }, [location.search, navigate]);

  // P7 — Raccourcis clavier globaux (Ctrl+1..8 → changer d'onglet)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorer si focus dans un input/textarea/select
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 8) {
          e.preventDefault();
          const tabOrder = [
            showDashboard  && "dashboard",
            showCompta     && "compta",
            showFisc       && "fisc",
            showCommercial && "commercial",
            showStock      && "stock",
            showImmo       && "immo",
            showGrh        && "grh",
            showPortail    && "portail",
          ].filter(Boolean) as string[];
          const tab = tabOrder[num - 1];
          if (tab) handleTabChange(tab);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showDashboard, showCompta, showFisc, showCommercial, showStock, showImmo, showGrh, showPortail, handleTabChange]);

  // Compte 'employe' pur → portail self-service uniquement.
  // Placé après TOUS les hooks : les rôles arrivent après le premier rendu,
  // isEmployeOnly peut donc passer de false à true sans changer l'ordre des hooks.
  if (isEmployeOnly) {
    return (
      <Suspense fallback={<PortalFallback />}>
        <PortailEmploye />
      </Suspense>
    );
  }

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

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-6 space-y-3 sm:space-y-5">
        <MoisNav
          mois={mois}
          annee={annee}
          annees={store.anneesDisponibles}
          onMois={setMois}
          onAnnee={setAnnee}
        />

        <div className="card-elevated p-3 sm:p-6 no-print">
          <Tabs value={effectiveTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className={`tabs-scroll justify-start lg:grid ${gridCols} w-full mb-4 sm:mb-5 h-auto`}>
              {showDashboard && (
                <TabsTrigger value="dashboard" className="py-2.5 text-sm font-semibold">
                  📊 {t("tabs.dashboard")}
                </TabsTrigger>
              )}
              {showCompta && (
                <TabsTrigger value="compta" className="py-2.5 text-sm font-semibold">
                  💰 {t("tabs.accounting")}
                </TabsTrigger>
              )}
              {showFisc && (
                <TabsTrigger value="fisc" className="py-2.5 text-sm font-semibold">
                  🧮 {t("tabs.tax")}
                </TabsTrigger>
              )}
              {showCommercial && (
                <TabsTrigger value="commercial" className="py-2.5 text-sm font-semibold">
                  🧾 Commercial
                </TabsTrigger>
              )}
              {showStock && (
                <TabsTrigger value="stock" className="py-2.5 text-sm font-semibold">
                  📦 {t("tabs.stock")}
                </TabsTrigger>
              )}
              {showImmo && (
                <TabsTrigger value="immo" className="py-2.5 text-sm font-semibold">
                  🏢 {t("tabs.fixed_assets")}
                </TabsTrigger>
              )}
              {showGrh && (
                <TabsTrigger value="grh" className="py-2.5 text-sm font-semibold">
                  👥 {t("tabs.hr")}
                </TabsTrigger>
              )}
              {showPortail && (
                <TabsTrigger value="portail" className="py-2.5 text-sm font-semibold">
                  🏠 Mon Portail
                </TabsTrigger>
              )}
            </TabsList>

            <Suspense fallback={<PortalFallback />}>
            {showDashboard && (
              <TabsContent value="dashboard">
                <Dashboard
                  donneesMensuelles={store.donneesMensuelles}
                  employes={employesPaie}
                  tauxHistorique={store.tauxHistorique}
                  annee={annee}
                  mois={mois}
                  activites={activites.filter((a) => a.actif)}
                  activiteFiltre={validActiviteId}
                />
              </TabsContent>
            )}

            {showCompta && (
            <TabsContent value="compta">
              <Comptabilite
                data={data}
                annee={annee}
                mois={mois}
                employes={employesPaie}
                taux={taux}
                donneesMensuelles={store.donneesMensuelles}
                onAdd={comptaWrite
                  ? (t) => store.addTransaction(annee, mois, t)
                  : blocked(tp("compta_read_only"))}
                onRemove={comptaValidate
                  ? (id) => store.removeTransaction(annee, mois, id)
                  : blockedId(tp("compta_delete"))}
                isChefCompta={comptaValidate}
                onValider={(id) => store.validerTransaction(annee, mois, id)}
                onRejeter={(id, motif) => store.rejeterTransaction(annee, mois, id, motif)}
                onAddEcriture={comptaWrite
                  ? (e) => store.addEcriture(annee, mois, e)
                  : undefined}
                onValiderEcriture={comptaValidate
                  ? (id) => store.validerEcriture(annee, mois, id)
                  : undefined}
                onRejeterEcriture={comptaValidate
                  ? (id, motif) => store.rejeterEcriture(annee, mois, id, motif)
                  : undefined}
                onRemoveEcriture={comptaValidate
                  ? (id) => store.removeEcriture(annee, mois, id)
                  : undefined}
              />
            </TabsContent>
            )}

            {showFisc && (
            <TabsContent value="fisc">
              <Fiscalite
                data={dataSociete}
                employes={employesSociete}
                vueActivite={!!validActiviteId}
                onReverser={comptaWrite ? store.reverserCotisations : undefined}
                annee={annee}
                mois={mois}
                paramsAnnee={store.getParamAnnuel(annee)}
                onUpdateParams={fiscWrite
                  ? (p) => store.setParamAnnuel(annee, p)
                  : () => toast.error(tp("fisc_params"))}
                donneesMensuelles={store.donneesConsolidees}
                tauxHistorique={store.tauxHistorique}
                onAjouterTaux={fiscWrite ? store.ajouterTaux : () => toast.error(tp("fisc_taux_modify"))}
                onSupprimerTaux={fiscWrite ? store.supprimerTaux : () => toast.error(tp("fisc_taux_delete"))}
              />
            </TabsContent>
            )}

            {showCommercial && (
            <TabsContent value="commercial">
              <Factures
                annee={annee}
                articles={store.articles}
                donneesMensuelles={store.donneesMensuelles}
                data={data}
                onAdd={factWrite
                  ? (f) => store.addFacture(annee, mois, f)
                  : ((_f: Omit<Facture, "id">) => { toast.error(tp("fact_read_only")); return 0; })}
                onRemove={factValidate
                  ? (id) => store.removeFacture(annee, mois, id)
                  : blockedId(tp("compta_delete"))}
                onAnnuler={factValidate
                  ? (id) => store.annulerFacture(annee, mois, id)
                  : blockedId(tp("fact_action"))}
                onMarquerPayee={factWrite
                  ? (id, compte) => store.marquerPayee(annee, mois, id, compte)
                  : blockedId(tp("fact_action"))}
                onConvertir={factWrite
                  ? (id, num) => store.convertirProforma(annee, mois, id, num)
                  : (() => toast.error(tp("fact_action")))}
                onPreview={setPreviewFacture}
                isChefCompta={factValidate}
                onValider={(id) => store.validerFacture(annee, mois, id)}
                onRejeter={(id, motif) => store.rejeterFacture(annee, mois, id, motif)}
                onUpdateFacture={factWrite
                  ? (id, patch) => store.updateFacture(annee, mois, id, patch)
                  : (() => toast.error(tp("fact_modify")))}
                onAddDevis={factWrite
                  ? (d) => store.addDevis(annee, mois, d)
                  : ((_d) => { toast.error(tp("fact_devis_read_only")); return 0; })}
                onRemoveDevis={factValidate
                  ? (id) => store.removeDevis(annee, mois, id)
                  : blockedId(tp("compta_delete"))}
                onConvertirDevis={factWrite
                  ? (id, num) => { store.convertirDevisEnFacture(annee, mois, id, num); }
                  : (() => toast.error(tp("fact_action")))}
                onUpdateDevis={factWrite
                  ? (id, patch) => store.updateDevis(annee, mois, id, patch)
                  : (() => toast.error(tp("fact_modify")))}
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
                onAddArticle={stockWrite ? store.addArticle : blocked(tp("stock_action"))}
                onUpdateArticle={stockWrite ? store.updateArticle : (() => toast.error(tp("stock_action")))}
                onRemoveArticle={stockValidate ? store.removeArticle : blockedId(tp("stock_delete"))}
                onAddFournisseur={stockWrite ? store.addFournisseur : blocked(tp("stock_action"))}
                onUpdateFournisseur={stockWrite ? store.updateFournisseur : (() => toast.error(tp("stock_action")))}
                onRemoveFournisseur={stockValidate ? store.removeFournisseur : blockedId(tp("stock_delete"))}
                onAddCategorie={stockWrite ? store.addCategorieStock : blocked(tp("stock_action"))}
                onRemoveCategorie={stockValidate ? store.removeCategorieStock : blockedId(tp("stock_delete"))}
                onConstaterStock={stockValidate && comptaWrite ? store.constaterStock : undefined}
                onAddEntreeAchat={stockWrite ? store.addEntreeStockAchat : undefined}
                onAddMouvement={stockWrite ? (a, m, mv) => store.addMouvementStock(a, m, mv) : (() => { toast.error(tp("stock_action")); return 0; })}
                onRemoveMouvement={stockValidate ? store.removeMouvementStock : ((_a: number, _m: number, _id: number) => toast.error(tp("stock_delete")))}
                isChefCompta={stockValidate}
              />
            </TabsContent>
            )}

            {showGrh && (
            <TabsContent value="grh">
              <GRH
                employes={employesActivite}
                data={data}
                annee={annee}
                mois={mois}
                allAbsences={Object.values(store.donneesMensuelles).flatMap((m) => m.absences || [])}
                sanctions={store.sanctions}
                isChefGrh={grhValidate}
                onAddEmploye={grhWrite ? store.addEmploye : blocked(tp("grh_read_only"))}
                onUpdateEmploye={grhWrite ? store.updateEmploye : (() => toast.error(tp("grh_modify")))}
                onRemoveEmploye={grhValidate ? store.removeEmploye : blockedId(tp("grh_delete"))}
                onValiderEmploye={grhValidate ? store.validerEmploye : blockedId(tp("grh_validation"))}
                onRejeterEmploye={grhValidate ? store.rejeterEmploye : ((_id: number, _m: string) => toast.error(tp("grh_validation")))}
                onAddPrime={grhWrite ? (eid, p) => store.addPrime(annee, mois, eid, p) : (() => toast.error(tp("grh_action")))}
                onRemovePrime={grhValidate ? (eid, pid) => store.removePrime(annee, mois, eid, pid) : (() => toast.error(tp("grh_delete_action")))}
                onAddAbsence={grhWrite ? (a) => store.addAbsence(annee, mois, a) : (() => toast.error(tp("grh_action")))}
                onRemoveAbsence={grhValidate ? (id) => store.removeAbsence(annee, mois, id) : (() => toast.error(tp("grh_delete_action")))}
                onSetHeuresSup={grhWrite ? (eid, hs) => store.setHeuresSup(annee, mois, eid, hs) : (() => toast.error(tp("grh_action")))}
                onSetRetenue={grhWrite ? (eid, m) => store.setRetenue(annee, mois, eid, m) : (() => toast.error(tp("grh_action")))}
                onAddSanction={grhWrite ? store.addSanction : blocked(tp("grh_action"))}
                onRemoveSanction={grhValidate ? store.removeSanction : blockedId(tp("grh_delete_action"))}
                onValiderPrime={(eid, pid) => store.validerPrime(annee, mois, eid, pid)}
                onRejeterPrime={(eid, pid, motif) => store.rejeterPrime(annee, mois, eid, pid, motif)}
                onValiderAbsence={(id) => store.validerAbsence(annee, mois, id)}
                onRejeterAbsence={(id, motif) => store.rejeterAbsence(annee, mois, id, motif)}
                onValiderHeuresSup={(eid) => store.validerHeuresSup(annee, mois, eid)}
                onRejeterHeuresSup={(eid, motif) => store.rejeterHeuresSup(annee, mois, eid, motif)}
                onValiderSanction={(id) => store.validerSanction(id)}
                onRejeterSanction={(id, motif) => store.rejeterSanction(id, motif)}
                employesCorbeille={store.employesCorbeille}
                onRestoreEmploye={grhValidate ? store.restoreEmploye : undefined}
                onPurgeEmploye={grhValidate ? store.purgeEmploye : undefined}
              />
            </TabsContent>
            )}

            {showPortail && (
            <TabsContent value="portail">
              <MonPortail />
            </TabsContent>
            )}

            {showImmo && (
            <TabsContent value="immo">
              <Immobilisations
                annee={annee}
                immobilisations={store.immobilisations}
                onAdd={immoWrite
                  ? store.addImmobilisation
                  : ((_i) => { toast.error(tp("immo_action")); return 0; })}
                onRemove={immoValidate
                  ? store.removeImmobilisation
                  : blockedId(tp("immo_delete"))}
                onUpdate={immoWrite ? store.updateImmobilisation : undefined}
                canEdit={immoWrite}
                onAddEcriture={comptaWrite
                  ? (a, m, e) => store.addEcriture(a, m, e)
                  : undefined}
                moisDotation={12}
              />
            </TabsContent>
            )}
            </Suspense>
          </Tabs>
        </div>

        <footer className="text-center text-xs text-muted-foreground py-4 no-print">
          <SupabaseStatus />
          {t("index_page.footer_regulier")}
        </footer>
      </main>

      <RecapAnnuelModal
        open={showRecap}
        onOpenChange={setShowRecap}
        annee={annee}
        donneesMensuelles={store.donneesMensuelles}
        immobilisations={store.immobilisations}
        tauxHistorique={store.tauxHistorique}
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
      {isElectron() && <UpdateNotifier />}
      <UpdateBanner />
      <OfflineBanner />
    </div>
  );
};

export default Index;
