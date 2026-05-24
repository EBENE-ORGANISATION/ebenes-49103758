import { useMemo, useState, useEffect, useCallback } from "react";
import {
  Employe, MoisData, ParamsAnnuels, DonneesMensuelles, TauxFiscaux, MOIS_NOMS,
} from "@/types/ebene";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "./StatCard";
import { formatMontant, tauxPourMois, moisKey } from "@/lib/ebene-utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Settings2, History, Lock, Unlock, AlertCircle, CheckCircle2,
  FileSpreadsheet, FileText, FileDown,
} from "lucide-react";
import { TauxHistoriqueDialog } from "./TauxHistoriqueDialog";
import { TauxImpots } from "@/components/ebene/TauxImpots";
import { GestionDelegations } from "@/components/ebene/GestionDelegations";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { useBulletinsPaie } from "@/hooks/useBulletinsPaie";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers clôture ──────────────────────────────────────────────────────────

function getStatutMois(annee: number, mois: number): "futur" | "en_cours" | "cloture" {
  const now = new Date();
  if (now.getFullYear() === annee && now.getMonth() + 1 === mois) return "en_cours";
  if (new Date(annee, mois, 0) < now) return "cloture";
  return "futur";
}

// ─── Badge statut ─────────────────────────────────────────────────────────────

const StatutBadge = ({ annee, mois }: { annee: number; mois: number }) => {
  const s = getStatutMois(annee, mois);
  if (s === "cloture")
    return <Badge variant="secondary" className="gap-1 text-xs"><Lock className="size-3" /> Clôturé</Badge>;
  if (s === "en_cours")
    return <Badge className="gap-1 text-xs bg-green-600 text-white"><Unlock className="size-3" /> En cours</Badge>;
  return <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">À venir</Badge>;
};

// ─── Lignes tableau ───────────────────────────────────────────────────────────

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`flex justify-between py-1.5 ${strong ? "font-bold text-base border-t-2 border-border pt-2 mt-1" : "text-sm"}`}>
    <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
    <span className="amount">{value}</span>
  </div>
);

const RowSmall = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between py-0.5 text-xs text-muted-foreground italic pl-3">
    <span>{label}</span><span className="amount">{value}</span>
  </div>
);

// ─── Exports ──────────────────────────────────────────────────────────────────

function dlExcel(filename: string, sheetName: string, rows: (string | number)[][]): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

function dlPDF(filename: string, title: string, head: string[], body: (string | number)[][]): void {
  const doc = new jsPDF();
  doc.setFontSize(13);
  doc.text(title, 14, 18);
  autoTable(doc, {
    startY: 26,
    head: [head],
    body: body.map((r) => r.map(String)),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 138] },
  });
  doc.save(filename);
}

function dlWord(filename: string, title: string, tableHtml: string): void {
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
    xmlns:w='urn:schemas-microsoft-com:office:word'
    xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'>
    <style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #000;padding:4px 8px}th{background:#e2e8f0;font-weight:bold}</style>
    </head><body>
    <h2 style="font-family:Arial">${title}</h2>
    ${tableHtml}
    </body></html>`;
  const blob = new Blob([html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

function buildTableHtml(head: string[], body: (string | number)[][]): string {
  return `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

// ─── Composant principal ──────────────────────────────────────────────────────

export const Fiscalite = ({
  data, employes, annee, mois, paramsAnnee, onUpdateParams,
  donneesMensuelles, tauxHistorique, onAjouterTaux, onSupprimerTaux,
}: Props) => {
  const { can, user } = useAuth();
  const { currentSociete, societeConfig } = useTenant();
  const { bulletins, loadBulletins } = useBulletinsPaie(currentSociete?.id ?? null);

  const canEditTaux   = can("fiscalite", "write");
  const canEditSocial = can("parametres_sociaux", "write");

  const [editParams,     setEditParams]     = useState(false);
  const [thInput,        setThInput]        = useState(String(paramsAnnee.th        ?? 0));
  const [loyerInput,     setLoyerInput]     = useState(String(paramsAnnee.loyerAnnuel ?? 0));
  const [showHistorique, setShowHistorique] = useState(false);

  useEffect(() => {
    setThInput(String(paramsAnnee.th        ?? 0));
    setLoyerInput(String(paramsAnnee.loyerAnnuel ?? 0));
  }, [paramsAnnee, annee]);

  // Charger les bulletins du mois pour IRPP
  useEffect(() => {
    if (currentSociete?.id) void loadBulletins(annee, mois);
  }, [annee, mois, currentSociete?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const taux   = useMemo(() => tauxPourMois(tauxHistorique, annee, mois), [tauxHistorique, annee, mois]);
  const statut = getStatutMois(annee, mois);
  const estCloture = statut === "cloture";

  // ── CA annuel ───────────────────────────────────────────────────────────────
  const caAnnuel = useMemo(() => {
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const md = donneesMensuelles[moisKey(annee, m)];
      if (!md) continue;
      total += (md.transactions || []).filter((t) => t.type === "r").reduce((a, t) => a + t.m, 0);
    }
    return total;
  }, [donneesMensuelles, annee]);

  // ── Calculs du mois ─────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const recettes    = data.transactions.filter((t) => t.type === "r");
    const rec         = recettes.reduce((a, t) => a + t.m, 0);
    const recService  = recettes.filter((t) => (t.activite || taux.activiteDefaut) === "service").reduce((a, t) => a + t.m, 0);
    const recCommerce = recettes.filter((t) => (t.activite || taux.activiteDefaut) === "commerce").reduce((a, t) => a + t.m, 0);
    const dep         = Math.abs(data.transactions.filter((t) => t.type === "d").reduce((a, t) => a + t.m, 0));
    const ben         = Math.max(0, rec - dep);
    const is          = ben * taux.is;
    const imfTheoriqueAnnuel = Math.max(taux.imfMin, caAnnuel * taux.imfTaux);
    const imfMensuel  = imfTheoriqueAnnuel / 12;
    const impot       = Math.max(is, imfMensuel);
    const regime      = is >= imfMensuel ? "IS" : "IMF";

    // TVA depuis écritures SYSCOHADA validées
    const ecritures = (data.ecritures || []).filter((e) => e.statut === "valide");
    let tvaCollectee  = 0, tvaDeductible = 0, creditReporte = 0;
    ecritures.forEach((e) => {
      e.lignes.forEach((l) => {
        const s = l.credit - l.debit;
        if (l.compte.startsWith("4431") || l.compte.startsWith("4432")) tvaCollectee  += Math.max(0,  s);
        if (l.compte.startsWith("4452") || l.compte.startsWith("4451")) tvaDeductible += Math.max(0, -s);
        if (l.compte === "4449")                                          creditReporte += Math.max(0, -s);
      });
    });
    const tvaNet            = tvaCollectee - tvaDeductible - creditReporte;
    const tvaSimplifiee     = Math.max(0, rec * taux.tva - dep * taux.tva);
    const tvaAPayer         = ecritures.length > 0 ? Math.max(0, tvaNet) : tvaSimplifiee;
    const creditAReporter   = ecritures.length > 0 && tvaNet < 0 ? Math.abs(tvaNet) : 0;

    const patService  = recService  * taux.patenteService;
    const patCommerce = recCommerce * taux.patenteCommerce;
    const pat         = patService + patCommerce;

    // TH : acompte semestriel — dû uniquement en janvier (15/01) et juillet (15/07)
    const thAnnuel  = paramsAnnee.th ?? 0;
    const thDuMois  = (mois === 1 || mois === 7) ? thAnnuel / 2 : 0;

    // RSL : loyer annuel × 8,75 % → mensualité (payée avant le 15 du mois suivant)
    const loyerAnnuel = paramsAnnee.loyerAnnuel ?? 0;
    const rslAnnuel   = loyerAnnuel * 0.0875;
    const rslMensuel  = rslAnnuel / 12;

    let masse = 0;
    employes.forEach((e) => {
      masse += e.salaire + (e.sursalaire || 0);
      (data.primes[e.id] || []).forEach((p) => (masse += p.montant || 0));
    });
    const cnss = masse * taux.cnssEmp;
    const amu  = masse * taux.amuEmp;

    return {
      rec, dep, ben, is, imfMensuel, imfAnnuel: imfTheoriqueAnnuel, impot, regime,
      tvaAPayer, creditAReporter, tvaCollectee, tvaDeductible, creditReporte,
      pat, patService, patCommerce, recService, recCommerce,
      thAnnuel, thDuMois,
      loyerAnnuel, rslAnnuel, rslMensuel,
      masse, cnss, amu,
      totalFiscal: tvaAPayer + impot + pat + thDuMois + rslMensuel,
      totalSocial: cnss + amu,
    };
  }, [data, employes, paramsAnnee, taux, caAnnuel, mois]);

  // ── Calculs annuels ─────────────────────────────────────────────────────────
  const calcAnnuel = useMemo(() => {
    let caTotal = 0, depTotal = 0;
    for (let m = 1; m <= 12; m++) {
      const md = donneesMensuelles[moisKey(annee, m)];
      if (!md) continue;
      caTotal  += (md.transactions || []).filter((t) => t.type === "r").reduce((a, t) => a + t.m, 0);
      depTotal += Math.abs((md.transactions || []).filter((t) => t.type === "d").reduce((a, t) => a + t.m, 0));
    }
    const benAnnuel   = Math.max(0, caTotal - depTotal);
    const isAnnuel    = benAnnuel * taux.is;
    const imfAnnuel   = Math.max(taux.imfMin, caTotal * taux.imfTaux);
    const impotAnnuel = Math.max(isAnnuel, imfAnnuel);
    const rslAnnuel   = (paramsAnnee.loyerAnnuel ?? 0) * 0.0875;
    return {
      caTotal, depTotal, benAnnuel, isAnnuel, imfAnnuel, impotAnnuel,
      rslAnnuel, regime: isAnnuel >= imfAnnuel ? "IS" : "IMF",
    };
  }, [donneesMensuelles, annee, taux, paramsAnnee]);

  // ── IRPP depuis bulletins ───────────────────────────────────────────────────
  const irppTotal = useMemo(() =>
    bulletins.reduce((a, b) => a + (b.irpp ?? 0), 0),
  [bulletins]);

  const sauverParams = () => {
    onUpdateParams({
      th:          parseFloat(thInput)    || 0,
      loyerAnnuel: parseFloat(loyerInput) || 0,
    });
    setEditParams(false);
  };

  // ── Labels ──────────────────────────────────────────────────────────────────
  const periodeLabel  = `${MOIS_NOMS[mois - 1]} ${annee}`;
  const moisSuivant   = mois === 12 ? 1 : mois + 1;
  const anneeSuivante = mois === 12 ? annee + 1 : annee;
  const dateLimite15  = `15/${String(moisSuivant).padStart(2, "0")}/${anneeSuivante}`;

  const fmt = formatMontant;

  // ── Export TVA ──────────────────────────────────────────────────────────────
  const tvaHead  = ["Ligne", "Désignation", "Montant (FCFA)"];
  const tvaRows: (string | number)[][] = [
    ["—", "NIF",                           societeConfig?.nif    || ""],
    ["—", "Raison sociale",                currentSociete?.nom   || ""],
    ["—", "Période",                       periodeLabel],
    ["1",  "TOTAL CA HT",                  calc.rec],
    ["6",  "Opérations taxables",          calc.rec],
    ["7",  "• Au taux 18%",                calc.rec],
    ["11", "TOTAL TVA BRUTE",              calc.tvaCollectee],
    ["12", "TVA collectée (18%)",          calc.tvaCollectee],
    ["16", "TOTAL TVA DÉDUCTIBLE",         calc.tvaDeductible + calc.creditReporte],
    ["17", "• Crédit reporté (cpt 4449)",  calc.creditReporte],
    ["18", "• Déductions biens/services",  calc.tvaDeductible],
    ["23", "TVA collectée (= lg 12)",      calc.tvaCollectee],
    ["24", "TVA déductible (= lg 16)",     calc.tvaDeductible + calc.creditReporte],
    ["25", "TVA Nette [23 - 24]",          calc.tvaCollectee - (calc.tvaDeductible + calc.creditReporte)],
    ["26", "TVA NETTE À PAYER",            calc.tvaAPayer],
    ["27", "CRÉDIT DE TVA À REPORTER",     calc.creditAReporter],
  ];
  const exportTVA = useCallback((fmt_: "excel" | "pdf" | "word") => {
    const title = `Déclaration TVA — ${periodeLabel}`;
    const fn = `TVA-${annee}-${String(mois).padStart(2, "0")}`;
    if (fmt_ === "excel") dlExcel(`${fn}.xlsx`, "TVA", [tvaHead, ...tvaRows]);
    if (fmt_ === "pdf")   dlPDF(`${fn}.pdf`, title, tvaHead, tvaRows);
    if (fmt_ === "word")  dlWord(`${fn}.doc`, title, buildTableHtml(tvaHead, tvaRows));
  }, [tvaRows, periodeLabel, annee, mois]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Export CNSS/AMU ─────────────────────────────────────────────────────────
  const cnssHead = ["Employé", "Brut", "CNSS pat.", "AMU pat.", "Total patronal"];
  const cnssRows: (string | number)[][] = employes.map((e) => {
    const brut = e.salaire + (e.sursalaire || 0);
    return [e.nom, brut, Math.round(brut * taux.cnssEmp), Math.round(brut * taux.amuEmp), Math.round(brut * (taux.cnssEmp + taux.amuEmp))];
  });
  cnssRows.push(["TOTAL", calc.masse, Math.round(calc.cnss), Math.round(calc.amu), Math.round(calc.totalSocial)]);
  const exportCNSS = useCallback((fmt_: "excel" | "pdf" | "word") => {
    const title = `Déclaration CNSS/AMU — ${periodeLabel}`;
    const fn = `CNSS-${annee}-${String(mois).padStart(2, "0")}`;
    if (fmt_ === "excel") dlExcel(`${fn}.xlsx`, "CNSS", [cnssHead, ...cnssRows]);
    if (fmt_ === "pdf")   dlPDF(`${fn}.pdf`, title, cnssHead, cnssRows);
    if (fmt_ === "word")  dlWord(`${fn}.doc`, title, buildTableHtml(cnssHead, cnssRows));
  }, [cnssRows, periodeLabel, annee, mois]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Export IRPP ─────────────────────────────────────────────────────────────
  const irppHead = ["Employé", "Brut", "CNSS sal.", "AMU sal.", "IRPP retenu", "Net à payer"];
  const irppRows: (string | number)[][] = bulletins.map((b) => [
    b.employe_nom, b.brut, b.cnss_sal, b.amu_sal, b.irpp, b.net_a_payer,
  ]);
  if (irppRows.length === 0) {
    irppRows.push(["Aucun bulletin généré pour cette période", "", "", "", "", ""]);
  } else {
    irppRows.push(["TOTAL", bulletins.reduce((a, b) => a + b.brut, 0), "", "", irppTotal, bulletins.reduce((a, b) => a + b.net_a_payer, 0)]);
  }
  const exportIRPP = useCallback((fmt_: "excel" | "pdf" | "word") => {
    const title = `Déclaration IRPP — ${periodeLabel}`;
    const fn = `IRPP-${annee}-${String(mois).padStart(2, "0")}`;
    if (fmt_ === "excel") dlExcel(`${fn}.xlsx`, "IRPP", [irppHead, ...irppRows]);
    if (fmt_ === "pdf")   dlPDF(`${fn}.pdf`, title, irppHead, irppRows);
    if (fmt_ === "word")  dlWord(`${fn}.doc`, title, buildTableHtml(irppHead, irppRows));
  }, [irppRows, periodeLabel, annee, mois]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Boutons export réutilisables ────────────────────────────────────────────
  const ExportBtns = ({ onExport }: { onExport: (f: "excel" | "pdf" | "word") => void }) => (
    <div className="flex gap-1.5 flex-wrap">
      <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => onExport("excel")}>
        <FileSpreadsheet className="size-3" /> Excel
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => onExport("pdf")}>
        <FileText className="size-3" /> PDF
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => onExport("word")}>
        <FileDown className="size-3" /> Word
      </Button>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-bold text-lg">Fiscalité — {periodeLabel}</h2>
          <StatutBadge annee={annee} mois={mois} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground italic">
            {estCloture ? "📅 Période clôturée" : `📅 Dépôt avant le ${dateLimite15}`}
          </p>
          {canEditTaux && (
            <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={() => setShowHistorique(true)}>
              <History className="size-3" /> Taux
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="CA (Mois)"       value={fmt(calc.rec)}      tone="info"        />
        <StatCard label="Bénéfice (Mois)" value={fmt(calc.ben)}      tone="success"     />
        <StatCard label="TVA nette"       value={fmt(calc.tvaAPayer)} tone="warning"
          hint={calc.creditAReporter > 0 ? `Crédit : ${fmt(calc.creditAReporter)}` : undefined} />
        <StatCard label={`Impôt (${calc.regime})`} value={fmt(calc.impot)} tone="destructive" />
      </div>

      <Tabs defaultValue="tva" className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full h-auto mb-4">
          <TabsTrigger value="dashboard" className="py-2 text-sm">📊 Tableau de bord</TabsTrigger>
          <TabsTrigger value="tva"       className="py-2 text-sm">🧾 TVA</TabsTrigger>
          <TabsTrigger value="is"        className="py-2 text-sm">💼 IS / IMF</TabsTrigger>
          <TabsTrigger value="social"    className="py-2 text-sm">👷 Social</TabsTrigger>
          <TabsTrigger value="params"    className="py-2 text-sm">⚙️ Paramètres</TabsTrigger>
        </TabsList>

        {/* ── Tableau de bord ──────────────────────────────────────────────── */}
        <TabsContent value="dashboard">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 space-y-2">
              <h3 className="font-bold">📊 Récapitulatif annuel {annee}</h3>
              <Row label="CA total annuel"     value={fmt(calcAnnuel.caTotal)}     />
              <Row label="Bénéfice estimé"     value={fmt(calcAnnuel.benAnnuel)}   />
              <Row label={`IS ${(taux.is*100).toFixed(0)}% sur bénéfice`}                       value={fmt(calcAnnuel.isAnnuel)}    />
              <Row label={`IMF min ${fmt(taux.imfMin)} ou ${(taux.imfTaux*100).toFixed(2)}% CA`} value={fmt(calcAnnuel.imfAnnuel)}   />
              <Row label={`→ Impôt retenu (${calcAnnuel.regime})`} value={fmt(calcAnnuel.impotAnnuel)} strong />
            </Card>

            <Card className="p-5 space-y-2">
              <h3 className="font-bold">📅 Suivi mensuel TVA — {annee}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 pr-2">Mois</th>
                      <th className="text-right py-1 pr-2">CA HT</th>
                      <th className="text-right py-1">TVA nette</th>
                      <th className="text-center py-1">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOIS_NOMS.map((nom, i) => {
                      const m  = i + 1;
                      const md = donneesMensuelles[moisKey(annee, m)];
                      const recM = (md?.transactions || []).filter((t) => t.type === "r").reduce((a, t) => a + t.m, 0);
                      let tvaM = 0;
                      (md?.ecritures || []).filter((e) => e.statut === "valide").forEach((e) => {
                        e.lignes.forEach((l) => {
                          const s = l.credit - l.debit;
                          if (l.compte.startsWith("4431") || l.compte.startsWith("4432")) tvaM += Math.max(0,  s);
                          if (l.compte.startsWith("4452") || l.compte.startsWith("4451")) tvaM -= Math.max(0, -s);
                        });
                      });
                      const st = getStatutMois(annee, m);
                      return (
                        <tr key={m} className={`border-t ${m === mois ? "bg-primary/5 font-semibold" : ""}`}>
                          <td className="py-1 pr-2">{nom.slice(0, 3)}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{recM > 0 ? fmt(recM) : "—"}</td>
                          <td className={`py-1 text-right tabular-nums ${tvaM < 0 ? "text-green-600" : tvaM > 0 ? "text-destructive" : ""}`}>
                            {tvaM !== 0 ? fmt(Math.abs(tvaM)) : "—"}
                          </td>
                          <td className="py-1 text-center">
                            {st === "cloture" && "🔒"}{st === "en_cours" && <span className="text-green-600">●</span>}{st === "futur" && <span className="text-muted-foreground">○</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ── TVA OTR ──────────────────────────────────────────────────────── */}
        <TabsContent value="tva">
          <div className="space-y-3 max-w-4xl">
            {/* Actions */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-muted-foreground">
                Auto-rempli depuis les écritures SYSCOHADA validées (4431, 4432, 4452, 4449).
                Vérifiez avant dépôt à l'OTR.
              </p>
              <ExportBtns onExport={exportTVA} />
            </div>

            {/* Formulaire OTR */}
            <div className="border-2 border-foreground rounded-lg overflow-hidden">
              {/* En-tête */}
              <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-bold">DÉCLARATION DE TVA — Mod TVA 2016</p>
                  <p className="text-xs opacity-75">OTR/PrF-Dpl/Bdr/001 — 163, Rue des impôts BP 321 Lomé-TOGO</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{periodeLabel}</p>
                  {estCloture
                    ? <Badge variant="secondary" className="mt-1 gap-1"><Lock className="size-3" /> Clôturé</Badge>
                    : <Badge className="mt-1 bg-green-600/80 text-white gap-1"><Unlock className="size-3" /> En cours</Badge>}
                </div>
              </div>

              {/* Identification */}
              <div className="p-4 bg-muted/20 border-b grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-bold uppercase text-muted-foreground mb-1">I. Identification</p>
                  <p><span className="text-muted-foreground">NIF : </span><span className="font-mono font-bold">{societeConfig?.nif || "—"}</span></p>
                  <p><span className="text-muted-foreground">Raison sociale : </span><span className="font-semibold">{currentSociete?.nom || "—"}</span></p>
                </div>
                <div className="flex flex-col items-end justify-center gap-1">
                  <Badge variant={calc.tvaAPayer > 0 ? "destructive" : "default"} className="text-sm px-3 py-1.5">
                    {calc.tvaAPayer > 0 ? `TVA à payer : ${fmt(calc.tvaAPayer)} FCFA`
                      : calc.creditAReporter > 0 ? `Crédit à reporter : ${fmt(calc.creditAReporter)} FCFA`
                      : "Néant"}
                  </Badge>
                  {!estCloture && <p className="text-xs text-muted-foreground">À déposer avant le {dateLimite15}</p>}
                </div>
              </div>

              {/* Sections II + III */}
              <div className="grid grid-cols-1 lg:grid-cols-2 border-b">
                <div className="p-4 border-r">
                  <p className="font-bold text-xs mb-2 uppercase">II. Total CA HT</p>
                  <table className="w-full text-xs">
                    <tbody>
                      {[
                        ["1", "TOTAL CA HT",                  calc.rec > 0 ? fmt(calc.rec) : "—", true],
                        ["2", "Opérations non taxables",      "—"],
                        ["3", "• Exonérées",                  "—"],
                        ["4", "• Non imposées (attestations)", "—"],
                        ["5", "• Exportations non taxables",  "—"],
                        ["6", "Opérations taxables",          calc.rec > 0 ? fmt(calc.rec) : "—"],
                        ["7", "• Au taux 18% (hors LASM)",    fmt(calc.rec), true, true],
                        ["8", "• Marchés publics",            "—"],
                        ["9", "• LASM",                       "—"],
                        ["10","• Exportations",               "—"],
                      ].map(([num, label, val, bold, highlight]) => (
                        <tr key={String(num)} className={`border-b ${highlight ? "bg-blue-50/40 dark:bg-blue-900/10" : ""}`}>
                          <td className={`py-1 pr-2 w-7 text-center ${bold ? "font-bold text-primary" : "text-muted-foreground"}`}>{num}</td>
                          <td className={`py-1 pr-2 ${bold ? "font-semibold" : ""}`}>{label}</td>
                          <td className={`py-1 text-right font-mono w-24 ${bold ? "font-bold text-primary" : ""}`}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4">
                  <p className="font-bold text-xs mb-2 uppercase">III. TVA Brute</p>
                  <table className="w-full text-xs">
                    <tbody>
                      {[
                        ["11","TOTAL TVA BRUTE",        fmt(calc.tvaCollectee), true],
                        ["12","TVA collectée = 13+14+15",fmt(calc.tvaCollectee)],
                        ["13","• Au taux 18%",           fmt(calc.tvaCollectee), true, true],
                        ["14","• Marchés publics",       "—"],
                        ["15","• LASM",                  "—"],
                      ].map(([num, label, val, bold, highlight]) => (
                        <tr key={String(num)} className={`border-b ${highlight ? "bg-blue-50/40 dark:bg-blue-900/10" : ""}`}>
                          <td className={`py-1 pr-2 w-7 text-center ${bold ? "font-bold text-primary" : "text-muted-foreground"}`}>{num}</td>
                          <td className={`py-1 pr-2 ${bold ? "font-semibold" : ""}`}>{label}</td>
                          <td className={`py-1 text-right font-mono w-24 ${bold ? "font-bold text-primary" : ""}`}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section IV */}
              <div className="p-4 border-b">
                <p className="font-bold text-xs mb-2 uppercase">IV. TVA Déductible</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <table className="w-full text-xs">
                    <tbody>
                      {[
                        ["16","TOTAL TVA DÉDUCTIBLE",           fmt(calc.tvaDeductible + calc.creditReporte), true],
                        ["17","• Crédit reporté (cpt 4449)",    calc.creditReporte > 0 ? fmt(calc.creditReporte) : "—"],
                        ["18","• Déductions biens/services",    calc.tvaDeductible > 0 ? fmt(calc.tvaDeductible) : "—", false, true],
                        ["19","• Déductions immobilisations",   "—"],
                      ].map(([num, label, val, bold, highlight]) => (
                        <tr key={String(num)} className={`border-b ${highlight ? "bg-green-50/30 dark:bg-green-900/10" : ""}`}>
                          <td className={`py-1 pr-2 w-7 text-center ${bold ? "font-bold text-primary" : "text-muted-foreground"}`}>{num}</td>
                          <td className="py-1 pr-2">{label}</td>
                          <td className={`py-1 text-right font-mono w-24 ${bold ? "font-bold text-primary" : ""}`}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <table className="w-full text-xs">
                    <tbody>
                      {[["20","Régularisation — Complément","—"],["21","Régularisation — Reversement","—"],["22","Prorata de déduction","100 %"]].map(([num, label, val]) => (
                        <tr key={String(num)} className="border-b">
                          <td className="py-1 pr-2 w-7 text-center text-muted-foreground">{num}</td>
                          <td className="py-1 pr-2 text-muted-foreground">{label}</td>
                          <td className="py-1 text-right font-mono w-24">{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section V — TVA Nette (avec LIGNE 26 explicite) */}
              <div className="p-4 border-b">
                <p className="font-bold text-xs mb-3 uppercase">V. TVA Nette à Payer ou Crédit de TVA</p>
                <table className="w-full text-xs">
                  <tbody>
                    <tr className="border-b bg-muted/30">
                      <td className="py-2 pr-2 w-7 text-center text-muted-foreground font-bold">23</td>
                      <td className="py-2 pr-2">TVA collectée (= ligne 12)</td>
                      <td className="py-2 text-right font-mono w-32">{fmt(calc.tvaCollectee)}</td>
                    </tr>
                    <tr className="border-b bg-muted/30">
                      <td className="py-2 pr-2 text-center text-muted-foreground font-bold">24</td>
                      <td className="py-2 pr-2">TVA déductible (= ligne 16)</td>
                      <td className="py-2 text-right font-mono">{fmt(calc.tvaDeductible + calc.creditReporte)}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-2 text-center text-muted-foreground">25</td>
                      <td className="py-2 pr-2 text-muted-foreground">TVA nette [23 − 24]</td>
                      <td className="py-2 text-right font-mono">
                        {fmt(calc.tvaCollectee - (calc.tvaDeductible + calc.creditReporte))}
                      </td>
                    </tr>
                    {/* ── LIGNE 26 — TVA NETTE À PAYER ── */}
                    <tr className={`border-b font-bold text-base ${calc.tvaAPayer > 0 ? "bg-destructive/10" : "bg-muted/20"}`}>
                      <td className={`py-3 pr-2 text-center font-extrabold text-lg ${calc.tvaAPayer > 0 ? "text-destructive" : "text-muted-foreground"}`}>26</td>
                      <td className="py-3 pr-2 font-bold">TVA NETTE À PAYER [si lg 25 &gt; 0]</td>
                      <td className={`py-3 text-right font-mono font-extrabold text-lg ${calc.tvaAPayer > 0 ? "text-destructive" : ""}`}>
                        {calc.tvaAPayer > 0 ? `${fmt(calc.tvaAPayer)} FCFA` : "—"}
                      </td>
                    </tr>
                    {/* ── LIGNE 27 — CRÉDIT À REPORTER ── */}
                    <tr className={calc.creditAReporter > 0 ? "bg-green-50 dark:bg-green-900/10 font-bold" : ""}>
                      <td className={`py-2 pr-2 text-center font-bold ${calc.creditAReporter > 0 ? "text-green-700" : "text-muted-foreground"}`}>27</td>
                      <td className="py-2 pr-2">CRÉDIT DE TVA À REPORTER [si lg 25 &lt; 0]</td>
                      <td className={`py-2 text-right font-mono ${calc.creditAReporter > 0 ? "text-green-700 font-bold" : "text-muted-foreground"}`}>
                        {calc.creditAReporter > 0 ? `${fmt(calc.creditAReporter)} FCFA` : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className={`p-4 flex items-center justify-between flex-wrap gap-3 ${calc.tvaAPayer > 0 ? "bg-destructive/5" : "bg-green-50/50 dark:bg-green-900/5"}`}>
                <div className="flex items-center gap-2">
                  {calc.tvaAPayer > 0
                    ? <AlertCircle className="size-5 text-destructive shrink-0" />
                    : <CheckCircle2 className="size-5 text-green-600 shrink-0" />}
                  <div>
                    <p className="font-bold text-sm">
                      {calc.tvaAPayer > 0
                        ? `Ligne 26 — TVA à payer : ${fmt(calc.tvaAPayer)} FCFA`
                        : calc.creditAReporter > 0
                        ? `Ligne 27 — Crédit à reporter : ${fmt(calc.creditAReporter)} FCFA`
                        : "Néant — TVA collectée = TVA déductible"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {estCloture ? "Période clôturée" : `À déposer à l'OTR avant le ${dateLimite15}`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── IS / IMF ─────────────────────────────────────────────────────── */}
        <TabsContent value="is">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 space-y-2">
              <h3 className="font-bold">💼 IS / IMF — Exercice {annee}</h3>
              <Row label="CA total annuel"    value={fmt(calcAnnuel.caTotal)}   />
              <Row label="Charges totales"    value={fmt(calcAnnuel.depTotal)}  />
              <Row label="Bénéfice imposable" value={fmt(calcAnnuel.benAnnuel)} />
              <Row label={`IS ${(taux.is*100).toFixed(0)}% × bénéfice`}                value={fmt(calcAnnuel.isAnnuel)}    />
              <RowSmall label={`IMF ${(taux.imfTaux*100).toFixed(2)}% × CA`}           value={fmt(caAnnuel * taux.imfTaux)}/>
              <RowSmall label="Minimum forfaitaire"                                     value={fmt(taux.imfMin)} />
              <Row label="IMF retenu (max des 2)"                                       value={fmt(calcAnnuel.imfAnnuel)}   />
              <Row label={`→ Impôt dû (${calcAnnuel.regime})`} value={fmt(calcAnnuel.impotAnnuel)} strong />
              <Row label="→ Provision mensuelle (÷ 12)"        value={fmt(calcAnnuel.impotAnnuel / 12)} />
            </Card>

            <Card className="p-5 space-y-2">
              <h3 className="font-bold">💼 Charges fiscales — {periodeLabel}</h3>
              <Row label={`TVA nette`}                  value={fmt(calc.tvaAPayer)} />
              <Row label={`Impôt (${calc.regime})`}     value={fmt(calc.impot)}    />
              <Row label="Patente"                       value={fmt(calc.pat)}      />
              <RowSmall label={`Service ${(taux.patenteService*100).toFixed(2)}%`} value={fmt(calc.patService)}   />
              <RowSmall label={`Commerce ${(taux.patenteCommerce*100).toFixed(2)}%`} value={fmt(calc.patCommerce)} />
              {/* RSL mensuel */}
              <Row
                label={`RSL mensuel (loyer ${fmt(calc.loyerAnnuel)} × 8,75% ÷ 12)`}
                value={fmt(calc.rslMensuel)}
              />
              <p className="text-[10px] text-muted-foreground italic pl-1">
                Payable avant le {dateLimite15} — RSL annuel : {fmt(calc.rslAnnuel)} FCFA
              </p>
              {/* TH semestriel */}
              <Row
                label={`TH${mois === 1 ? " — 1ᵉʳ acompte (dû 15/01)" : mois === 7 ? " — 2ᵉ acompte (dû 15/07)" : " (hors acompte ce mois)"}`}
                value={calc.thDuMois > 0 ? fmt(calc.thDuMois) : "—"}
              />
              {calc.thDuMois === 0 && (
                <p className="text-[10px] text-muted-foreground italic pl-1">
                  Prochains acomptes : {fmt((paramsAnnee.th ?? 0) / 2)} FCFA le 15/01 et 15/07
                </p>
              )}
              <Row label="TOTAL FISCAL MOIS" value={fmt(calc.totalFiscal)} strong />
              {canEditSocial && (
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs mt-1"
                  onClick={() => setEditParams(!editParams)}>
                  <Settings2 className="size-3" /> Modifier TH / Loyer
                </Button>
              )}
              {editParams && (
                <div className="bg-muted/40 border rounded p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs font-bold">TH annuel (FCFA)</Label>
                      <p className="text-[10px] text-muted-foreground mb-1">Acomptes : 15 janv. + 15 juil.</p>
                      <Input type="number" value={thInput} onChange={(e) => setThInput(e.target.value)} className="h-8" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold">Loyer annuel (FCFA)</Label>
                      <p className="text-[10px] text-muted-foreground mb-1">RSL = loyer × 8,75 % / 12</p>
                      <Input type="number" value={loyerInput} onChange={(e) => setLoyerInput(e.target.value)} className="h-8" />
                    </div>
                  </div>
                  {parseFloat(loyerInput) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      → RSL annuel : {fmt(parseFloat(loyerInput) * 0.0875)} FCFA
                      ({fmt(parseFloat(loyerInput) * 0.0875 / 12)} FCFA/mois)
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={sauverParams}>✓ Enregistrer</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditParams(false)}>Annuler</Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* ── Charges sociales + IRPP ───────────────────────────────────────── */}
        <TabsContent value="social">
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* CNSS / AMU */}
              <Card className="p-5 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-bold flex items-center gap-2">
                    👷 CNSS / AMU — {periodeLabel}
                    <StatutBadge annee={annee} mois={mois} />
                  </h3>
                  <ExportBtns onExport={exportCNSS} />
                </div>
                <Row label="Masse salariale brute"                               value={fmt(calc.masse)}        />
                <Row label={`CNSS employeur ${(taux.cnssEmp*100).toFixed(1)}%`}  value={fmt(calc.cnss)}         />
                <Row label={`AMU employeur ${(taux.amuEmp*100).toFixed(0)}%`}    value={fmt(calc.amu)}          />
                <Row label="TOTAL CHARGES PATRONALES" value={fmt(calc.totalSocial)} strong />
                <p className="text-[10px] text-muted-foreground italic">
                  À verser à la CNSS avant le {dateLimite15}
                </p>
              </Card>

              {/* IRPP */}
              <Card className="p-5 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-bold">🏛️ IRPP retenu à la source — {periodeLabel}</h3>
                  <ExportBtns onExport={exportIRPP} />
                </div>
                {bulletins.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic py-2">
                    Aucun bulletin généré pour cette période.
                    Générez les bulletins depuis l'onglet GRH → Bulletins de paie.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-1 pr-2">Employé</th>
                            <th className="text-right py-1 pr-2">Brut</th>
                            <th className="text-right py-1">IRPP retenu</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulletins.map((b) => (
                            <tr key={b.id} className="border-t">
                              <td className="py-1 pr-2">{b.employe_nom}</td>
                              <td className="py-1 pr-2 text-right tabular-nums">{fmt(b.brut)}</td>
                              <td className="py-1 text-right tabular-nums font-semibold text-destructive">{fmt(b.irpp)}</td>
                            </tr>
                          ))}
                          <tr className="border-t-2 border-border font-bold">
                            <td className="py-1.5 pr-2">TOTAL</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(bulletins.reduce((a, b) => a + b.brut, 0))}</td>
                            <td className="py-1.5 text-right tabular-nums text-destructive">{fmt(irppTotal)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">
                      IRPP à reverser à l'OTR avant le {dateLimite15}
                    </p>
                  </>
                )}
              </Card>
            </div>

            {/* Suivi annuel CNSS */}
            <Card className="p-5 space-y-2">
              <h3 className="font-bold">📅 Suivi CNSS / AMU — {annee}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 pr-2">Mois</th>
                      <th className="text-right py-1 pr-2">Masse salariale</th>
                      <th className="text-right py-1 pr-2">CNSS pat.</th>
                      <th className="text-right py-1">AMU pat.</th>
                      <th className="text-center py-1">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOIS_NOMS.map((nom, i) => {
                      const m  = i + 1;
                      const md = donneesMensuelles[moisKey(annee, m)];
                      let masseM = 0;
                      employes.forEach((e) => {
                        masseM += e.salaire + (e.sursalaire || 0);
                        ((md?.primes || {})[e.id] || []).forEach((p) => (masseM += p.montant || 0));
                      });
                      const cnssM = masseM * taux.cnssEmp;
                      const amuM  = masseM * taux.amuEmp;
                      const st = getStatutMois(annee, m);
                      return (
                        <tr key={m} className={`border-t ${m === mois ? "bg-primary/5 font-semibold" : ""}`}>
                          <td className="py-1 pr-2">{nom.slice(0, 3)}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{masseM > 0 ? fmt(masseM) : "—"}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{cnssM > 0 ? fmt(cnssM) : "—"}</td>
                          <td className="py-1 text-right tabular-nums">{amuM > 0 ? fmt(amuM) : "—"}</td>
                          <td className="py-1 text-center">
                            {st === "cloture" && "🔒"}{st === "en_cours" && <span className="text-green-600">●</span>}{st === "futur" && <span className="text-muted-foreground">○</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ── Paramètres ────────────────────────────────────────────────────── */}
        <TabsContent value="params">
          <div className="space-y-4">
            {currentSociete ? (
              <>
                <Card className="p-5 space-y-3">
                  <h3 className="font-bold">⚙️ Régime fiscal &amp; Obligations — {currentSociete.nom}</h3>
                  <TauxImpots societeId={currentSociete.id} canEdit={canEditTaux} />
                </Card>
                <Card className="p-5 space-y-3">
                  <h3 className="font-bold">👥 Délégations fiscales</h3>
                  <GestionDelegations
                    societeId={currentSociete.id}
                    currentUserId={user?.id ?? ""}
                    canEdit={canEditTaux}
                  />
                </Card>
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic text-center py-8">Aucune société sélectionnée.</p>
            )}
          </div>
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
