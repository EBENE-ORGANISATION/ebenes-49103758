import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Header } from "@/components/ebene/Header";
import { MoisNav } from "@/components/ebene/MoisNav";
import { Comptabilite } from "@/components/ebene/Comptabilite";
import { Fiscalite } from "@/components/ebene/Fiscalite";
import { Factures } from "@/components/ebene/Factures";
import { GRH } from "@/components/ebene/GRH";
import { RecapAnnuelModal } from "@/components/ebene/RecapAnnuelModal";
import { ArchivesModal } from "@/components/ebene/ArchivesModal";
import { FacturePreview } from "@/components/ebene/FacturePreview";
import { useEbeneStore } from "@/hooks/useEbeneStore";
import { Facture } from "@/types/ebene";
import { toast } from "sonner";

const Index = () => {
  const now = new Date();
  const [annee, setAnnee] = useState(now.getFullYear());
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [showRecap, setShowRecap] = useState(false);
  const [showArchives, setShowArchives] = useState(false);
  const [previewFacture, setPreviewFacture] = useState<Facture | null>(null);

  const store = useEbeneStore();
  const data = store.getMois(annee, mois);

  const exportJSON = () => {
    const payload = {
      version: "1.3",
      exportDate: new Date().toISOString(),
      donneesMensuelles: store.donneesMensuelles,
      employes: store.employes,
      paramsAnnuels: store.paramsAnnuels,
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

  return (
    <div className="min-h-screen bg-background">
      <Header
        onExport={exportJSON}
        onImport={importJSON}
        onShowRecap={() => setShowRecap(true)}
        onShowArchives={() => setShowArchives(true)}
        lastSaved={store.lastSaved}
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
          <Tabs defaultValue="compta" className="w-full">
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full mb-5 h-auto">
              <TabsTrigger value="compta" className="py-2.5 text-sm font-semibold">
                💰 Comptabilité
              </TabsTrigger>
              <TabsTrigger value="fisc" className="py-2.5 text-sm font-semibold">
                🧮 Fiscalité
              </TabsTrigger>
              <TabsTrigger value="fact" className="py-2.5 text-sm font-semibold">
                📄 Factures
              </TabsTrigger>
              <TabsTrigger value="grh" className="py-2.5 text-sm font-semibold">
                👥 GRH
              </TabsTrigger>
            </TabsList>

            <TabsContent value="compta">
              <Comptabilite
                data={data}
                onAdd={(t) => store.addTransaction(annee, mois, t)}
                onRemove={(id) => store.removeTransaction(annee, mois, id)}
              />
            </TabsContent>

            <TabsContent value="fisc">
              <Fiscalite
                data={data}
                employes={store.employes}
                annee={annee}
                mois={mois}
                paramsAnnee={store.getParamAnnuel(annee)}
                onUpdateParams={(p) => store.setParamAnnuel(annee, p)}
                donneesMensuelles={store.donneesMensuelles}
                tauxHistorique={store.tauxHistorique}
                onAjouterTaux={store.ajouterTaux}
                onSupprimerTaux={store.supprimerTaux}
              />
            </TabsContent>

            <TabsContent value="fact">
              <Factures
                annee={annee}
                donneesMensuelles={store.donneesMensuelles}
                data={data}
                onAdd={(f) => store.addFacture(annee, mois, f)}
                onRemove={(id) => store.removeFacture(annee, mois, id)}
                onMarquerPayee={(id) => store.marquerPayee(annee, mois, id)}
                onConvertir={(id, num) => store.convertirProforma(annee, mois, id, num)}
                onPreview={setPreviewFacture}
              />
            </TabsContent>

            <TabsContent value="grh">
              <GRH
                employes={store.employes}
                data={data}
                annee={annee}
                mois={mois}
                onAddEmploye={store.addEmploye}
                onUpdateEmploye={store.updateEmploye}
                onRemoveEmploye={store.removeEmploye}
                onAddPrime={(eid, p) => store.addPrime(annee, mois, eid, p)}
                onRemovePrime={(eid, pid) => store.removePrime(annee, mois, eid, pid)}
                onAddAbsence={(a) => store.addAbsence(annee, mois, a)}
                onRemoveAbsence={(id) => store.removeAbsence(annee, mois, id)}
                onSetHeuresSup={(eid, hs) => store.setHeuresSup(annee, mois, eid, hs)}
                onSetRetenue={(eid, m) => store.setRetenue(annee, mois, eid, m)}
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
