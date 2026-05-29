import { useMemo, useRef, useState, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  Employe, MoisData, ParamsAnnuels, DonneesMensuelles, TauxFiscaux, MOIS_NOMS,
  EcritureComptable,
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
  Printer, CheckCircle2, Unlock,
} from "lucide-react";
import { TauxHistoriqueDialog } from "./TauxHistoriqueDialog";
import { printElement } from "@/lib/print";
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
  const tvaPrintRef = useRef<HTMLDivElement>(null);

  // ── État TVA manuel (lignes saisies à la main) ────────────────────────────
  const [tvaManuel, setTvaManuel] = useState({
    l3:  0,   // ventes exonérées / hors champ
    l4:  0,   // opérations imposables autres taux
    l5:  0,   // livraisons à soi-même
    l8:  0,   // TVA sur importations
    l9:  0,   // TVA récupérable immobilisations (Sect. III)
    l10: 0,   // régularisations / reversements (+)
    l13: 0,   // TVA déductible sur immobilisations (Sect. IV)
    l14: 0,   // régularisations déductions (+)
    l15: 0,   // reversements (-)
    l16: 0,   // crédit TVA mois précédent reporté
    l17: 0,   // prorata de déduction (FCFA — s'ajoute aux autres déductions)
  });

  const setLigne = (key: keyof typeof tvaManuel, val: string) =>
    setTvaManuel(prev => ({ ...prev, [key]: parseFloat(val) || 0 }));

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

  // ── Extraction des montants depuis les écritures SYSCOHADA validées ───────
  // ligne 7 = ventes HT (comptes 701 / 706 / 707… côté crédit)
  const ligne7 = useMemo(() => {
    return (data.ecritures ?? [])
      .filter(e => e.statut === "valide" && e.journal === "VE")
      .reduce((sum, e) => {
        const lignes = Array.isArray(e.lignes) ? e.lignes : [];
        return sum + lignes
          .filter(l => l?.compte?.startsWith("70"))
          .reduce((a, l) => a + (l.credit || 0), 0);
      }, 0);
  }, [data.ecritures]);

  // ligne 13 = TVA collectée sur ventes (comptes 4431 / 4432)
  const ligne13 = useMemo(() => {
    return (data.ecritures ?? [])
      .filter(e => e.statut === "valide")
      .reduce((sum, e) => {
        const lignes = Array.isArray(e.lignes) ? e.lignes : [];
        return sum + lignes
          .filter(l => l?.compte?.startsWith("443"))
          .reduce((a, l) => a + (l.credit || 0), 0);
      }, 0);
  }, [data.ecritures]);

  // ligne 18 = TVA déductible sur achats (compte 4452)
  const ligne18 = useMemo(() => {
    return (data.ecritures ?? [])
      .filter(e => e.statut === "valide" && e.journal === "AC")
      .reduce((sum, e) => {
        const lignes = Array.isArray(e.lignes) ? e.lignes : [];
        return sum + lignes
          .filter(l => l?.compte?.startsWith("4452"))
          .reduce((a, l) => a + (l.debit || 0), 0);
      }, 0);
  }, [data.ecritures]);

  // ── Calcul formulaire TVA OTR ─────────────────────────────────────────────
  const tvaCalc = useMemo(() => {
    const hasEcritures = ligne7 > 0 || ligne13 > 0 || ligne18 > 0;

    // Section II — CA HT
    const l1  = hasEcritures ? ligne7 : calc.rec;
    const l2  = tvaManuel.l3;   // exonérées
    const l3  = tvaManuel.l4;   // autres taux
    const l4  = tvaManuel.l5;   // LASM
    const l6  = l1 + l2 + l3 + l4;  // total CA HT

    // Section III — TVA Brute
    const l7  = hasEcritures ? ligne13 : Math.round(calc.rec * taux.tva);
    const l8  = tvaManuel.l8;   // TVA importations
    const l9  = tvaManuel.l9;   // TVA récupérable immo (Sect. III)
    const l10 = tvaManuel.l10;  // régularisations +
    const l11 = l7 + l8 + l9 + l10;  // TOTAL TVA BRUTE

    // Section IV — TVA Déductible (nouvelle numérotation)
    const l12 = hasEcritures ? ligne18 : Math.round(calc.dep * taux.tva);  // AUTO 4452
    const l13 = tvaManuel.l13;  // déductions immobilisations
    const l14 = tvaManuel.l14;  // régularisations +
    const l15 = tvaManuel.l15;  // reversements -
    const l16 = tvaManuel.l16;  // crédit TVA reporté
    const l17 = tvaManuel.l17;  // prorata de déduction (FCFA — s'ajoute)
    const l18 = l12 + l13 + l14 - l15 + l16 + l17;  // TOTAL TVA DÉDUCTIBLE

    // Section V — Résultat
    const l19 = l11 - l18;           // SOLDE TVA
    const l20 = Math.max(0, l19);    // TVA NETTE À PAYER
    const l21 = Math.max(0, -l19);   // CRÉDIT À REPORTER

    return { l1, l2, l3, l4, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20, l21 };
  }, [calc, taux, tvaManuel, ligne7, ligne13, ligne18]);

  // ── Labels TVA ───────────────────────────────────────────────────────────
  const estCloture    = statut === "cloture";
  const periodeLabel  = `${nomMois} ${annee}`;
  const dateLimiteOTR = mois < 12
    ? `15 ${MOIS_NOMS[mois]} ${annee}`
    : `15 Janvier ${annee + 1}`;
  const societeConfig = currentSociete;

  // V5 — Jours restants avant échéance TVA (15 du mois suivant)
  const joursAvantEcheance = useMemo(() => {
    const now = new Date();
    const moisSuivant = mois === 12 ? 1 : mois + 1;
    const anneeSuivante = mois === 12 ? annee + 1 : annee;
    const limite = new Date(anneeSuivante, moisSuivant - 1, 15);
    return Math.ceil((limite.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }, [annee, mois]);

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
    ["I",  "── SECTION II — CHIFFRE D'AFFAIRES HT ──", ""],
    ["L1", "Ventes intérieures taxables (18%)",         fmt(tvaCalc.l1)],
    ["L2", "Ventes exonérées",                          fmt(tvaCalc.l2)],
    ["L3", "Opérations autres taux",                    fmt(tvaCalc.l3)],
    ["L4", "Livraisons à soi-même",                     fmt(tvaCalc.l4)],
    ["L6", "TOTAL CA HT",                               fmt(tvaCalc.l6)],
    ["II", "── SECTION III — TVA BRUTE ──", ""],
    ["L7", `TVA sur ventes intérieures (${(taux.tva*100).toFixed(0)}%)`, fmt(tvaCalc.l7)],
    ["L8", "TVA sur importations",                      fmt(tvaCalc.l8)],
    ["L11","TOTAL TVA BRUTE",                           fmt(tvaCalc.l11)],
    ["III","── SECTION IV — TVA DÉDUCTIBLE ──", ""],
    ["L12","TVA/achats locaux (4452)",                                   fmt(tvaCalc.l12)],
    ["L13","TVA déductible sur immobilisations",                         fmt(tvaCalc.l13)],
    ["L14","Régularisations déductions (+)",                             fmt(tvaCalc.l14)],
    ["L15","Reversements sur déductions (−)",                            fmt(tvaCalc.l15)],
    ["L16","Crédit TVA reporté du mois précédent",                       fmt(tvaCalc.l16)],
    ["L17","Prorata de déduction (FCFA)",                                fmt(tvaCalc.l17)],
    ["L18","TOTAL TVA DÉDUCTIBLE (L12+L13+L14−L15+L16+L17)",            fmt(tvaCalc.l18)],
    ["IV", "── SECTION V — RÉSULTAT ──", ""],
    ["L19","SOLDE TVA (L11 − L18)",                                      fmt(tvaCalc.l19)],
    ["L20","TVA NETTE À PAYER [si L19 > 0]",                            tvaCalc.l20 > 0 ? fmt(tvaCalc.l20) : "—"],
    ["L21","CRÉDIT À REPORTER [si L19 < 0]",                            tvaCalc.l21 > 0 ? fmt(tvaCalc.l21) : "—"],
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
          <TabsTrigger value="tva" className="gap-1.5">
            TVA
            {statut === "en_cours" && tvaCalc.l20 > 0 && joursAvantEcheance <= 5 && joursAvantEcheance >= 0 && (
              <span className="w-2 h-2 rounded-full bg-warning animate-pulse shrink-0" />
            )}
            {statut === "en_cours" && joursAvantEcheance < 0 && (
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse shrink-0" />
            )}
          </TabsTrigger>
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
          {/* ─ En-tête formulaire OTR ─ */}
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-bold text-base">
                Déclaration TVA — Mod. TVA 2016 OTR
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Période : <strong>{periodeLabel}</strong>
                {societeConfig?.nif && (
                  <> &nbsp;·&nbsp; NIF : <strong>{societeConfig.nif}</strong></>
                )}
              </p>
              {/* V5 — Badge délai dynamique */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {estCloture ? (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Lock className="size-3" /> Période clôturée
                  </Badge>
                ) : statut === "futur" ? (
                  <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                    ○ Période future
                  </Badge>
                ) : joursAvantEcheance < 0 ? (
                  <Badge variant="destructive" className="gap-1 text-xs animate-pulse">
                    <AlertCircle className="size-3" />
                    Échéance dépassée de {Math.abs(joursAvantEcheance)} jour{Math.abs(joursAvantEcheance) > 1 ? "s" : ""} !
                  </Badge>
                ) : joursAvantEcheance <= 5 ? (
                  <Badge className="gap-1 text-xs bg-warning text-warning-foreground">
                    <Clock className="size-3" />
                    {joursAvantEcheance === 0
                      ? "Dernier jour — à déposer aujourd'hui !"
                      : `Urgent — ${joursAvantEcheance} jour${joursAvantEcheance > 1 ? "s" : ""} restant${joursAvantEcheance > 1 ? "s" : ""}`}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    À déposer avant le {dateLimiteOTR} ({joursAvantEcheance} jours)
                  </Badge>
                )}
                {tvaCalc.l20 > 0 && !estCloture && (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    TVA due : {fmt(tvaCalc.l20)} FCFA
                  </Badge>
                )}
                {tvaCalc.l21 > 0 && (
                  <Badge className="gap-1 text-xs bg-success/15 text-success border-success/30">
                    Crédit à reporter : {fmt(tvaCalc.l21)} FCFA
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {(ligne7 > 0 || ligne13 > 0 || ligne18 > 0) && (
                <Badge className="gap-1 text-xs bg-emerald-600 text-white">
                  <CheckCircle2 className="size-3" />Écritures SYSCOHADA
                </Badge>
              )}
              <ExportBtns
                onExcel={() => dlExcel(`TVA_${annee}_${mois}`, "TVA", [tvaHead[0], ...tvaBody])}
                onPdf={() => dlPDF(`TVA_${annee}_${mois}`, tvaTitre, tvaHead, tvaBody)}
                onWord={() => dlWord(`TVA_${annee}_${mois}`, tvaTitre, tvaTableHtml)}
              />
              <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={() => window.print()}>
                <Printer className="size-3" />Imprimer
              </Button>
            </div>
          </div>

          {/* ─ Info : données SYSCOHADA vs simplifié ─ */}
          {ligne7 === 0 && ligne13 === 0 && ligne18 === 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md p-3 text-xs text-amber-800 dark:text-amber-300">
              <strong>Mode simplifié</strong> — aucune écriture SYSCOHADA validée ce mois.
              Les montants ci-dessous sont estimés depuis les transactions (recettes / dépenses).
              Pour une déclaration précise, validez vos écritures dans <em>Comptabilité → Journal</em>.
            </div>
          )}

          <div className="border rounded-lg overflow-hidden text-sm">
            <table className="w-full">
              <thead className="bg-muted text-xs font-semibold">
                <tr>
                  <th className="p-2.5 text-left w-10">N°</th>
                  <th className="p-2.5 text-left">Libellé</th>
                  <th className="p-2.5 text-right w-44">Montant (FCFA)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">

                {/* ── SECTION II — CHIFFRE D'AFFAIRES HT ── */}
                <tr className="bg-blue-50 dark:bg-blue-900/20">
                  <td colSpan={3} className="px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                    Section II — Chiffre d'affaires HT
                  </td>
                </tr>
                {/* L1 — ventes intérieures 18% */}
                <tr>
                  <td className="p-2.5 text-muted-foreground font-bold text-xs">L1</td>
                  <td className="p-2.5">
                    Ventes / prestations taxables intérieures ({(taux.tva * 100).toFixed(0)}%)
                    {ligne7 > 0 && <span className="ml-1 text-xs text-emerald-600">(≡ 70x crédit)</span>}
                  </td>
                  <td className="p-2.5 text-right font-mono font-semibold">{fmt(tvaCalc.l1)} FCFA</td>
                </tr>
                {/* L2 — exonérées (saisie manuelle) */}
                <tr>
                  <td className="p-2.5 text-muted-foreground font-bold text-xs">L2</td>
                  <td className="p-2.5 flex items-center gap-2">
                    <span>Ventes exonérées / hors champ TVA</span>
                    <Input
                      type="number" min={0}
                      value={tvaManuel.l3 || ""}
                      onChange={e => setLigne("l3", e.target.value)}
                      disabled={estCloture}
                      className="h-7 w-32 text-xs font-mono text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-2.5 text-right font-mono text-muted-foreground">{fmt(tvaCalc.l2)} FCFA</td>
                </tr>
                {/* L3 — autres taux */}
                <tr>
                  <td className="p-2.5 text-muted-foreground font-bold text-xs">L3</td>
                  <td className="p-2.5 flex items-center gap-2">
                    <span>Opérations taxables à d'autres taux</span>
                    <Input
                      type="number" min={0}
                      value={tvaManuel.l4 || ""}
                      onChange={e => setLigne("l4", e.target.value)}
                      disabled={estCloture}
                      className="h-7 w-32 text-xs font-mono text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-2.5 text-right font-mono text-muted-foreground">{fmt(tvaCalc.l3)} FCFA</td>
                </tr>
                {/* L4 — livraisons à soi-même */}
                <tr>
                  <td className="p-2.5 text-muted-foreground font-bold text-xs">L4</td>
                  <td className="p-2.5 flex items-center gap-2">
                    <span>Livraisons à soi-même (LASM)</span>
                    <Input
                      type="number" min={0}
                      value={tvaManuel.l5 || ""}
                      onChange={e => setLigne("l5", e.target.value)}
                      disabled={estCloture}
                      className="h-7 w-32 text-xs font-mono text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-2.5 text-right font-mono text-muted-foreground">{fmt(tvaCalc.l4)} FCFA</td>
                </tr>
                {/* L6 — total CA HT */}
                <tr className="bg-blue-50/60 dark:bg-blue-900/10 font-semibold">
                  <td className="p-2.5 font-bold text-xs">L6</td>
                  <td className="p-2.5">TOTAL CHIFFRE D'AFFAIRES HT (L1 + L2 + L3 + L4)</td>
                  <td className="p-2.5 text-right font-mono text-blue-700 dark:text-blue-300">{fmt(tvaCalc.l6)} FCFA</td>
                </tr>

                {/* ── SECTION III — TVA BRUTE ── */}
                <tr className="bg-amber-50 dark:bg-amber-900/20">
                  <td colSpan={3} className="px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
                    Section III — TVA Brute
                  </td>
                </tr>
                {/* L7 — TVA sur ventes intérieures */}
                <tr>
                  <td className="p-2.5 text-muted-foreground font-bold text-xs">L7</td>
                  <td className="p-2.5">
                    TVA sur ventes intérieures ({(taux.tva * 100).toFixed(0)}% × L1)
                    {ligne13 > 0 && <span className="ml-1 text-xs text-emerald-600">(≡ 443x crédit)</span>}
                  </td>
                  <td className="p-2.5 text-right font-mono font-semibold text-amber-700 dark:text-amber-300">{fmt(tvaCalc.l7)} FCFA</td>
                </tr>
                {/* L8 — TVA sur importations */}
                <tr>
                  <td className="p-2.5 text-muted-foreground font-bold text-xs">L8</td>
                  <td className="p-2.5 flex items-center gap-2">
                    <span>TVA sur importations</span>
                    <Input
                      type="number" min={0}
                      value={tvaManuel.l8 || ""}
                      onChange={e => setLigne("l8", e.target.value)}
                      disabled={estCloture}
                      className="h-7 w-32 text-xs font-mono text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-2.5 text-right font-mono text-muted-foreground">{fmt(tvaCalc.l8)} FCFA</td>
                </tr>
                {/* L9 — TVA récupérable sur immobilisations */}
                <tr>
                  <td className="p-2.5 text-muted-foreground font-bold text-xs">L9</td>
                  <td className="p-2.5 flex items-center gap-2">
                    <span>TVA récupérable sur immobilisations</span>
                    <Input
                      type="number" min={0}
                      value={tvaManuel.l9 || ""}
                      onChange={e => setLigne("l9", e.target.value)}
                      disabled={estCloture}
                      className="h-7 w-32 text-xs font-mono text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-2.5 text-right font-mono text-muted-foreground">{fmt(tvaCalc.l9)} FCFA</td>
                </tr>
                {/* L10 — régularisations / reversements positifs */}
                <tr>
                  <td className="p-2.5 text-muted-foreground font-bold text-xs">L10</td>
                  <td className="p-2.5 flex items-center gap-2">
                    <span>Régularisations / reversements (+)</span>
                    <Input
                      type="number" min={0}
                      value={tvaManuel.l10 || ""}
                      onChange={e => setLigne("l10", e.target.value)}
                      disabled={estCloture}
                      className="h-7 w-32 text-xs font-mono text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-2.5 text-right font-mono text-muted-foreground">{fmt(tvaCalc.l10)} FCFA</td>
                </tr>
                {/* L11 — TOTAL TVA BRUTE */}
                <tr className="bg-amber-50/60 dark:bg-amber-900/10 font-semibold">
                  <td className="p-2.5 font-bold text-xs">L11</td>
                  <td className="p-2.5">TOTAL TVA BRUTE (L7 + L8 + L9 + L10)</td>
                  <td className="p-2.5 text-right font-mono text-amber-700 dark:text-amber-300 font-bold">{fmt(tvaCalc.l11)} FCFA</td>
                </tr>

                {/* ── SECTION IV — TVA DÉDUCTIBLE ── */}
                <tr className="bg-green-50 dark:bg-green-900/20">
                  <td colSpan={3} className="px-3 py-1.5 text-xs font-bold text-green-700 dark:text-green-300 uppercase tracking-wide">
                    Section IV — TVA Déductible
                  </td>
                </tr>
                {/* L12 — AUTO depuis écritures 4452 */}
                <tr>
                  <td className="p-2.5 text-muted-foreground font-bold text-xs">L12</td>
                  <td className="p-2.5">
                    TVA sur achats de biens et services locaux
                    {ligne18 > 0 && <span className="ml-1 text-xs text-emerald-600">(≡ 4452 débit)</span>}
                  </td>
                  <td className="p-2.5 text-right font-mono font-semibold">{fmt(tvaCalc.l12)} FCFA</td>
                </tr>
                {/* L13 — MANUEL : déductions immobilisations */}
                <tr>
                  <td className="p-2.5 text-muted-foreground font-bold text-xs">L13</td>
                  <td className="p-2.5 flex items-center gap-2">
                    <span>TVA déductible sur immobilisations</span>
                    <Input
                      type="number" min={0}
                      value={tvaManuel.l13 || ""}
                      onChange={e => setLigne("l13", e.target.value)}
                      disabled={estCloture}
                      className="h-7 w-32 text-xs font-mono text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-2.5 text-right font-mono text-muted-foreground">{fmt(tvaCalc.l13)} FCFA</td>
                </tr>
                {/* L14 — MANUEL : régularisations + */}
                <tr>
                  <td className="p-2.5 text-muted-foreground font-bold text-xs">L14</td>
                  <td className="p-2.5 flex items-center gap-2">
                    <span>Régularisations déductions (+)</span>
                    <Input
                      type="number" min={0}
                      value={tvaManuel.l14 || ""}
                      onChange={e => setLigne("l14", e.target.value)}
                      disabled={estCloture}
                      className="h-7 w-32 text-xs font-mono text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-2.5 text-right font-mono text-muted-foreground">{fmt(tvaCalc.l14)} FCFA</td>
                </tr>
                {/* L15 — MANUEL : reversements - */}
                <tr>
                  <td className="p-2.5 text-muted-foreground font-bold text-xs">L15</td>
                  <td className="p-2.5 flex items-center gap-2">
                    <span>Reversements sur déductions (−)</span>
                    <Input
                      type="number" min={0}
                      value={tvaManuel.l15 || ""}
                      onChange={e => setLigne("l15", e.target.value)}
                      disabled={estCloture}
                      className="h-7 w-32 text-xs font-mono text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-2.5 text-right font-mono text-muted-foreground">{fmt(tvaCalc.l15)} FCFA</td>
                </tr>
                {/* L16 — MANUEL : crédit TVA mois précédent */}
                <tr>
                  <td className="p-2.5 text-muted-foreground font-bold text-xs">L16</td>
                  <td className="p-2.5 flex items-center gap-2">
                    <span>Crédit de TVA reporté du mois précédent</span>
                    <Input
                      type="number" min={0}
                      value={tvaManuel.l16 || ""}
                      onChange={e => setLigne("l16", e.target.value)}
                      disabled={estCloture}
                      className="h-7 w-32 text-xs font-mono text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-2.5 text-right font-mono text-muted-foreground">{fmt(tvaCalc.l16)} FCFA</td>
                </tr>
                {/* L17 — MANUEL : prorata de déduction (FCFA uniquement) */}
                <tr>
                  <td className="p-2.5 text-muted-foreground font-bold text-xs">L17</td>
                  <td className="p-2.5 flex items-center gap-2">
                    <span>Prorata de déduction (FCFA)</span>
                    <Input
                      type="number" min={0}
                      value={tvaManuel.l17 || ""}
                      onChange={e => setLigne("l17", e.target.value)}
                      disabled={estCloture}
                      className="h-7 w-32 text-xs font-mono text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-2.5 text-right font-mono text-muted-foreground">{fmt(tvaCalc.l17)} FCFA</td>
                </tr>
                {/* L18 — TOTAL TVA DÉDUCTIBLE */}
                <tr className="bg-green-50/60 dark:bg-green-900/10 font-semibold">
                  <td className="p-2.5 font-bold text-xs">L18</td>
                  <td className="p-2.5">TOTAL TVA DÉDUCTIBLE (L12 + L13 + L14 − L15 + L16 + L17)</td>
                  <td className="p-2.5 text-right font-mono text-green-700 dark:text-green-400 font-bold">{fmt(tvaCalc.l18)} FCFA</td>
                </tr>

                {/* ── SECTION V — RÉSULTAT ── */}
                <tr className="bg-orange-50 dark:bg-orange-900/20">
                  <td colSpan={3} className="px-3 py-1.5 text-xs font-bold text-orange-700 dark:text-orange-300 uppercase tracking-wide">
                    Section V — Résultat de la déclaration
                  </td>
                </tr>
                {/* L19 — SOLDE TVA */}
                <tr className="font-semibold">
                  <td className="p-2.5 font-bold text-xs">L19</td>
                  <td className="p-2.5">SOLDE TVA (L11 − L18)</td>
                  <td className={`p-2.5 text-right font-mono font-bold ${tvaCalc.l19 >= 0 ? "text-destructive" : "text-green-700 dark:text-green-400"}`}>
                    {fmt(tvaCalc.l19)} FCFA
                  </td>
                </tr>
                {/* L20 — TVA NETTE À PAYER */}
                <tr className={tvaCalc.l20 > 0 ? "bg-destructive/10 font-bold" : ""}>
                  <td className={`p-2.5 font-extrabold text-base ${tvaCalc.l20 > 0 ? "text-destructive" : "text-muted-foreground"}`}>L20</td>
                  <td className="p-2.5 font-bold">TVA NETTE À PAYER [si L19 &gt; 0] — à reverser avant le {dateLimiteOTR}</td>
                  <td className={`p-2.5 text-right font-mono font-extrabold text-base ${tvaCalc.l20 > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {tvaCalc.l20 > 0 ? `${fmt(tvaCalc.l20)} FCFA` : "—"}
                  </td>
                </tr>
                {/* L21 — CRÉDIT À REPORTER */}
                <tr className={tvaCalc.l21 > 0 ? "bg-green-50 dark:bg-green-900/10 font-bold" : ""}>
                  <td className={`p-2.5 font-bold ${tvaCalc.l21 > 0 ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>L21</td>
                  <td className="p-2.5">CRÉDIT DE TVA À REPORTER AU MOIS SUIVANT [si L19 &lt; 0]</td>
                  <td className={`p-2.5 text-right font-mono ${tvaCalc.l21 > 0 ? "text-green-700 dark:text-green-400 font-bold" : "text-muted-foreground"}`}>
                    {tvaCalc.l21 > 0 ? `${fmt(tvaCalc.l21)} FCFA` : "—"}
                  </td>
                </tr>

              </tbody>
            </table>
          </div>

          {/* ─ Résumé bas de page ─ */}
          {tvaCalc.l20 > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm">
              <Lock className="size-4 text-destructive shrink-0" />
              <p>
                TVA à reverser à l'OTR avant le <strong>{dateLimiteOTR}</strong> — montant :{" "}
                <strong className="text-destructive">{fmt(tvaCalc.l20)} FCFA</strong>
              </p>
            </div>
          )}
          {tvaCalc.l21 > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-sm">
              <Unlock className="size-4 text-green-700 shrink-0" />
              <p>
                Crédit TVA de <strong className="text-green-700">{fmt(tvaCalc.l21)} FCFA</strong> à reporter sur la prochaine déclaration (L16).
              </p>
            </div>
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
