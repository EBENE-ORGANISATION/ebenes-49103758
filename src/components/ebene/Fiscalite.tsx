import { useMemo, useState, useEffect } from "react";
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
  Settings2, History, Lock, Unlock, AlertCircle, CheckCircle2, Printer,
} from "lucide-react";
import { TauxHistoriqueDialog } from "./TauxHistoriqueDialog";
import { TauxImpots } from "@/components/ebene/TauxImpots";
import { GestionDelegations } from "@/components/ebene/GestionDelegations";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";

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

// ── Helpers clôture automatique ──────────────────────────────────────────────

function isMoisCloture(annee: number, mois: number): boolean {
  const finDuMois = new Date(annee, mois, 0); // dernier jour du mois
  return finDuMois < new Date();
}

function isMoisEnCours(annee: number, mois: number): boolean {
  const now = new Date();
  return now.getFullYear() === annee && now.getMonth() + 1 === mois;
}

function getStatutMois(annee: number, mois: number): "futur" | "en_cours" | "cloture" {
  if (isMoisEnCours(annee, mois)) return "en_cours";
  if (isMoisCloture(annee, mois)) return "cloture";
  return "futur";
}

// ── Badge statut ─────────────────────────────────────────────────────────────

const StatutBadge = ({ annee, mois }: { annee: number; mois: number }) => {
  const statut = getStatutMois(annee, mois);
  if (statut === "cloture")
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <Lock className="size-3" /> Clôturé
      </Badge>
    );
  if (statut === "en_cours")
    return (
      <Badge className="gap-1 text-xs bg-green-600 text-white">
        <Unlock className="size-3" /> En cours
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
      À venir
    </Badge>
  );
};

// ── Lignes tableau ────────────────────────────────────────────────────────────

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div
    className={`flex justify-between py-1.5 ${
      strong ? "font-bold text-base border-t-2 border-border pt-2 mt-1" : "text-sm"
    }`}
  >
    <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
    <span className="amount">{value}</span>
  </div>
);

const RowSmall = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between py-0.5 text-xs text-muted-foreground italic pl-3">
    <span>{label}</span>
    <span className="amount">{value}</span>
  </div>
);

// ── Composant principal ───────────────────────────────────────────────────────

export const Fiscalite = ({
  data,
  employes,
  annee,
  mois,
  paramsAnnee,
  onUpdateParams,
  donneesMensuelles,
  tauxHistorique,
  onAjouterTaux,
  onSupprimerTaux,
}: Props) => {
  const { can, user } = useAuth();
  const { currentSociete, societeConfig } = useTenant();

  const canEditTaux   = can("fiscalite", "write");
  const canEditSocial = can("parametres_sociaux", "write");

  const [editParams,     setEditParams]     = useState(false);
  const [thInput,        setThInput]        = useState(String(paramsAnnee.th  ?? 30000));
  const [rslInput,       setRslInput]       = useState(String(paramsAnnee.rsl ?? 52500));
  const [showHistorique, setShowHistorique] = useState(false);

  // Sync thInput / rslInput quand paramsAnnee change (changement d'année ou de société)
  useEffect(() => {
    setThInput(String(paramsAnnee.th  ?? 30000));
    setRslInput(String(paramsAnnee.rsl ?? 52500));
  }, [paramsAnnee, annee]);

  const taux   = useMemo(() => tauxPourMois(tauxHistorique, annee, mois), [tauxHistorique, annee, mois]);
  const statut = getStatutMois(annee, mois);
  const estCloture = statut === "cloture";

  // ── CA annuel cumulé pour IMF ─────────────────────────────────────────────
  const caAnnuel = useMemo(() => {
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const md = donneesMensuelles[moisKey(annee, m)];
      if (!md) continue;
      total += (md.transactions || []).filter((t) => t.type === "r").reduce((a, t) => a + t.m, 0);
    }
    return total;
  }, [donneesMensuelles, annee]);

  // ── Calculs fiscaux du mois ───────────────────────────────────────────────
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

    // TVA depuis écritures SYSCOHADA validées (comptes 4431/4432 collectée, 4452/4451 déductible, 4449 crédit)
    const ecritures = (data.ecritures || []).filter((e) => e.statut === "valide");
    let tvaCollectee  = 0;
    let tvaDeductible = 0;
    let creditReporte = 0;
    ecritures.forEach((e) => {
      e.lignes.forEach((l) => {
        const solde = l.credit - l.debit;
        if (l.compte.startsWith("4431") || l.compte.startsWith("4432")) tvaCollectee  += Math.max(0,  solde);
        if (l.compte.startsWith("4452") || l.compte.startsWith("4451")) tvaDeductible += Math.max(0, -solde);
        if (l.compte === "4449")                                         creditReporte += Math.max(0, -solde);
      });
    });
    // Fallback simplifié si aucune écriture SYSCOHADA validée
    const tvaNetteSYSCOHADA = tvaCollectee - tvaDeductible - creditReporte;
    const tvaSimplifiee     = Math.max(0, rec * taux.tva - dep * taux.tva);
    const tvaAPayer         = ecritures.length > 0 ? Math.max(0, tvaNetteSYSCOHADA) : tvaSimplifiee;
    const creditAReporter   = ecritures.length > 0 && tvaNetteSYSCOHADA < 0 ? Math.abs(tvaNetteSYSCOHADA) : 0;

    const patService  = recService  * taux.patenteService;
    const patCommerce = recCommerce * taux.patenteCommerce;
    const pat         = patService + patCommerce;
    const thAnnuel    = paramsAnnee.th  ?? 30000;
    const rslAnnuel   = paramsAnnee.rsl ?? 52500;
    const th          = thAnnuel  / 12;
    const rsl         = rslAnnuel / 12;

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
      th, rsl, thAnnuel, rslAnnuel, masse, cnss, amu,
      totalFiscal: tvaAPayer + impot + pat + th + rsl,
      totalSocial: cnss + amu,
    };
  }, [data, employes, paramsAnnee, taux, caAnnuel]);

  // ── Calculs annuels IS/IMF ────────────────────────────────────────────────
  const calcAnnuel = useMemo(() => {
    let caTotal = 0, depTotal = 0, tvaTotal = 0;
    for (let m = 1; m <= 12; m++) {
      const md = donneesMensuelles[moisKey(annee, m)];
      if (!md) continue;
      caTotal  += (md.transactions || []).filter((t) => t.type === "r").reduce((a, t) => a + t.m, 0);
      depTotal += Math.abs((md.transactions || []).filter((t) => t.type === "d").reduce((a, t) => a + t.m, 0));
      // TVA collectée annuelle depuis écritures SYSCOHADA
      (md.ecritures || []).filter((e) => e.statut === "valide").forEach((e) => {
        e.lignes.forEach((l) => {
          const solde = l.credit - l.debit;
          if (l.compte.startsWith("4431") || l.compte.startsWith("4432")) tvaTotal += Math.max(0, solde);
        });
      });
    }
    const benAnnuel   = Math.max(0, caTotal - depTotal);
    const isAnnuel    = benAnnuel * taux.is;
    const imfAnnuel   = Math.max(taux.imfMin, caTotal * taux.imfTaux);
    const impotAnnuel = Math.max(isAnnuel, imfAnnuel);
    return {
      caTotal, depTotal, benAnnuel, isAnnuel, imfAnnuel, impotAnnuel, tvaTotal,
      regime: isAnnuel >= imfAnnuel ? "IS" : "IMF",
    };
  }, [donneesMensuelles, annee, taux]);

  const sauverParams = () => {
    const th  = parseFloat(thInput);
    const rsl = parseFloat(rslInput);
    onUpdateParams({
      th:  isNaN(th)  ? undefined : th,
      rsl: isNaN(rsl) ? undefined : rsl,
    });
    setEditParams(false);
  };

  const periodeLabel    = `${MOIS_NOMS[mois - 1]} ${annee}`;
  const moisSuivant     = mois === 12 ? 1 : mois + 1;
  const anneeSuivante   = mois === 12 ? annee + 1 : annee;
  const dateLimiteOTR   = `15/${String(moisSuivant).padStart(2, "0")}/${anneeSuivante}`;

  return (
    <div className="space-y-4">
      {/* ── En-tête période + statut ─────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-bold text-lg">Fiscalité — {periodeLabel}</h2>
          <StatutBadge annee={annee} mois={mois} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {estCloture ? (
            <p className="text-xs text-muted-foreground italic">
              📅 Période clôturée — données en lecture seule
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              📅 Déclaration à déposer avant le {dateLimiteOTR}
            </p>
          )}
          {canEditTaux && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 h-8 text-xs"
              onClick={() => setShowHistorique(true)}
            >
              <History className="size-3" /> Taux
            </Button>
          )}
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="CA (Mois)"       value={formatMontant(calc.rec)}      tone="info"        />
        <StatCard label="Bénéfice (Mois)" value={formatMontant(calc.ben)}      tone="success"     />
        <StatCard
          label="TVA nette"
          value={formatMontant(calc.tvaAPayer)}
          tone="warning"
          hint={calc.creditAReporter > 0 ? `Crédit à reporter : ${formatMontant(calc.creditAReporter)}` : undefined}
        />
        <StatCard label={`Impôt (${calc.regime})`} value={formatMontant(calc.impot)} tone="destructive" />
      </div>

      {/* ── Sous-onglets ─────────────────────────────────────────────────── */}
      <Tabs defaultValue="tva" className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full h-auto mb-4">
          <TabsTrigger value="dashboard" className="py-2 text-sm">📊 Tableau de bord</TabsTrigger>
          <TabsTrigger value="tva"       className="py-2 text-sm">🧾 TVA</TabsTrigger>
          <TabsTrigger value="is"        className="py-2 text-sm">💼 IS / IMF</TabsTrigger>
          <TabsTrigger value="social"    className="py-2 text-sm">👷 Charges sociales</TabsTrigger>
          <TabsTrigger value="params"    className="py-2 text-sm">⚙️ Paramètres</TabsTrigger>
        </TabsList>

        {/* ── Tableau de bord ────────────────────────────────────────────── */}
        <TabsContent value="dashboard">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 space-y-2">
              <h3 className="font-bold flex items-center gap-2">📊 Récapitulatif annuel {annee}</h3>
              <Row label="CA total annuel"     value={formatMontant(calcAnnuel.caTotal)}     />
              <Row label="Bénéfice estimé"     value={formatMontant(calcAnnuel.benAnnuel)}   />
              <Row label={`IS ${(taux.is * 100).toFixed(0)}% sur bénéfice`} value={formatMontant(calcAnnuel.isAnnuel)} />
              <Row label={`IMF (${(taux.imfTaux * 100).toFixed(2)}% CA, min ${formatMontant(taux.imfMin)})`} value={formatMontant(calcAnnuel.imfAnnuel)} />
              <Row label={`→ Impôt retenu (${calcAnnuel.regime})`} value={formatMontant(calcAnnuel.impotAnnuel)} strong />
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
                          <td className="py-1 pr-2 text-right tabular-nums">{recM > 0 ? formatMontant(recM) : "—"}</td>
                          <td className={`py-1 text-right tabular-nums ${tvaM < 0 ? "text-green-600" : tvaM > 0 ? "text-destructive" : ""}`}>
                            {tvaM !== 0 ? formatMontant(Math.abs(tvaM)) : "—"}
                          </td>
                          <td className="py-1 text-center">
                            {st === "cloture"  && <span className="text-xs">🔒</span>}
                            {st === "en_cours" && <span className="text-xs text-green-600">●</span>}
                            {st === "futur"    && <span className="text-xs text-muted-foreground">○</span>}
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

        {/* ── TVA OTR ────────────────────────────────────────────────────── */}
        <TabsContent value="tva">
          <div className="space-y-4 max-w-4xl">
            {/* Formulaire OTR */}
            <div className="border-2 border-foreground rounded-lg overflow-hidden">
              {/* En-tête */}
              <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-bold text-base">DÉCLARATION DE TVA — Mod TVA 2016</p>
                  <p className="text-xs opacity-75">OTR/PrF-Dpl/Bdr/001 — 163, Rue des impôts BP 321 Lomé-TOGO</p>
                </div>
                <div className="text-right">
                  <p className="text-xs opacity-75">Période</p>
                  <p className="font-bold">{periodeLabel}</p>
                  {estCloture
                    ? <Badge variant="secondary" className="mt-1 gap-1"><Lock className="size-3" /> Clôturé</Badge>
                    : <Badge className="mt-1 bg-green-600/80 text-white gap-1"><Unlock className="size-3" /> En cours</Badge>}
                </div>
              </div>

              {/* Identification */}
              <div className="p-4 bg-muted/20 border-b grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">I. Identification</p>
                  <p><span className="text-muted-foreground">NIF : </span><span className="font-mono font-bold">{societeConfig?.nif || "—"}</span></p>
                  <p><span className="text-muted-foreground">Raison sociale : </span><span className="font-semibold">{currentSociete?.nom || "—"}</span></p>
                </div>
                <div className="flex flex-col items-end justify-center gap-1">
                  <Badge
                    variant={calc.tvaAPayer > 0 ? "destructive" : "default"}
                    className="text-sm px-3 py-1.5"
                  >
                    {calc.tvaAPayer > 0
                      ? `TVA à payer : ${formatMontant(calc.tvaAPayer)}`
                      : calc.creditAReporter > 0
                      ? `Crédit à reporter : ${formatMontant(calc.creditAReporter)}`
                      : "Néant"}
                  </Badge>
                  {!estCloture && (
                    <p className="text-xs text-muted-foreground">À déposer avant le {dateLimiteOTR}</p>
                  )}
                </div>
              </div>

              {/* Sections II + III */}
              <div className="grid grid-cols-1 lg:grid-cols-2 border-b">
                {/* Section II — CA HT */}
                <div className="p-4 border-r">
                  <p className="font-bold text-xs mb-2 uppercase">II. Total CA HT [lignes 2+6]</p>
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="bg-muted/60 font-bold border-b">
                        <td className="py-1.5 pr-2 w-7 text-center">1</td>
                        <td className="py-1.5 pr-2">TOTAL CA HT</td>
                        <td className="py-1.5 text-right font-mono w-28">{calc.rec > 0 ? formatMontant(calc.rec) : "—"}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-1.5 pr-2 text-center text-muted-foreground">2</td>
                        <td className="py-1.5 pr-2">Opérations non taxables</td>
                        <td className="py-1.5 text-right">—</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-1.5 pr-2 text-center text-muted-foreground">3</td>
                        <td className="py-1.5 pr-2 pl-4 text-muted-foreground">• Exonérées</td>
                        <td className="py-1.5 text-right">—</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-1.5 pr-2 text-center text-muted-foreground">4</td>
                        <td className="py-1.5 pr-2 pl-4 text-muted-foreground">• Non imposées (attestations)</td>
                        <td className="py-1.5 text-right">—</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-1.5 pr-2 text-center text-muted-foreground">5</td>
                        <td className="py-1.5 pr-2 pl-4 text-muted-foreground">• Exportations non taxables</td>
                        <td className="py-1.5 text-right">—</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-1.5 pr-2 text-center text-muted-foreground">6</td>
                        <td className="py-1.5 pr-2 font-semibold">Opérations taxables [7+8+9+10]</td>
                        <td className="py-1.5 text-right font-mono font-semibold">{calc.rec > 0 ? formatMontant(calc.rec) : "—"}</td>
                      </tr>
                      <tr className="border-b bg-blue-50/40 dark:bg-blue-900/10">
                        <td className="py-1.5 pr-2 text-center font-bold text-primary">7</td>
                        <td className="py-1.5 pr-2">• Au taux 18% (hors LASM)</td>
                        <td className="py-1.5 text-right font-mono font-bold text-primary">{formatMontant(calc.rec)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-1.5 pr-2 text-center text-muted-foreground">8</td>
                        <td className="py-1.5 pr-2 pl-4 text-muted-foreground">• Marchés publics Chèque Trésor</td>
                        <td className="py-1.5 text-right">—</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-1.5 pr-2 text-center text-muted-foreground">9</td>
                        <td className="py-1.5 pr-2 pl-4 text-muted-foreground">• Livraison à soi-même (LASM)</td>
                        <td className="py-1.5 text-right">—</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 pr-2 text-center text-muted-foreground">10</td>
                        <td className="py-1.5 pr-2 pl-4 text-muted-foreground">• Exportations et assimilés</td>
                        <td className="py-1.5 text-right">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Section III — TVA Brute */}
                <div className="p-4">
                  <p className="font-bold text-xs mb-2 uppercase">III. TVA Brute [ligne 12]</p>
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="bg-muted/60 font-bold border-b">
                        <td className="py-1.5 pr-2 w-7 text-center">11</td>
                        <td className="py-1.5 pr-2">TOTAL TVA BRUTE</td>
                        <td className="py-1.5 text-right font-mono w-28">{formatMontant(calc.tvaCollectee)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-1.5 pr-2 text-center text-muted-foreground">12</td>
                        <td className="py-1.5 pr-2 font-semibold">TVA collectée = 13+14+15</td>
                        <td className="py-1.5 text-right font-mono">{formatMontant(calc.tvaCollectee)}</td>
                      </tr>
                      <tr className="border-b bg-blue-50/40 dark:bg-blue-900/10">
                        <td className="py-1.5 pr-2 text-center font-bold text-primary">13</td>
                        <td className="py-1.5 pr-2">• Au taux 18% [ligne 7 × 18%]</td>
                        <td className="py-1.5 text-right font-mono font-bold text-primary">{formatMontant(calc.tvaCollectee)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-1.5 pr-2 text-center text-muted-foreground">14</td>
                        <td className="py-1.5 pr-2 pl-4 text-muted-foreground">• Marchés publics [8 × 18%]</td>
                        <td className="py-1.5 text-right">—</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-1.5 pr-2 text-center text-muted-foreground">15</td>
                        <td className="py-1.5 pr-2 pl-4 text-muted-foreground">• LASM [9 × 18%]</td>
                        <td className="py-1.5 text-right">—</td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="py-1.5 text-[10px] text-muted-foreground italic pl-2">
                          Taux 0% — Exportations [10 × 0%] = néant
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section IV — TVA Déductible */}
              <div className="p-4 border-b">
                <p className="font-bold text-xs mb-2 uppercase">IV. Total TVA Déductible [17+18+19-20+21]</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="bg-muted/60 font-bold border-b">
                        <td className="py-1.5 pr-2 w-7 text-center">16</td>
                        <td className="py-1.5 pr-2">TOTAL TVA DÉDUCTIBLE</td>
                        <td className="py-1.5 text-right font-mono w-28">{formatMontant(calc.tvaDeductible + calc.creditReporte)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-1.5 pr-2 text-center text-muted-foreground">17</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">• Crédit TVA reporté (cpt 4449)</td>
                        <td className="py-1.5 text-right font-mono">{calc.creditReporte > 0 ? formatMontant(calc.creditReporte) : "—"}</td>
                      </tr>
                      <tr className="border-b bg-green-50/30 dark:bg-green-900/10">
                        <td className="py-1.5 pr-2 text-center font-bold text-green-700">18</td>
                        <td className="py-1.5 pr-2">• Déductions biens/services (cpt 4452)</td>
                        <td className="py-1.5 text-right font-mono font-bold text-green-700">{calc.tvaDeductible > 0 ? formatMontant(calc.tvaDeductible) : "—"}</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 pr-2 text-center text-muted-foreground">19</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">• Déductions immobilisations (cpt 4451)</td>
                        <td className="py-1.5 text-right">—</td>
                      </tr>
                    </tbody>
                  </table>
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b">
                        <td className="py-1.5 pr-2 w-7 text-center text-muted-foreground">20</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">Régularisation — Complément</td>
                        <td className="py-1.5 text-right">—</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-1.5 pr-2 text-center text-muted-foreground">21</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">Régularisation — Reversement</td>
                        <td className="py-1.5 text-right">—</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 pr-2 text-center text-muted-foreground">22</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">Prorata de déduction</td>
                        <td className="py-1.5 text-right font-mono">100 %</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section V — TVA Nette */}
              <div className="p-4 border-b">
                <p className="font-bold text-xs mb-3 uppercase">V. TVA Nette [lignes 24-25]</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-muted/40 rounded p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Ligne 24 — TVA Brute</p>
                    <p className="font-bold tabular-nums text-sm">{formatMontant(calc.tvaCollectee)}</p>
                  </div>
                  <div className="bg-muted/40 rounded p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Ligne 25 — TVA Déductible</p>
                    <p className="font-bold tabular-nums text-sm">{formatMontant(calc.tvaDeductible + calc.creditReporte)}</p>
                  </div>
                  <div
                    className={`rounded p-3 text-center col-span-2 ${
                      calc.tvaAPayer > 0
                        ? "bg-destructive/10 border border-destructive/30"
                        : "bg-green-50 border border-green-200 dark:bg-green-900/10 dark:border-green-800"
                    }`}
                  >
                    <p className="text-xs text-muted-foreground mb-1">
                      {calc.tvaAPayer > 0 ? "Ligne 26 — TVA à payer" : "Ligne 27 — Crédit à reporter"}
                    </p>
                    <p className={`font-bold text-lg tabular-nums ${calc.tvaAPayer > 0 ? "text-destructive" : "text-green-700"}`}>
                      {formatMontant(calc.tvaAPayer > 0 ? calc.tvaAPayer : calc.creditAReporter)} FCFA
                    </p>
                  </div>
                </div>
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
                        ? `TVA nette à payer (ligne 26) : ${formatMontant(calc.tvaAPayer)} FCFA`
                        : `Crédit TVA à reporter (ligne 27) : ${formatMontant(calc.creditAReporter)} FCFA`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {estCloture
                        ? "Période clôturée — déclaration en lecture seule"
                        : `À déposer à l'OTR avant le ${dateLimiteOTR}`}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 no-print"
                  onClick={() => window.print()}
                >
                  <Printer className="size-4" /> Imprimer
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground italic text-center">
              Déclaration auto-remplie depuis les écritures SYSCOHADA validées (comptes 4431, 4432, 4452, 4449).
              Vérifiez les montants avant dépôt à l'OTR — 163 Rue des impôts BP 321 Lomé.
            </p>
          </div>
        </TabsContent>

        {/* ── IS / IMF ──────────────────────────────────────────────────── */}
        <TabsContent value="is">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 space-y-2">
              <h3 className="font-bold flex items-center gap-2">💼 IS / IMF — Exercice {annee}</h3>
              <p className="text-xs text-muted-foreground">
                Calcul automatique basé sur le CA et le bénéfice annuels cumulés.
              </p>
              <Row label="CA total annuel"     value={formatMontant(calcAnnuel.caTotal)}   />
              <Row label="Charges totales"     value={formatMontant(calcAnnuel.depTotal)}  />
              <Row label="Bénéfice imposable"  value={formatMontant(calcAnnuel.benAnnuel)} />
              <Row label={`IS ${(taux.is * 100).toFixed(0)}% × bénéfice`} value={formatMontant(calcAnnuel.isAnnuel)} />
              <RowSmall label={`IMF ${(taux.imfTaux * 100).toFixed(2)}% × CA annuel`}     value={formatMontant(caAnnuel * taux.imfTaux)} />
              <RowSmall label="Minimum forfaitaire"                                         value={formatMontant(taux.imfMin)} />
              <Row label="IMF retenu (max des 2)" value={formatMontant(calcAnnuel.imfAnnuel)} />
              <Row label={`→ Impôt dû (${calcAnnuel.regime} — max IS / IMF)`} value={formatMontant(calcAnnuel.impotAnnuel)} strong />
              <Row label="→ Provision mensuelle (÷ 12)"                       value={formatMontant(calcAnnuel.impotAnnuel / 12)} />
            </Card>

            <Card className="p-5 space-y-2">
              <h3 className="font-bold">💼 Charges fiscales du mois — {periodeLabel}</h3>
              <Row label={`TVA nette ${(taux.tva * 100).toFixed(0)}%`}  value={formatMontant(calc.tvaAPayer)} />
              <Row label={`Impôt (${calc.regime})`}                       value={formatMontant(calc.impot)}    />
              <Row label="Patente (par activité)"                          value={formatMontant(calc.pat)}      />
              <RowSmall label={`Service ${(taux.patenteService * 100).toFixed(2)}% × ${formatMontant(calc.recService)}`} value={formatMontant(calc.patService)} />
              <RowSmall label={`Commerce ${(taux.patenteCommerce * 100).toFixed(2)}% × ${formatMontant(calc.recCommerce)}`} value={formatMontant(calc.patCommerce)} />
              <Row label={`TH (1/12 de ${formatMontant(calc.thAnnuel)})`}   value={formatMontant(calc.th)}  />
              <Row label={`RSL (1/12 de ${formatMontant(calc.rslAnnuel)})`} value={formatMontant(calc.rsl)} />
              <Row label="TOTAL FISCAL MOIS" value={formatMontant(calc.totalFiscal)} strong />
              {canEditSocial && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 h-7 text-xs mt-2"
                  onClick={() => setEditParams(!editParams)}
                >
                  <Settings2 className="size-3" /> Modifier TH / RSL
                </Button>
              )}
              {editParams && (
                <div className="bg-muted/40 border rounded p-3 space-y-3 mt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs font-bold">TH annuel</Label>
                      <Input type="number" value={thInput} onChange={(e) => setThInput(e.target.value)} className="h-8 mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold">RSL annuel</Label>
                      <Input type="number" value={rslInput} onChange={(e) => setRslInput(e.target.value)} className="h-8 mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={sauverParams}>✓ Enregistrer</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditParams(false)}>Annuler</Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* ── Charges sociales ──────────────────────────────────────────── */}
        <TabsContent value="social">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 space-y-2">
              <h3 className="font-bold flex items-center gap-2">
                👷 Charges sociales — {periodeLabel}
                <StatutBadge annee={annee} mois={mois} />
              </h3>
              <Row label="Masse salariale brute"                               value={formatMontant(calc.masse)}  />
              <Row label={`CNSS employeur ${(taux.cnssEmp * 100).toFixed(1)}%`} value={formatMontant(calc.cnss)}  />
              <Row label={`AMU employeur ${(taux.amuEmp * 100).toFixed(0)}%`}   value={formatMontant(calc.amu)}   />
              <Row label="TOTAL CHARGES PATRONALES" value={formatMontant(calc.totalSocial)} strong />
            </Card>

            <Card className="p-5 space-y-2">
              <h3 className="font-bold">📅 Suivi CNSS / AMU — {annee}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 pr-2">Mois</th>
                      <th className="text-right py-1 pr-2">Masse salariale</th>
                      <th className="text-right py-1">CNSS+AMU</th>
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
                      const chargesM = masseM * (taux.cnssEmp + taux.amuEmp);
                      const st = getStatutMois(annee, m);
                      return (
                        <tr key={m} className={`border-t ${m === mois ? "bg-primary/5 font-semibold" : ""}`}>
                          <td className="py-1 pr-2">{nom.slice(0, 3)}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{masseM > 0 ? formatMontant(masseM) : "—"}</td>
                          <td className="py-1 text-right tabular-nums">{chargesM > 0 ? formatMontant(chargesM) : "—"}</td>
                          <td className="py-1 text-center">
                            {st === "cloture"  && <span>🔒</span>}
                            {st === "en_cours" && <span className="text-green-600">●</span>}
                            {st === "futur"    && <span className="text-muted-foreground">○</span>}
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

        {/* ── Paramètres fiscaux ─────────────────────────────────────────── */}
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
              <p className="text-sm text-muted-foreground italic text-center py-8">
                Aucune société sélectionnée.
              </p>
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
