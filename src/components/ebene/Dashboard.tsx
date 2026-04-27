import { useMemo } from "react";
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
} from "recharts";
import {
  TrendingUp,
  Wallet,
  FileWarning,
  Banknote,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DonneesMensuelles,
  Employe,
  TauxFiscaux,
  MoisData,
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
}

const MOIS_COURTS = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

const sumRecettes = (m: MoisData): number =>
  m.transactions
    .filter((t) => t.type === "r")
    .reduce((s, t) => s + Math.abs(t.m), 0);

const sumDepenses = (m: MoisData): number =>
  m.transactions
    .filter((t) => t.type === "d")
    .reduce((s, t) => s + Math.abs(t.m), 0);

const sumTvaCollectee = (m: MoisData): number =>
  m.factures
    .filter((f) => f.statut === "payee" && f.avecTva)
    .reduce((s, f) => s + f.totalTva, 0);

export const Dashboard = ({
  donneesMensuelles,
  employes,
  tauxHistorique,
  annee,
  mois,
}: DashboardProps) => {
  // ─── KPIs du mois en cours ──────────────────────────────────────────────
  const moisCourant = donneesMensuelles[moisKey(annee, mois)];
  const taux = tauxPourMois(tauxHistorique, annee, mois) || TAUX_DEFAUT;

  const kpis = useMemo(() => {
    const m: MoisData = moisCourant ?? {
      transactions: [],
      factures: [],
      primes: {},
    };
    const ca = sumRecettes(m);

    // Masse salariale brute = somme des salaires de base + indemnités
    const masseSalariale = employes.reduce(
      (s, e) =>
        s +
        (e.salaire || 0) +
        (e.indemniteTransport || 0) +
        (e.indemniteLogement || 0) +
        (e.indemniteFonction || 0) +
        (e.sursalaire || 0),
      0
    );

    const facturesImpayees = m.factures.filter(
      (f) => f.statut === "en_attente"
    ).length;

    // Trésorerie estimée = cumul (recettes - dépenses) sur tous les mois
    let tresorerie = 0;
    Object.values(donneesMensuelles).forEach((mm) => {
      if (!mm) return;
      tresorerie += sumRecettes(mm) - sumDepenses(mm);
    });

    return { ca, masseSalariale, facturesImpayees, tresorerie };
  }, [moisCourant, employes, donneesMensuelles]);

  // ─── Série CA des 12 derniers mois ──────────────────────────────────────
  const serieCA = useMemo(() => {
    const out: { label: string; ca: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(annee, mois - 1 - i, 1);
      const a = d.getFullYear();
      const mo = d.getMonth() + 1;
      const mm = donneesMensuelles[moisKey(a, mo)];
      const ca = mm ? sumRecettes(mm) : 0;
      out.push({
        label: `${MOIS_COURTS[d.getMonth()]} ${String(a).slice(2)}`,
        ca,
      });
    }
    return out;
  }, [donneesMensuelles, annee, mois]);

  // ─── Charges fiscales mensuelles (TVA, CNSS, IRPP) sur 12 mois ──────────
  const serieFiscale = useMemo(() => {
    const out: { label: string; TVA: number; CNSS: number; IRPP: number }[] = [];
    // Masse salariale courante (approximation : on applique la même chaque mois)
    const masseSalariale = employes.reduce(
      (s, e) => s + (e.salaire || 0) + (e.sursalaire || 0),
      0
    );
    const cnssMensuelle =
      masseSalariale * ((taux.cnssEmp || 0) + (taux.cnssSal || 0));

    for (let i = 11; i >= 0; i--) {
      const d = new Date(annee, mois - 1 - i, 1);
      const a = d.getFullYear();
      const mo = d.getMonth() + 1;
      const mm = donneesMensuelles[moisKey(a, mo)];
      const tvaMois = mm ? sumTvaCollectee(mm) : 0;
      // IRPP estimé mensuel = approximation simple (10% de la masse salariale)
      const irpp = masseSalariale * 0.1;
      out.push({
        label: `${MOIS_COURTS[d.getMonth()]} ${String(a).slice(2)}`,
        TVA: Math.round(tvaMois),
        CNSS: Math.round(cnssMensuelle),
        IRPP: Math.round(irpp),
      });
    }
    return out;
  }, [donneesMensuelles, employes, taux, annee, mois]);

  return (
    <div className="space-y-6">
      {/* ─── KPIs ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<TrendingUp className="size-5" />}
          label="Chiffre d'affaires (mois)"
          value={`${formatMontant(kpis.ca)} F`}
          tone="success"
        />
        <KpiCard
          icon={<Wallet className="size-5" />}
          label="Masse salariale"
          value={`${formatMontant(kpis.masseSalariale)} F`}
          tone="primary"
        />
        <KpiCard
          icon={<FileWarning className="size-5" />}
          label="Factures impayées"
          value={String(kpis.facturesImpayees)}
          tone={kpis.facturesImpayees > 0 ? "warning" : "muted"}
        />
        <KpiCard
          icon={<Banknote className="size-5" />}
          label="Trésorerie estimée"
          value={`${formatMontant(kpis.tresorerie)} F`}
          tone={kpis.tresorerie >= 0 ? "success" : "destructive"}
        />
      </div>

      {/* ─── Trésorerie & prévisionnel ────────────────────── */}
      <TresorerieCard
        donneesMensuelles={donneesMensuelles}
        employes={employes}
        annee={annee}
        mois={mois}
      />

      {/* ─── Line chart CA ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Chiffre d'affaires — 12 derniers mois
          </CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serieCA} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(v) => formatMontant(Number(v))}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${formatMontant(v)} F`, "CA"]}
              />
              <Line
                type="monotone"
                dataKey="ca"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ─── Bar chart Charges fiscales ───────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Charges fiscales mensuelles — TVA, CNSS, IRPP
          </CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serieFiscale} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(v) => formatMontant(Number(v))}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => `${formatMontant(v)} F`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="TVA" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="CNSS" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="IRPP" fill="hsl(var(--secondary-foreground))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── KPI Card ─────────────────────────────────────────────────────────────
interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "primary" | "success" | "warning" | "destructive" | "muted";
}

const TONE_CLASSES: Record<KpiCardProps["tone"], string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/15 text-success-foreground",
  warning: "bg-warning/15 text-warning-foreground",
  destructive: "bg-destructive/15 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

const KpiCard = ({ icon, label, value, tone }: KpiCardProps) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className={`rounded-xl p-2.5 ${TONE_CLASSES[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="text-lg font-bold truncate">{value}</div>
      </div>
    </CardContent>
  </Card>
);