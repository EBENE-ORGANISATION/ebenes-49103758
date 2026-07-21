import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Area,
  AreaChart,
  Cell,
} from "recharts";
import {
  TrendingUp,
  Wallet,
  FileWarning,
  Banknote,
  AlertCircle,
  AlertTriangle,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import type {
  DonneesMensuelles,
  Employe,
  TauxFiscaux,
  MoisData,
  Activite,
} from "@/types/ebene";
import { formatMontant, moisKey, tauxPourMois } from "@/lib/ebene-utils";
import { TAUX_DEFAUT } from "@/types/ebene";
import { TresorerieCard } from "./TresorerieCard";

interface DashboardProps {
  donneesMensuelles: DonneesMensuelles;
  employes: Employe[];
  tauxHistorique: TauxFiscaux[];
  annee: number;
  mois: number;
  /** Activités actives de la société (pour la répartition consolidée). */
  activites?: Activite[];
  /** Activité filtrée courante (null = vue consolidée). */
  activiteFiltre?: string | null;
}

/**
 * Restreint une MoisData à une activité donnée. `aid = null` cible les lignes
 * sans activité (non rattachées). Utilisé pour la répartition par activité.
 */
const filterMoisByActivite = (m: MoisData, aid: string | null): MoisData => {
  const match = (row: { activiteId?: string | null }) =>
    aid === null ? !row.activiteId : row.activiteId === aid;
  return {
    ...m,
    transactions: m.transactions.filter(match),
    factures: m.factures.filter(match),
    ecritures: (m.ecritures || []).filter(match),
  };
};

const MOIS_COURTS = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

// ── Helpers consolidés (transactions + écritures SYSCOHADA) ──────────────────

const sumRecettes = (m: MoisData): number => {
  const recTrans = m.transactions
    .filter((t) => t.type === "r")
    .reduce((s, t) => s + Math.abs(t.m), 0);
  const recEcritures = (m.ecritures || [])
    .filter((e) => e.statut === "valide" && !e.factureId)
    .reduce((total, e) => {
      const lignes = Array.isArray(e.lignes) ? e.lignes : [];
      const debit = lignes
        .filter((l) => l.compte.startsWith("52") || l.compte.startsWith("57"))
        .reduce((s, l) => s + l.debit, 0);
      return total + debit;
    }, 0);
  return recTrans + recEcritures;
};

const sumDepenses = (m: MoisData): number => {
  const depTrans = m.transactions
    .filter((t) => t.type === "d")
    .reduce((s, t) => s + Math.abs(t.m), 0);
  const depEcritures = (m.ecritures || [])
    .filter((e) => e.statut === "valide" && !e.factureId)
    .reduce((total, e) => {
      const lignes = Array.isArray(e.lignes) ? e.lignes : [];
      const credit = lignes
        .filter((l) => l.compte.startsWith("52") || l.compte.startsWith("57"))
        .reduce((s, l) => s + l.credit, 0);
      return total + credit;
    }, 0);
  return depTrans + depEcritures;
};

const sumTvaCollectee = (m: MoisData): number => {
  // Depuis écritures validées (comptes 4431/4432) — fallback sur factures payées
  const fromEcritures = (m.ecritures || [])
    .filter((e) => e.statut === "valide")
    .reduce((total, e) => {
      const lignes = Array.isArray(e.lignes) ? e.lignes : [];
      return total + lignes
        .filter((l) => l.compte.startsWith("4431") || l.compte.startsWith("4432"))
        .reduce((s, l) => s + Math.max(0, l.credit - l.debit), 0);
    }, 0);
  if (fromEcritures > 0) return fromEcritures;
  return m.factures
    .filter((f) => f.statut === "payee" && f.avecTva)
    .reduce((s, f) => s + f.totalTva, 0);
};

// ── Mode unité ───────────────────────────────────────────────────────────────
type UnitMode = "F" | "kF" | "100kF";
const UNIT_DIV: Record<UnitMode, number> = { F: 1, kF: 1_000, "100kF": 100_000 };
const UNIT_SUFFIX: Record<UnitMode, string> = { F: "F", kF: "k F", "100kF": "×100k F" };

const formatUnit = (n: number, mode: UnitMode): string => {
  if (mode === "F") return formatMontant(n);
  const v = n / UNIT_DIV[mode];
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString("fr-FR", {
    minimumFractionDigits: abs >= 100 ? 0 : 1,
    maximumFractionDigits: abs >= 100 ? 0 : 1,
  });
  return `${v < 0 ? "-" : ""}${formatted} ${UNIT_SUFFIX[mode]}`;
};

// ── Calcul tendance (%) ───────────────────────────────────────────────────────
const calcTendance = (actuel: number, precedent: number): number | null => {
  if (precedent === 0) return null;
  return ((actuel - precedent) / precedent) * 100;
};

// ── Tone styles (module-level pour partage entre composants) ─────────────────
type Tone = "primary" | "success" | "warning" | "destructive" | "muted";
const TONE_BG: Record<Tone, string> = {
  primary:     "bg-primary/10 text-primary",
  success:     "bg-success/15 text-success",
  warning:     "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
  muted:       "bg-muted text-muted-foreground",
};

// ── Composant principal ───────────────────────────────────────────────────────
export const Dashboard = ({
  donneesMensuelles,
  employes,
  tauxHistorique,
  annee,
  mois,
  activites = [],
  activiteFiltre = null,
}: DashboardProps) => {
  const { t } = useTranslation();

  const [unit, setUnit] = useState<UnitMode>(() => {
    try {
      const saved = localStorage.getItem("ebene:dashboard:unit");
      if (saved === "F" || saved === "kF" || saved === "100kF") return saved;
    } catch { /* ignore */ }
    return "F";
  });

  const setUnitPersist = (u: UnitMode) => {
    setUnit(u);
    try { localStorage.setItem("ebene:dashboard:unit", u); } catch { /* ignore */ }
  };

  const fmt = (n: number) => formatUnit(n, unit);

  const moisCourant  = donneesMensuelles[moisKey(annee, mois)];
  const moisPrecKey  = mois === 1 ? moisKey(annee - 1, 12) : moisKey(annee, mois - 1);
  const moisPrecedent = donneesMensuelles[moisPrecKey];
  const taux = tauxPourMois(tauxHistorique, annee, mois) || TAUX_DEFAUT;

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const m: MoisData  = moisCourant  ?? { transactions: [], factures: [], primes: {}, ecritures: [] };
    const mp: MoisData = moisPrecedent ?? { transactions: [], factures: [], primes: {}, ecritures: [] };

    const ca         = sumRecettes(m);
    const caPrecedent = sumRecettes(mp);
    const tendanceCA = calcTendance(ca, caPrecedent);

    const masseSalariale = employes.reduce(
      (s, e) =>
        s + (e.salaire || 0) + (e.indemniteTransport || 0) + (e.indemniteLogement || 0)
          + (e.indemniteFonction || 0) + (e.sursalaire || 0),
      0,
    );

    const facturesImpayees = m.factures.filter((f) => f.statut === "en_attente");
    const montantImpaye    = facturesImpayees.reduce((s, f) => s + f.totalTtc, 0);

    // Trésorerie cumulée (tous les mois)
    let tresorerie = 0;
    Object.values(donneesMensuelles).forEach((mm) => {
      if (!mm) return;
      tresorerie += sumRecettes(mm) - sumDepenses(mm);
    });

    // Trésorerie "précédente" = sans le mois courant
    let tresoreriePrecedente = 0;
    Object.entries(donneesMensuelles).forEach(([key, mm]) => {
      if (!mm) return;
      const [a, mo] = key.split("-").map(Number);
      if (a === annee && mo === mois) return;
      tresoreriePrecedente += sumRecettes(mm) - sumDepenses(mm);
    });
    const tendanceTresorerie = calcTendance(tresorerie, tresoreriePrecedente);

    return {
      ca, caPrecedent, tendanceCA,
      masseSalariale,
      facturesImpayees: facturesImpayees.length,
      montantImpaye,
      tresorerie, tresoreriePrecedente, tendanceTresorerie,
    };
  }, [moisCourant, moisPrecedent, employes, donneesMensuelles, annee, mois]);

  // ── Sparkline trésorerie 6 mois ──────────────────────────────────────────
  const sparklineTresorerie = useMemo(() => {
    const out: { v: number }[] = [];
    let cumul = 0;
    for (let i = 5; i >= 0; i--) {
      const d  = new Date(annee, mois - 1 - i, 1);
      const mm = donneesMensuelles[moisKey(d.getFullYear(), d.getMonth() + 1)];
      if (mm) cumul += sumRecettes(mm) - sumDepenses(mm);
      out.push({ v: cumul });
    }
    return out;
  }, [donneesMensuelles, annee, mois]);

  // ── Série CA 12 mois ─────────────────────────────────────────────────────
  const serieCA = useMemo(() => {
    const out: { label: string; ca: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d  = new Date(annee, mois - 1 - i, 1);
      const a  = d.getFullYear();
      const mo = d.getMonth() + 1;
      const mm = donneesMensuelles[moisKey(a, mo)];
      out.push({
        label: `${MOIS_COURTS[d.getMonth()]} ${String(a).slice(2)}`,
        ca: mm ? sumRecettes(mm) : 0,
      });
    }
    return out;
  }, [donneesMensuelles, annee, mois]);

  const moyenneCA = useMemo(() => {
    const vals = serieCA.map((d) => d.ca).filter((v) => v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [serieCA]);

  const picCA = useMemo(
    () => serieCA.reduce((max, d) => (d.ca > max.ca ? d : max), serieCA[0]),
    [serieCA],
  );

  // ── Série charges fiscales 12 mois ───────────────────────────────────────
  const serieFiscale = useMemo(() => {
    const masseSalariale = employes.reduce(
      (s, e) => s + (e.salaire || 0) + (e.sursalaire || 0),
      0,
    );
    const cnssMensuelle = masseSalariale * ((taux.cnssEmp || 0) + (taux.cnssSal || 0));
    const out: { label: string; TVA: number; CNSS: number; IRPP: number; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d    = new Date(annee, mois - 1 - i, 1);
      const a    = d.getFullYear();
      const mo   = d.getMonth() + 1;
      const mm   = donneesMensuelles[moisKey(a, mo)];
      const tva  = mm ? sumTvaCollectee(mm) : 0;
      const irpp = masseSalariale * 0.1;
      out.push({
        label: `${MOIS_COURTS[d.getMonth()]} ${String(a).slice(2)}`,
        TVA:   Math.round(tva),
        CNSS:  Math.round(cnssMensuelle),
        IRPP:  Math.round(irpp),
        total: Math.round(tva + cnssMensuelle + irpp),
      });
    }
    return out;
  }, [donneesMensuelles, employes, taux, annee, mois]);

  // ── Alertes internes dashboard ───────────────────────────────────────────
  const alertesDash = useMemo(() => {
    const a: { type: "danger" | "warning" | "info"; msg: string }[] = [];
    if (kpis.tresorerie < 0)
      a.push({ type: "danger", msg: `Trésorerie négative : ${formatMontant(kpis.tresorerie)}` });
    if (kpis.montantImpaye > 0)
      a.push({
        type: "warning",
        msg: `${kpis.facturesImpayees} facture${kpis.facturesImpayees > 1 ? "s" : ""} impayée${kpis.facturesImpayees > 1 ? "s" : ""} — ${formatMontant(kpis.montantImpaye)} en attente`,
      });
    const now = new Date();
    if (
      now.getDate() >= 10 && now.getDate() <= 15
      && now.getFullYear() === annee
      && now.getMonth() + 1 === mois
    )
      a.push({
        type: "info",
        msg: `Déclaration TVA à déposer avant le 15/${String(mois).padStart(2, "0")}/${annee}`,
      });
    return a;
  }, [kpis, annee, mois]);

  // ── Répartition par activité (vue consolidée uniquement) ──────────────────
  const showRepartition = !activiteFiltre && activites.length >= 2;
  const repartition = useMemo(() => {
    if (!showRepartition || !moisCourant) return [];
    const rows = activites.map((a) => {
      const sub = filterMoisByActivite(moisCourant, a.id);
      const ca = sumRecettes(sub);
      const dep = sumDepenses(sub);
      return { id: a.id, nom: a.nom, couleur: a.couleur, ca, dep, solde: ca - dep };
    });
    // Lignes sans activité (repli), affichées seulement si elles portent des montants.
    const sub0 = filterMoisByActivite(moisCourant, null);
    const ca0 = sumRecettes(sub0);
    const dep0 = sumDepenses(sub0);
    if (ca0 !== 0 || dep0 !== 0) {
      rows.push({ id: "__none__", nom: "Sans activité", couleur: "#94a3b8", ca: ca0, dep: dep0, solde: ca0 - dep0 });
    }
    return rows
      .filter((r) => r.ca !== 0 || r.dep !== 0)
      .sort((x, y) => y.ca - x.ca);
  }, [showRepartition, moisCourant, activites]);

  const totalRepartitionCA = useMemo(
    () => repartition.reduce((s, r) => s + r.ca, 0),
    [repartition],
  );

  return (
    <div className="space-y-5">

      {/* ── Sélecteur unité ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3">
        <Label htmlFor="unit-select" className="text-xs text-muted-foreground">
          {t("dashboard.unit")} :
        </Label>
        <Select value={unit} onValueChange={(v) => setUnitPersist(v as UnitMode)}>
          <SelectTrigger id="unit-select" className="h-8 w-48 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="F">{t("dashboard.unit_franc")}</SelectItem>
            <SelectItem value="kF">{t("dashboard.unit_thousand")}</SelectItem>
            <SelectItem value="100kF">{t("dashboard.unit_hundred_thousand")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── D7 : Alertes actives ───────────────────────────────────────────── */}
      {alertesDash.length > 0 && (
        <div className="space-y-2">
          {alertesDash.map((a, i) => {
            const Icon =
              a.type === "danger" ? AlertCircle
              : a.type === "warning" ? AlertTriangle
              : Info;
            const cls =
              a.type === "danger"
                ? "bg-destructive/10 border-destructive/30 text-destructive"
                : a.type === "warning"
                ? "bg-warning/10 border-warning/30 text-warning"
                : "bg-primary/10 border-primary/30 text-primary";
            return (
              <div
                key={i}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm font-medium ${cls}`}
              >
                <Icon className="size-4 shrink-0" />
                <span>{a.msg}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── D1 / D2 / D3 : KPI Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* D1 : CA Mois avec tendance */}
        <KpiCard
          icon={<TrendingUp className="size-5" />}
          label={t("dashboard.revenue_month")}
          value={fmt(kpis.ca)}
          tendance={kpis.tendanceCA}
          comparaison={kpis.caPrecedent > 0 ? `vs ${fmt(kpis.caPrecedent)} mois préc.` : undefined}
          tone="success"
        />

        {/* Masse salariale */}
        <KpiCard
          icon={<Wallet className="size-5" />}
          label={t("dashboard.payroll")}
          value={fmt(kpis.masseSalariale)}
          tone="primary"
        />

        {/* D3 : Factures impayées avec montant total */}
        <KpiCard
          icon={<FileWarning className="size-5" />}
          label={t("dashboard.unpaid_invoices")}
          value={String(kpis.facturesImpayees)}
          comparaison={kpis.montantImpaye > 0 ? `${fmt(kpis.montantImpaye)} en attente` : undefined}
          tone={kpis.facturesImpayees > 0 ? "warning" : "muted"}
        />

        {/* D2 : Trésorerie avec sparkline 6 mois */}
        <KpiCardSparkline
          icon={<Banknote className="size-5" />}
          label={t("dashboard.treasury")}
          value={fmt(kpis.tresorerie)}
          tendance={kpis.tendanceTresorerie}
          tone={kpis.tresorerie >= 0 ? "success" : "destructive"}
          sparkData={sparklineTresorerie}
        />
      </div>

      {/* ── Répartition par activité (consolidé, ≥2 activités) ─────────────── */}
      {showRepartition && repartition.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">
                Répartition par activité — {MOIS_COURTS[mois - 1]} {annee}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                CA total : {fmt(totalRepartitionCA)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Barres CA par activité */}
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={repartition}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v) => fmt(Number(v))}
                  />
                  <YAxis
                    type="category"
                    dataKey="nom"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    width={96}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [fmt(v), "CA"]}
                  />
                  <Bar dataKey="ca" radius={[0, 3, 3, 0]}>
                    {repartition.map((r) => (
                      <Cell key={r.id} fill={r.couleur} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Tableau détaillé */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left font-medium py-1.5 pr-3">Activité</th>
                    <th className="text-right font-medium py-1.5 px-3">CA</th>
                    <th className="text-right font-medium py-1.5 px-3">Dépenses</th>
                    <th className="text-right font-medium py-1.5 px-3">Solde</th>
                    <th className="text-right font-medium py-1.5 pl-3 hidden sm:table-cell">% CA</th>
                  </tr>
                </thead>
                <tbody>
                  {repartition.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: r.couleur }} />
                          <span className="truncate">{r.nom}</span>
                        </span>
                      </td>
                      <td className="text-right tabular-nums py-2 px-3">{fmt(r.ca)}</td>
                      <td className="text-right tabular-nums py-2 px-3 text-muted-foreground">{fmt(r.dep)}</td>
                      <td className={`text-right tabular-nums py-2 px-3 font-medium ${r.solde >= 0 ? "text-success" : "text-destructive"}`}>
                        {fmt(r.solde)}
                      </td>
                      <td className="text-right tabular-nums py-2 pl-3 text-muted-foreground hidden sm:table-cell">
                        {totalRepartitionCA > 0 ? `${Math.round((r.ca / totalRepartitionCA) * 100)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Trésorerie prévisionnelle ──────────────────────────────────────── */}
      <TresorerieCard
        donneesMensuelles={donneesMensuelles}
        employes={employes}
        annee={annee}
        mois={mois}
      />

      {/* ── D4 : Graphique CA 12 mois avec moyenne + annotation pic ──────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">{t("dashboard.revenue_12m")}</CardTitle>
            {moyenneCA > 0 && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-6 border-t-2 border-dashed border-warning inline-block align-middle" />
                  Moyenne : {fmt(moyenneCA)}
                </span>
                {picCA && picCA.ca > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    📈 Pic : {picCA.label} — {fmt(picCA.ca)}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serieCA} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradCA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(v) => fmt(Number(v))}
                width={72}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [fmt(v), "CA"]}
              />
              {/* Ligne de moyenne */}
              {moyenneCA > 0 && (
                <ReferenceLine
                  y={moyenneCA}
                  stroke="hsl(var(--warning))"
                  strokeDasharray="4 4"
                  label={{
                    value: "Moy.",
                    position: "right",
                    fontSize: 10,
                    fill: "hsl(var(--warning))",
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="ca"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                fill="url(#gradCA)"
                dot={{ r: 3, fill: "hsl(var(--primary))" }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── D5 : Charges fiscales avec total consolidé dans tooltip ──────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("dashboard.tax_charges")}</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serieFiscale} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(v) => fmt(Number(v))}
                width={72}
              />
              {/* Tooltip personnalisé avec total */}
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
                  return (
                    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-xs space-y-1">
                      <p className="font-semibold text-sm mb-1">{label}</p>
                      {payload.map((p) => (
                        <div key={p.name} className="flex justify-between gap-4">
                          <span style={{ color: p.color }}>{p.name}</span>
                          <span className="font-mono">{fmt(Number(p.value))}</span>
                        </div>
                      ))}
                      <div className="border-t border-border pt-1 mt-1 flex justify-between font-bold">
                        <span>Total</span>
                        <span className="font-mono">{fmt(total)}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="TVA"  fill="hsl(var(--primary))"     radius={[3, 3, 0, 0]} />
              <Bar dataKey="CNSS" fill="hsl(var(--accent))"      radius={[3, 3, 0, 0]} />
              <Bar dataKey="IRPP" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

// ── KPI Card avec tendance ────────────────────────────────────────────────────
interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  tendance?: number | null;
  comparaison?: string;
  tone: Tone;
}

const KpiCard = ({ icon, label, value, tendance, comparaison, tone }: KpiCardProps) => {
  const hasTendance = tendance !== null && tendance !== undefined;
  const TendanceIcon = !hasTendance ? Minus : tendance! > 0 ? ArrowUpRight : ArrowDownRight;
  const tendanceCls  = !hasTendance ? "text-muted-foreground"
    : tendance! > 0 ? "text-success" : "text-destructive";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={`rounded-lg p-2 ${TONE_BG[tone]}`}>{icon}</div>
          {hasTendance && (
            <div className={`flex items-center gap-0.5 text-xs font-semibold ${tendanceCls}`}>
              <TendanceIcon className="size-3.5" />
              {Math.abs(tendance!).toFixed(1)}%
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground font-medium mb-0.5 truncate">{label}</p>
        <p className="text-xl font-bold tabular-nums leading-tight truncate">{value}</p>
        {comparaison && (
          <p className="text-[10px] text-muted-foreground mt-1 truncate">{comparaison}</p>
        )}
      </CardContent>
    </Card>
  );
};

// ── D2 : KPI Card avec sparkline 6 mois ──────────────────────────────────────
interface KpiCardSparklineProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  tendance?: number | null;
  tone: Tone;
  sparkData: { v: number }[];
}

const KpiCardSparkline = ({ icon, label, value, tendance, tone, sparkData }: KpiCardSparklineProps) => {
  const hasTendance = tendance !== null && tendance !== undefined;
  const TendanceIcon = !hasTendance ? Minus : tendance! > 0 ? ArrowUpRight : ArrowDownRight;
  const tendanceCls  = !hasTendance ? "text-muted-foreground"
    : tendance! > 0 ? "text-success" : "text-destructive";
  const sparkColor =
    tone === "success"     ? "hsl(var(--success))"
    : tone === "destructive" ? "hsl(var(--destructive))"
    : "hsl(var(--primary))";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={`rounded-lg p-2 ${TONE_BG[tone]}`}>{icon}</div>
          {hasTendance && (
            <div className={`flex items-center gap-0.5 text-xs font-semibold ${tendanceCls}`}>
              <TendanceIcon className="size-3.5" />
              {Math.abs(tendance!).toFixed(1)}%
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground font-medium mb-0.5 truncate">{label}</p>
        <p className="text-xl font-bold tabular-nums leading-tight truncate">{value}</p>
        {/* Sparkline 6 mois — sans axes ni grille */}
        <div className="h-10 mt-2 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={sparkColor}
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
