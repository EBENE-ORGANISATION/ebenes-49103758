/**
 * FichePersonnel — Modal "Fiche de personnel" affichant l'intégralité des
 * informations d'un employé et le retraçage de sa carrière (bulletins,
 * absences, sanctions, heures sup, primes).
 */
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatMontant, calculerAnciennete } from "@/lib/ebene-utils";
import { printElement } from "@/lib/print";
import type { Employe } from "@/types/ebene";

interface Props {
  employe: Employe;
  societeId: string;
  onClose: () => void;
}

type BulletinRow = {
  id: string; annee: number; mois: number; brut: number; net_a_payer: number;
  cout_employeur: number; statut: string; paid_at: string | null;
};
type AbsenceRow = {
  id: number; type: string; date_debut: string; date_fin: string;
  jours: number; motif: string | null; statut_validation: string | null;
};
type SanctionRow = {
  id: number; type: string; date: string; motif: string | null;
  statut_validation: string | null;
};
type HSRow = {
  id: number; annee: number; mois: number;
  jour_semaine: number; jour_sup: number; dimanche_ferie: number;
  nuit_semaine: number; nuit_dimanche_ferie: number;
  statut_validation: string | null;
};

const SExport = (rows: Record<string, unknown>[], filename: string) => {
  import("xlsx").then((XLSX) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fiche");
    XLSX.writeFile(wb, filename);
  });
};

export const FichePersonnel = ({ employe: e, societeId, onClose }: Props) => {
  const [bulletins, setBulletins] = useState<BulletinRow[]>([]);
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [sanctions, setSanctions] = useState<SanctionRow[]>([]);
  const [hs, setHs] = useState<HSRow[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const [b, a, s, h] = await Promise.all([
        supabase.from("bulletins_paie").select("id,annee,mois,brut,net_a_payer,cout_employeur,statut,paid_at")
          .eq("societe_id", societeId).eq("employe_id", e.id)
          .order("annee", { ascending: false }).order("mois", { ascending: false }),
        supabase.from("absences").select("id,type,date_debut,date_fin,jours,motif,statut_validation")
          .eq("societe_id", societeId).eq("employe_id", e.id)
          .order("date_debut", { ascending: false }),
        supabase.from("sanctions" as never).select("id,type,date,motif,statut_validation")
          .eq("societe_id", societeId).eq("employe_id", e.id)
          .order("date", { ascending: false }),
        supabase.from("heures_sup").select("id,annee,mois,jour_semaine,jour_sup,dimanche_ferie,nuit_semaine,nuit_dimanche_ferie,statut_validation")
          .eq("societe_id", societeId).eq("employe_id", e.id)
          .order("annee", { ascending: false }).order("mois", { ascending: false }),
      ]);
      setBulletins((b.data as BulletinRow[] | null) ?? []);
      setAbsences((a.data as AbsenceRow[] | null) ?? []);
      setSanctions((s.data as SanctionRow[] | null) ?? []);
      setHs((h.data as HSRow[] | null) ?? []);
    })();
  }, [e.id, societeId]);

  const anc = calculerAnciennete(e.dateEmbauche);
  const totalNet = bulletins.reduce((s, b) => s + (b.net_a_payer || 0), 0);
  const totalCout = bulletins.reduce((s, b) => s + (b.cout_employeur || 0), 0);

  const exportFiche = () => {
    const info: Record<string, unknown>[] = [
      { Champ: "Nom", Valeur: e.nom },
      { Champ: "Matricule", Valeur: e.matricule ?? "" },
      { Champ: "Poste", Valeur: e.poste },
      { Champ: "Catégorie", Valeur: `${e.categorie ?? ""} ${e.echelon ?? ""}` },
      { Champ: "Type contrat", Valeur: (e.typeContrat ?? "").toUpperCase() },
      { Champ: "Date embauche", Valeur: e.dateEmbauche ?? "" },
      { Champ: "Date fin contrat", Valeur: e.dateFinContrat ?? "" },
      { Champ: "Ancienneté (ans)", Valeur: anc.toFixed(1) },
      { Champ: "Date naissance", Valeur: e.dateNaissance ?? "" },
      { Champ: "Lieu naissance", Valeur: e.lieuNaissance ?? "" },
      { Champ: "Sexe", Valeur: e.sexe ?? "" },
      { Champ: "Nationalité", Valeur: e.nationalite ?? "" },
      { Champ: "Adresse", Valeur: e.adresse ?? "" },
      { Champ: "Téléphone", Valeur: e.telephone ?? "" },
      { Champ: "Email", Valeur: e.email ?? "" },
      { Champ: "CNI", Valeur: e.cni ?? "" },
      { Champ: "N° CNSS", Valeur: e.numCnss ?? "" },
      { Champ: "Situation", Valeur: e.situation },
      { Champ: "Enfants", Valeur: e.enfants },
      { Champ: "Salaire base", Valeur: e.salaire },
      { Champ: "Sursalaire", Valeur: e.sursalaire ?? 0 },
      { Champ: "Ind. transport", Valeur: e.indemniteTransport ?? 0 },
      { Champ: "Ind. logement", Valeur: e.indemniteLogement ?? 0 },
      { Champ: "Ind. fonction", Valeur: e.indemniteFonction ?? 0 },
      { Champ: "Solde congés", Valeur: e.soldeConges ?? 0 },
    ];
    import("xlsx").then((XLSX) => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(info), "Informations");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        bulletins.map((b) => ({
          Période: `${String(b.mois).padStart(2, "0")}/${b.annee}`,
          Brut: b.brut, Net: b.net_a_payer, Coût: b.cout_employeur,
          Statut: b.statut, "Payé le": b.paid_at ?? "",
        }))
      ), "Bulletins");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        absences.map((a) => ({
          Type: a.type, Début: a.date_debut, Fin: a.date_fin,
          Jours: a.jours, Motif: a.motif ?? "", Statut: a.statut_validation ?? "",
        }))
      ), "Absences");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        sanctions.map((s) => ({
          Type: s.type, Date: s.date, Motif: s.motif ?? "",
          Statut: s.statut_validation ?? "",
        }))
      ), "Sanctions");
      XLSX.writeFile(wb, `Fiche_${e.nom.replace(/\s+/g, "_")}.xlsx`);
    });
    void SExport; // keep helper export available
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 flex-wrap">
            <span>📋 Fiche de personnel — {e.nom}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => printElement(printRef.current, `Fiche ${e.nom}`)} className="gap-1">
                <Printer className="size-3.5" /> Imprimer
              </Button>
              <Button size="sm" onClick={exportFiche} className="gap-1">
                <Download className="size-3.5" /> Exporter Excel
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div ref={printRef}>
        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full h-auto">
            <TabsTrigger value="info">Identité</TabsTrigger>
            <TabsTrigger value="contrat">Contrat</TabsTrigger>
            <TabsTrigger value="bulletins">Bulletins ({bulletins.length})</TabsTrigger>
            <TabsTrigger value="absences">Absences ({absences.length})</TabsTrigger>
            <TabsTrigger value="discipline">Discipline ({sanctions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-2 text-sm">
            <Field label="Matricule" value={e.matricule} />
            <Field label="Nom complet" value={e.nom} />
            <Field label="Date de naissance" value={e.dateNaissance} />
            <Field label="Lieu de naissance" value={e.lieuNaissance} />
            <Field label="Sexe" value={e.sexe === "M" ? "Masculin" : e.sexe === "F" ? "Féminin" : "—"} />
            <Field label="Nationalité" value={e.nationalite} />
            <Field label="CNI" value={e.cni} />
            <Field label="N° CNSS" value={e.numCnss} />
            <Field label="Adresse" value={e.adresse} />
            <Field label="Téléphone" value={e.telephone} />
            <Field label="Email" value={e.email} />
            <Field label="Situation familiale" value={`${e.situation === "marie" ? "Marié(e)" : "Célibataire"} • ${e.enfants} enfant(s)`} />
          </TabsContent>

          <TabsContent value="contrat" className="space-y-2 text-sm">
            <Field label="Poste" value={e.poste} />
            <Field label="Qualification" value={e.qualification} />
            <Field label="Catégorie / Échelon" value={`${e.categorie ?? "—"} / ${e.echelon ?? "—"}`} />
            <Field label="Type de contrat" value={(e.typeContrat ?? "—").toUpperCase()} />
            <Field label="Date d'embauche" value={e.dateEmbauche} />
            <Field label="Date fin contrat" value={e.dateFinContrat ?? "—"} />
            <Field label="Ancienneté" value={`${anc.toFixed(1)} ans`} />
            <Field label="Salaire de base" value={formatMontant(e.salaire)} />
            <Field label="Sursalaire" value={formatMontant(e.sursalaire ?? 0)} />
            <Field label="Indemnité transport" value={formatMontant(e.indemniteTransport ?? 0)} />
            <Field label="Indemnité logement" value={formatMontant(e.indemniteLogement ?? 0)} />
            <Field label="Indemnité fonction" value={formatMontant(e.indemniteFonction ?? 0)} />
            <Field label="Solde congés" value={`${e.soldeConges ?? 0} jours`} />
          </TabsContent>

          <TabsContent value="bulletins">
            <div className="text-xs mb-2 text-muted-foreground">
              Total net cumulé : <strong className="text-success">{formatMontant(totalNet)}</strong> •
              Coût total : <strong className="text-warning">{formatMontant(totalCout)}</strong>
            </div>
            <SimpleTable
              headers={["Période", "Brut", "Net", "Coût", "Statut"]}
              rows={bulletins.map((b) => [
                `${String(b.mois).padStart(2, "0")}/${b.annee}`,
                formatMontant(b.brut), formatMontant(b.net_a_payer),
                formatMontant(b.cout_employeur), b.statut,
              ])}
              empty="Aucun bulletin"
            />
          </TabsContent>

          <TabsContent value="absences">
            <SimpleTable
              headers={["Type", "Début", "Fin", "Jours", "Motif", "Statut"]}
              rows={absences.map((a) => [
                a.type, a.date_debut, a.date_fin, String(a.jours),
                a.motif ?? "—", a.statut_validation ?? "—",
              ])}
              empty="Aucune absence"
            />
          </TabsContent>

          <TabsContent value="discipline">
            <SimpleTable
              headers={["Type", "Date", "Motif", "Statut"]}
              rows={sanctions.map((s) => [
                s.type, s.date, s.motif ?? "—", s.statut_validation ?? "—",
              ])}
              empty="Aucune sanction"
            />
            {hs.length > 0 && (
              <>
                <h4 className="font-bold mt-4 mb-2 text-sm">Heures supplémentaires</h4>
                <SimpleTable
                  headers={["Période", "Sem.", ">48h", "Dim/Fériés", "Nuit", "Nuit Dim/F"]}
                  rows={hs.map((h) => [
                    `${String(h.mois).padStart(2, "0")}/${h.annee}`,
                    String(h.jour_semaine), String(h.jour_sup),
                    String(h.dimanche_ferie), String(h.nuit_semaine),
                    String(h.nuit_dimanche_ferie),
                  ])}
                  empty=""
                />
              </>
            )}
          </TabsContent>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Field = ({ label, value }: { label: string; value: string | number | undefined | null }) => (
  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-1.5 border-b border-border/50">
    <span className="text-xs font-semibold text-muted-foreground uppercase">{label}</span>
    <span className="text-sm">{value || "—"}</span>
  </div>
);

const SimpleTable = ({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) => (
  rows.length === 0 ? (
    <p className="text-sm text-muted-foreground text-center py-6">{empty}</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-muted/50">
            {headers.map((h) => <th key={h} className="border border-border px-2 py-1.5 text-left">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-muted/30">
              {r.map((c, j) => <td key={j} className="border border-border px-2 py-1">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
);