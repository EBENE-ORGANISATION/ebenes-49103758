import { useMemo, useState, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  Employe, MoisData, ParamsAnnuels, DonneesMensuelles, TauxFiscaux, MOIS_NOMS,
} from "@/types/ebene";
import { StatCard } from "./StatCard";
import { formatMontant, tauxPourMois, moisKey } from "@/lib/ebene-utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  History, Download, FileSpreadsheet, FileText, Lock, Clock, AlertCircle, Settings2,
} from "lucide-react";
import { TauxHistoriqueDialog } from "./TauxHistoriqueDialog";
import { TauxImpots } from "./TauxImpots";
import { GestionDelegations } from "./GestionDelegations";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { useBulletinsPaie } from "@/hooks/useBulletinsPaie";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  data: MoisData;
  employes: Employe[];
  annee: number;
  mois: number;
  paramsAnnee: ParamsAnnuels;
  onUpdateParams: (patch: Partial<ParamsAnnuels>) => void;
  donneesMensuelles: DonneesMensuelles;
  tauxHistorique: TauxFiscaux[];
  onAjouterTaux: (t: TauxFiscaux) => void;
  onSupprimerTaux: (dateEffet: string) => void;
}

type StatutMois = "cloture" | "en_cours" | "futur";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function getStatutMois(annee: number, mois: number): StatutMois {
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  if (annee < cy || (annee === cy && mois < cm)) return "cloture";
  if (annee === cy && mois === cm) return "en_cours";
  return "futur";
}

const StatutBadge = ({ statut }: { statut: StatutMois }) => {
  if (statut === "cloture")
    return <Badge variant="secondary" className="gap-1 text-xs"><Lock className="size-3" />Clôturé</Badge>;
  if (statut === "en_cours")
    return <Badge className="gap-1 text-xs bg-primary"><Clock className="size-3" />En cours</Badge>;
  return <Badge variant="outline" className="gap-1 text-xs text-muted-foreground"><AlertCircle className="size-3" />Futur</Badge>;
};

const Row = ({ label, value, strong, sub }: { label: string; value: string; strong?: boolean; sub?: boolean }) => (
  <div className={`flex justify-between py-1.5 border-b border-border/30 last:border-0
    ${strong ? "font-bold text-base border-t-2 border-border pt-2 mt-1" : ""}
    ${sub ? "pl-4 text-xs text-muted-foreground italic" : "text-sm"}`}>
    <span className={strong ? "" : sub ? "" : "text-muted-foreground"}>{label}</span>
    <span className="amount font-mono">{value}</span>
  </div>
);

// ─── Export helpers ───────────────────────────────────────────────────────────

function dlExcel(filename: string, sheetName: string, rows: (string | number)[][]) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function dlPDF(filename: string, title: string, head: string[][], body: (string | number)[][]) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 18);
  autoTable(doc, { head, body: body.map(r => r.map(String)), startY: 25 });
  doc.save(`${filename}.pdf`);
}

function dlWord(filename: string, title: string, tableHtml: string) {
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
    xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'></head>
    <body><h2>${title}</h2>${tableHtml}</body></html>`;
  const blob = new Blob([html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${filename}.doc`; a.click();
  URL.revokeObjectURL(url);
}

const ExportBtns = ({ onExcel, onPdf, onWord }: {
  onExcel: () => void; onPdf: () => void; onWord: () => void;
}) => (
  <div className="flex gap-2 flex-wrap">
    <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={onExcel}>
      <FileSpreadsheet className="size-3 text-green-600" />Excel
    </Button>
    <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={onPdf}>
      <Download className="size-3 text-red-500" />PDF
    </Button>
    <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={onWord}>
      <FileText className="size-3 text-blue-600" />Word
    </Button>
  </div>
);

// ─── Composant principal ──────────────────────────────────────────────────────

export const Fiscalite = ({
  data, employes, annee, mois, paramsAnnee, onUpdateParams,
  donneesMensuelles, tauxHistorique, onAjouterTaux, onSupprimerTaux,
}: Props) => {
  const { can, user } = useAuth();
  const { currentSociete } = useTenant();
  const societeId = currentSociete?.id ?? "";

  const canEditTaux   = can("fiscalite", "write");
  const canEditSocial = can("parametres_sociaux", "write");

  const [showHistorique, setShowHistorique] = useState(false);
  const [thInput,    setThInput]    = useState("");
  const [loyerInput, setLoyerInput] = useState("");

  // IRPP depuis bulletins de paie
  const { bulletins, loadBulletins } = useBulletinsPaie(societeId || null);
  useEffect(() => {
    if (societeId) void loadBulletins(annee, mois);
  }, [societeId, annee, mois]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync inputs depuis les params
  useEffect(() => {
    setThInput(String(paramsAnnee.th ?? ""));
    setLoyerInput(String(paramsAnnee.loyerAnnuel ?? ""));
  }, [paramsAnnee, annee]);

  const statut = useMemo(() => getStatutMois(annee, mois), [annee, mois]);
  const nomMois = MOIS_NOMS[mois - 1] ?? "";
  const taux = useMemo(() => tauxPourMois(tauxHistorique, annee, mois), [tauxHistorique, annee, mois]);

  // ── CA annuel cumulé (pour IMF) ────────────────────────────────────────────
  const caAnnuel = useMemo(() => {
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const md = donneesMensuelles[moisKey(annee, m)];
      if (!md) continue;
      total += md.transactions.filter(t => t.type === "r").reduce((a, t) => a + t.m, 0);
    }
    return total;
  }, [donneesMensuelles, annee]);

  // ── Calculs du mois ────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const recettes = data.transactions.filter(t => t.type === "r");
    const depenses = data.transactions.filter(t => t.type === "d");
    const rec  = recettes.reduce((a, t) => a + t.m, 0);
    const dep  = Math.abs(depenses.reduce((a, t) => a + t.m, 0));
    const ben  = Math.max(0, rec - dep);

    // Patente par activité
    const recService  = recettes.filter(t => (t.activite ?? taux.activiteDefaut) === "service").reduce((a,t)=>a+t.m,0);
    const recCommerce = recettes.filter(t => (t.activite ?? taux.activiteDefaut) === "commerce").reduce((a,t)=>a+t.m,0);
    const patService  = recService  * taux.patenteService;
    const patCommerce = recCommerce * taux.patenteCommerce;
    const pat = patService + patCommerce;

    // IS / IMF
    const is = ben * taux.is;
    const imfAnnuel  = Math.max(taux.imfMin, caAnnuel * taux.imfTaux);
    const imfMensuel = imfAnnuel / 12;
    const impot  = Math.max(is, imfMensuel);
    const regime = is >= imfMensuel ? "IS" : "IMF";

    // TVA
    const tvaCollectee   = rec * taux.tva;
    const tvaDeductible  = dep * taux.tva;
    const tvaNette       = tvaCollectee - tvaDeductible;
    const tvaAPayer      = Math.max(0, tvaNette);
    const creditAReporter = Math.max(0, -tvaNette);

    // TH — acompte semestriel (janv. + juil. uniquement)
    const thAnnuel  = paramsAnnee.th ?? 0;
    const thDuMois  = (mois === 1 || mois === 7) ? thAnnuel / 2 : 0;

    // RSL = loyer annuel × 8,75 % → mensualité
    const loyerAnnuel = paramsAnnee.loyerAnnuel ?? 0;
    const rslAnnuel   = loyerAnnuel * 0.0875;
    const rslMensuel  = rslAnnuel / 12;

    // Social
    let masse = 0;
    employes.forEach(e => {
      masse += e.salaire + (e.sursalaire || 0);
      (data.primes[e.id] || []).forEach(p => (masse += p.montant || 0));
    });
    const cnssEmp = masse * taux.cnssEmp;
    const amuEmp  = masse * taux.amuEmp;
    const cnssSal = masse * taux.cnssSal;
    const amuSal  = masse * taux.amuSal;

    return {
      rec, dep, ben,
      recService, recCommerce,
      is, imfMensuel, imfAnnuel, impot, regime,
      tvaCollectee, tvaDeductible, tvaNette, tvaAPayer, creditAReporter,
      patService, patCommerce, pat,
      thAnnuel, thDuMois, loyerAnnuel, rslAnnuel, rslMensuel,
      masse, cnssEmp, amuEmp, cnssSal, amuSal,
      totalFiscal: tvaAPayer + impot + pat + thDuMois + rslMensuel,
      totalSocial: cnssEmp + amuEmp,
    };
  }, [data, employes, paramsAnnee, taux, caAnnuel, mois]);

  // IRPP total du mois depuis bulletins
  const irppTotal = useMemo(
    () => bulletins.reduce((a, b) => a + (b.irpp || 0), 0),
    [bulletins],
  );

  const sauverParams = () => {
    const th    = parseFloat(thInput);
    const loyer = parseFloat(loyerInput);
    onUpdateParams({
      th:          isNaN(th)    ? undefined : th,
      loyerAnnuel: isNaN(loyer) ? undefined : loyer,
    });
  };

  // ── Données TVA pour exports ───────────────────────────────────────────────
  const tvaHead = [["Ligne", "Libellé", "Montant (FCFA)"]];
  const tvaBody: (string | number)[][] = [
    ["01", "CA HT du mois",              fmt(calc.rec)],
    ["02", `TVA collectée (${(taux.tva*100).toFixed(0)}%)`, fmt(calc.tvaCollectee)],
    ["03", `TVA déductible sur achats`,   fmt(calc.tvaDeductible)],
    ["25", "Balance TVA (collectée - déduit.)", fmt(calc.tvaNette)],
    ["26", "TVA NETTE À PAYER",           calc.tvaAPayer > 0 ? fmt(calc.tvaAPayer) : "—"],
    ["27", "Crédit TVA à reporter",       calc.creditAReporter > 0 ? fmt(calc.creditAReporter) : "—"],
  ];
  const tvaTableHtml = `<table border="1"><tr><th>Ligne</th><th>Libellé</th><th>Montant (FCFA)</th></tr>
    ${tvaBody.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
  const tvaTitre = `Déclaration TVA — ${nomMois} ${annee}`;

  // ── Données CNSS pour exports ──────────────────────────────────────────────
  const cnssHead = [["Libellé", "Base", "Taux", "Montant (FCFA)"]];
  const cnssBody: (string | number)[][] = [
    ["Masse salariale brute",        fmt(calc.masse), "—",                           fmt(calc.masse)],
    ["CNSS patronale",               fmt(calc.masse), `${(taux.cnssEmp*100).toFixed(1)}%`, fmt(calc.cnssEmp)],
    ["AMU patronale",                fmt(calc.masse), `${(taux.amuEmp*100).toFixed(0)}%`,  fmt(calc.amuEmp)],
    ["CNSS salariale (retenue)",     fmt(calc.masse), `${(taux.cnssSal*100).toFixed(0)}%`, fmt(calc.cnssSal)],
    ["AMU salariale (retenue)",      fmt(calc.masse), `${(taux.amuSal*100).toFixed(0)}%`,  fmt(calc.amuSal)],
    ["TOTAL CHARGES SOCIALES PATRON", "",             "",                            fmt(calc.cnssEmp + calc.amuEmp)],
  ];
  const cnssTableHtml = `<table border="1"><tr><th>Libellé</th><th>Base</th><th>Taux</th><th>Montant (FCFA)</th></tr>
    ${cnssBody.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
  const cnssTitre = `Déclaration CNSS — ${nomMois} ${annee}`;

  // ── Données IRPP pour exports ──────────────────────────────────────────────
  const irppHead = [["Employé", "Salaire brut", "CNSS sal.", "AMU sal.", "IRPP", "Net à payer"]];
  const irppBody: (string | number)[][] = bulletins.map(b => [
    b.employe_nom,
    fmt(b.brut),
    fmt(b.cnss_sal),
    fmt(b.amu_sal),
    fmt(b.irpp),
    fmt(b.net_a_payer),
  ]);
  if (irppBody.length === 0) irppBody.push(["Aucun bulletin de paie", "", "", "", "", ""]);
  const irppTableHtml = `<table border="1"><tr>${irppHead[0].map(h=>`<th>${h}</th>`).join("")}</tr>
    ${irppBody.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
  const irppTitre = `Déclaration IRPP — ${nomMois} ${annee}`;

  // ─── RSL preview dans l'onglet Paramètres ────────────────────────────────
  const loyerPreview = parseFloat(loyerInput) || 0;
  const rslPreviewAnnuel  = loyerPreview * 0.0875;
  const rslPreviewMensuel = rslPreviewAnnuel / 12;

  // ─── Dates d'échéance ────────────────────────────────────────────────────
  const nextRslDate = mois < 12
    ? `15 ${MOIS_NOMS[mois]} ${annee}`
    : `15 Janvier ${annee + 1}`;

  return (
    <div className="space-y-4">
      {/* ── En-tête ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">Fiscalité & Social</h2>
          <StatutBadge statut={statut} />
          <span className="text-sm text-muted-foreground">— {nomMois} {annee}</span>
        </div>
        <div className="flex gap-2">
          {canEditTaux && (
            <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={() => setShowHistorique(true)}>
              <History className="size-3" />Historique taux
            </Button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="dashboard">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="tva">TVA</TabsTrigger>
          <TabsTrigger value="is">IS / IMF</TabsTrigger>
          <TabsTrigger value="social">Social</TabsTrigger>
          <TabsTrigger value="params">Paramètres</TabsTrigger>
        </TabsList>

        {/* ══ DASHBOARD ═══════════════════════════════════════════════════════ */}
        <TabsContent value="dashboard" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard label="CA (mois)"        value={`${fmt(calc.rec)} FCFA`}         tone="info" />
            <StatCard label="Bénéfice"          value={`${fmt(calc.ben)} FCFA`}         tone="success" />
            <StatCard label={`TVA (${(taux.tva*100).toFixed(0)}%)`}
                            value={calc.tvaAPayer > 0 ? `${fmt(calc.tvaAPayer)} FCFA` : "Crédit"}
                            tone={calc.tvaAPayer > 0 ? "destructive" : "success"}
                            hint={calc.creditAReporter > 0 ? `Crédit : ${fmt(calc.creditAReporter)} FCFA` : undefined} />
            <StatCard label={`Impôt (${calc.regime})`}
                            value={`${fmt(calc.impot)} FCFA`}                           tone="warning"
                            hint={`IMF annuel : ${fmt(calc.imfAnnuel)} FCFA`} />
            <StatCard label="Patente"           value={`${fmt(calc.pat)} FCFA`}         tone="purple" />
            <StatCard label="TH du mois"
                            value={calc.thDuMois > 0 ? `${fmt(calc.thDuMois)} FCFA` : "—"}
                            tone={calc.thDuMois > 0 ? "warning" : "info"}
                            hint={mois === 1 ? "Acompte janv. (15/01)" : mois === 7 ? "Acompte juil. (15/07)" : undefined} />
            <StatCard label="RSL (mensuel)"     value={`${fmt(calc.rslMensuel)} FCFA`}  tone="info"
                            hint={`≤ ${nextRslDate}`} />
            <StatCard label="Charges sociales"  value={`${fmt(calc.totalSocial)} FCFA`} tone="purple" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card-elevated p-5">
              <h3 className="font-bold mb-3">💼 Total Fiscal (mois)</h3>
              <Row label={`TVA nette à payer`}          value={`${fmt(calc.tvaAPayer)} FCFA`} />
              <Row label={`Impôt (${calc.regime})`}     value={`${fmt(calc.impot)} FCFA`} />
              <Row label="Patente"                       value={`${fmt(calc.pat)} FCFA`} />
              <Row label={`TH ${mois === 1 || mois === 7 ? "(acompte)" : "(néant)"}`}
                          value={calc.thDuMois > 0 ? `${fmt(calc.thDuMois)} FCFA` : "—"} />
              <Row label="RSL mensuel"                  value={`${fmt(calc.rslMensuel)} FCFA`} />
              <Row label="TOTAL FISCAL"                 value={`${fmt(calc.totalFiscal)} FCFA`} strong />
            </div>
            <div className="card-elevated p-5">
              <h3 className="font-bold mb-3">👥 Total Social (mois)</h3>
              <Row label="Masse salariale"               value={`${fmt(calc.masse)} FCFA`} />
              <Row label={`CNSS patronal ${(taux.cnssEmp*100).toFixed(1)}%`} value={`${fmt(calc.cnssEmp)} FCFA`} />
              <Row label={`AMU patronal ${(taux.amuEmp*100).toFixed(0)}%`}   value={`${fmt(calc.amuEmp)} FCFA`} />
              <Row label="IRPP (bulletins)"              value={irppTotal > 0 ? `${fmt(irppTotal)} FCFA` : "—"} />
              <Row label="TOTAL CHARGES SOCIALES"        value={`${fmt(calc.totalSocial)} FCFA`} strong />
            </div>
          </div>
        </TabsContent>

        {/* ══ TVA ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="tva" className="space-y-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-bold">Déclaration TVA — {nomMois} {annee}</h3>
            <ExportBtns
              onExcel={() => dlExcel(`TVA_${annee}_${mois}`, "TVA", [tvaHead[0], ...tvaBody])}
              onPdf={() => dlPDF(`TVA_${annee}_${mois}`, tvaTitre, tvaHead, tvaBody)}
              onWord={() => dlWord(`TVA_${annee}_${mois}`, tvaTitre, tvaTableHtml)}
            />
          </div>

          <div className="border rounded-lg overflow-hidden text-sm">
            <table className="w-full">
              <thead className="bg-muted text-xs font-semibold">
                <tr>
                  <th className="p-3 text-left w-12">N°</th>
                  <th className="p-3 text-left">Libellé</th>
                  <th className="p-3 text-right w-44">Montant (FCFA)</th>
                </tr>
              </thead>
              <tbody>
                {/* Section I */}
                <tr className="bg-blue-50 dark:bg-blue-900/20">
                  <td colSpan={3} className="px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 uppercase">
                    Section I — Opérations taxables
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="p-3 font-bold text-muted-foreground text-xs">01</td>
                  <td className="p-3">Chiffre d'affaires HT du mois</td>
                  <td className="p-3 text-right font-mono font-semibold">{fmt(calc.rec)} FCFA</td>
                </tr>
                <tr className="border-b font-semibold bg-muted/10">
                  <td className="p-3 font-bold text-xs">02</td>
                  <td className="p-3">TVA collectée sur opérations taxables ({(taux.tva*100).toFixed(0)}%)</td>
                  <td className="p-3 text-right font-mono text-primary">{fmt(calc.tvaCollectee)} FCFA</td>
                </tr>

                {/* Section II */}
                <tr className="bg-green-50 dark:bg-green-900/20">
                  <td colSpan={3} className="px-3 py-1.5 text-xs font-bold text-green-700 dark:text-green-300 uppercase">
                    Section II — Déductions
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="p-3 font-bold text-muted-foreground text-xs">03</td>
                  <td className="p-3">Crédit de TVA reporté du mois précédent</td>
                  <td className="p-3 text-right font-mono text-muted-foreground">0 FCFA</td>
                </tr>
                <tr className="border-b">
                  <td className="p-3 font-bold text-muted-foreground text-xs">04</td>
                  <td className="p-3">TVA déductible sur achats de biens et services</td>
                  <td className="p-3 text-right font-mono">{fmt(calc.tvaDeductible)} FCFA</td>
                </tr>
                <tr className="border-b">
                  <td className="p-3 font-bold text-muted-foreground text-xs">05</td>
                  <td className="p-3">TVA déductible sur immobilisations</td>
                  <td className="p-3 text-right font-mono text-muted-foreground">0 FCFA</td>
                </tr>
                <tr className="border-b font-semibold bg-muted/10">
                  <td className="p-3 font-bold text-xs">20</td>
                  <td className="p-3">TOTAL DÉDUCTIONS (lg 03 + 04 + 05)</td>
                  <td className="p-3 text-right font-mono text-green-700 dark:text-green-400">{fmt(calc.tvaDeductible)} FCFA</td>
                </tr>

                {/* Section V */}
                <tr className="bg-orange-50 dark:bg-orange-900/20">
                  <td colSpan={3} className="px-3 py-1.5 text-xs font-bold text-orange-700 dark:text-orange-300 uppercase">
                    Section V — Résultat de la déclaration
                  </td>
                </tr>
                <tr className="border-b font-semibold">
                  <td className="p-3 font-bold text-xs">25</td>
                  <td className="p-3">BALANCE TVA (lg 02 − lg 20)</td>
                  <td className={`p-3 text-right font-mono font-bold ${calc.tvaNette >= 0 ? "text-destructive" : "text-green-700"}`}>
                    {fmt(calc.tvaNette)} FCFA
                  </td>
                </tr>
                {/* ─── LIGNE 26 — Explicite ─── */}
                <tr className={`border-b font-bold ${calc.tvaAPayer > 0 ? "bg-destructive/10" : ""}`}>
                  <td className={`p-3 font-extrabold text-lg ${calc.tvaAPayer > 0 ? "text-destructive" : "text-muted-foreground"}`}>26</td>
                  <td className="p-3 font-bold">TVA NETTE À PAYER [si lg 25 &gt; 0]</td>
                  <td className={`p-3 text-right font-mono font-extrabold text-lg ${calc.tvaAPayer > 0 ? "text-destructive" : ""}`}>
                    {calc.tvaAPayer > 0 ? `${fmt(calc.tvaAPayer)} FCFA` : "—"}
                  </td>
                </tr>
                <tr className={calc.creditAReporter > 0 ? "bg-green-50 dark:bg-green-900/10 font-bold" : ""}>
                  <td className={`p-3 font-bold ${calc.creditAReporter > 0 ? "text-green-700" : "text-muted-foreground"}`}>27</td>
                  <td className="p-3">CRÉDIT DE TVA À REPORTER [si lg 25 &lt; 0]</td>
                  <td className={`p-3 text-right font-mono ${calc.creditAReporter > 0 ? "text-green-700 font-bold" : "text-muted-foreground"}`}>
                    {calc.creditAReporter > 0 ? `${fmt(calc.creditAReporter)} FCFA` : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {calc.tvaAPayer > 0 && (
            <p className="text-xs text-muted-foreground">
              ⚠️ TVA à reverser avant le <strong>15 {MOIS_NOMS[mois] ?? `mois ${mois + 1}`} {mois < 12 ? annee : annee + 1}</strong> — OTR Togo
            </p>
          )}
        </TabsContent>

        {/* ══ IS / IMF ══════════════════════════════════════════════════════ */}
        <TabsContent value="is" className="space-y-4 mt-4">
          <h3 className="font-bold">IS / IMF — {annee}</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card-elevated p-5 space-y-1">
              <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Calcul mensuel</p>
              <Row label="CA (mois)"              value={`${fmt(calc.rec)} FCFA`} />
              <Row label="Dépenses (mois)"        value={`${fmt(calc.dep)} FCFA`} />
              <Row label="Bénéfice net (mois)"    value={`${fmt(calc.ben)} FCFA`} />
              <Row label={`IS ${(taux.is*100).toFixed(0)}% × bénéfice`} value={`${fmt(calc.is)} FCFA`} />
              <Row label={`IMF mensuel (${fmt(calc.imfAnnuel)} ÷ 12)`}  value={`${fmt(calc.imfMensuel)} FCFA`} />
              <Row label={`Régime appliqué : ${calc.regime}`}
                        value={`${fmt(calc.impot)} FCFA`} strong />
            </div>
            <div className="card-elevated p-5 space-y-1">
              <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Base annuelle</p>
              <Row label="CA annuel cumulé"        value={`${fmt(caAnnuel)} FCFA`} />
              <Row label="IMF = max(1% CA, 20 000)" value={`${fmt(calc.imfAnnuel)} FCFA`} />
              <Row label={`Taux IS`}               value={`${(taux.is*100).toFixed(0)}%`} />
              <Row label="IMF minimum légal"       value="20 000 FCFA / an" />
              <div className="mt-3 p-3 rounded bg-muted/40 text-xs text-muted-foreground">
                <p>CGI Togo — Art. 128 (IS) & Art. 141 (IMF)</p>
                <p className="mt-1">L'IS s'applique si IS &gt; IMF, sinon IMF prime.</p>
              </div>
            </div>
          </div>

          {/* Patente */}
          <div className="card-elevated p-5">
            <h4 className="font-bold mb-3">Taxe Professionnelle (Patente)</h4>
            <Row label={`Service : ${fmt(calc.recService)} FCFA × ${(taux.patenteService*100).toFixed(2)}%`} value={`${fmt(calc.patService)} FCFA`} />
            <Row label={`Commerce : ${fmt(calc.recCommerce)} FCFA × ${(taux.patenteCommerce*100).toFixed(2)}%`} value={`${fmt(calc.patCommerce)} FCFA`} />
            <Row label="TOTAL PATENTE" value={`${fmt(calc.pat)} FCFA`} strong />
          </div>
        </TabsContent>

        {/* ══ SOCIAL ════════════════════════════════════════════════════════ */}
        <TabsContent value="social" className="space-y-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-bold">Charges Sociales & IRPP — {nomMois} {annee}</h3>
          </div>

          {/* CNSS */}
          <div className="card-elevated p-5 space-y-1">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-sm">CNSS / AMU</h4>
              <ExportBtns
                onExcel={() => dlExcel(`CNSS_${annee}_${mois}`, "CNSS", [cnssHead[0], ...cnssBody])}
                onPdf={() => dlPDF(`CNSS_${annee}_${mois}`, cnssTitre, cnssHead, cnssBody)}
                onWord={() => dlWord(`CNSS_${annee}_${mois}`, cnssTitre, cnssTableHtml)}
              />
            </div>
            <Row label="Masse salariale brute"                    value={`${fmt(calc.masse)} FCFA`} />
            <Row label={`CNSS patronale ${(taux.cnssEmp*100).toFixed(1)}%`}  value={`${fmt(calc.cnssEmp)} FCFA`} />
            <Row label={`AMU patronale ${(taux.amuEmp*100).toFixed(0)}%`}    value={`${fmt(calc.amuEmp)} FCFA`} />
            <Row label="TOTAL CHARGES PATRONALES"                 value={`${fmt(calc.cnssEmp + calc.amuEmp)} FCFA`} strong />
            <div className="mt-2 pt-2 border-t border-border/40">
              <Row label={`CNSS salariale retenue ${(taux.cnssSal*100).toFixed(0)}%`} value={`${fmt(calc.cnssSal)} FCFA`} />
              <Row label={`AMU salariale retenue ${(taux.amuSal*100).toFixed(0)}%`}   value={`${fmt(calc.amuSal)} FCFA`} />
            </div>
          </div>

          {/* IRPP */}
          <div className="card-elevated p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-sm">IRPP — Impôt sur le Revenu des Personnes Physiques</h4>
              {bulletins.length > 0 && (
                <ExportBtns
                  onExcel={() => dlExcel(`IRPP_${annee}_${mois}`, "IRPP", [irppHead[0], ...irppBody])}
                  onPdf={() => dlPDF(`IRPP_${annee}_${mois}`, irppTitre, irppHead, irppBody)}
                  onWord={() => dlWord(`IRPP_${annee}_${mois}`, irppTitre, irppTableHtml)}
                />
              )}
            </div>
            {bulletins.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun bulletin de paie validé pour {nomMois} {annee}. Générez les bulletins depuis l'onglet GRH.
              </p>
            ) : (
              <div className="border rounded-lg overflow-hidden text-xs">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      {irppHead[0].map(h => <th key={h} className="p-2 text-left font-semibold">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {bulletins.map(b => (
                      <tr key={b.id} className="border-t hover:bg-muted/20">
                        <td className="p-2 font-medium">{b.employe_nom}</td>
                        <td className="p-2 text-right font-mono">{fmt(b.brut)}</td>
                        <td className="p-2 text-right font-mono">{fmt(b.cnss_sal)}</td>
                        <td className="p-2 text-right font-mono">{fmt(b.amu_sal)}</td>
                        <td className="p-2 text-right font-mono font-bold text-destructive">{fmt(b.irpp)}</td>
                        <td className="p-2 text-right font-mono font-semibold">{fmt(b.net_a_payer)}</td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/30 font-bold">
                      <td className="p-2">TOTAL</td>
                      <td className="p-2 text-right font-mono">{fmt(bulletins.reduce((a,b)=>a+b.brut,0))}</td>
                      <td className="p-2 text-right font-mono">{fmt(bulletins.reduce((a,b)=>a+b.cnss_sal,0))}</td>
                      <td className="p-2 text-right font-mono">{fmt(bulletins.reduce((a,b)=>a+b.amu_sal,0))}</td>
                      <td className="p-2 text-right font-mono text-destructive">{fmt(irppTotal)}</td>
                      <td className="p-2 text-right font-mono">{fmt(bulletins.reduce((a,b)=>a+b.net_a_payer,0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ══ PARAMÈTRES ════════════════════════════════════════════════════ */}
        <TabsContent value="params" className="space-y-6 mt-4">
          {/* TH + RSL */}
          <div className="card-elevated p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2">
                <Settings2 className="size-4" /> Paramètres annuels {annee}
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* TH */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wide">
                  Taxe d'Habitation (TH) annuelle
                </Label>
                <Input
                  type="number"
                  placeholder="Ex : 60 000"
                  value={thInput}
                  onChange={e => setThInput(e.target.value)}
                  disabled={!canEditSocial}
                  className="h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  Acomptes semestriels — 15 jan. ({fmt((parseFloat(thInput)||0)/2)} FCFA) + 15 juil. ({fmt((parseFloat(thInput)||0)/2)} FCFA)
                </p>
              </div>

              {/* RSL / Loyer */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wide">
                  Loyer annuel (base RSL)
                </Label>
                <Input
                  type="number"
                  placeholder="Ex : 600 000"
                  value={loyerInput}
                  onChange={e => setLoyerInput(e.target.value)}
                  disabled={!canEditSocial}
                  className="h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  RSL = loyer × 8,75% = <strong>{fmt(rslPreviewAnnuel)} FCFA/an</strong>
                  {" "}→ <strong>{fmt(rslPreviewMensuel)} FCFA/mois</strong> (≤ 15 du mois suivant)
                </p>
              </div>
            </div>

            {canEditSocial && (
              <Button size="sm" onClick={sauverParams} className="bg-success text-success-foreground hover:bg-success/90">
                ✓ Enregistrer les paramètres annuels
              </Button>
            )}
          </div>

          {/* TauxImpots */}
          {societeId && (
            <div className="card-elevated p-5">
              <h3 className="font-bold mb-4">Régime fiscal & Impôts applicables</h3>
              <TauxImpots societeId={societeId} canEdit={canEditTaux} />
            </div>
          )}

          {/* GestionDelegations */}
          {societeId && user?.id && (
            <div className="card-elevated p-5">
              <GestionDelegations
                societeId={societeId}
                currentUserId={user.id}
                canEdit={canEditTaux}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      <TauxHistoriqueDialog
        open={showHistorique}
        onOpenChange={setShowHistorique}
        historique={tauxHistorique}
        onAjouter={onAjouterTaux}
        onSupprimer={onSupprimerTaux}
      />
    </div>
  );
};
