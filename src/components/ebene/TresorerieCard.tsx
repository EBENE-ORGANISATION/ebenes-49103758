import { useMemo } from "react";
import { ecritureTresorerieAutonome } from "@/lib/ecrituresTresorerie";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownCircle, ArrowUpCircle, TrendingUp } from "lucide-react";
import { DonneesMensuelles, Employe, MoisData, TAUX_DEFAUT, type TauxFiscaux } from "@/types/ebene";
import { calculerPaie } from "@/lib/paie";
import { formatMontant, formatSolde, moisKey } from "@/lib/ebene-utils";
import { sommePrefixes } from "@/lib/etatsFinanciers";
import { useTranslation } from "react-i18next";

interface Props {
  donneesMensuelles: DonneesMensuelles;
  employes: Employe[];
  annee: number;
  mois: number;
  /** Taux CNSS/AMU du mois (historique de la société). */
  taux?: TauxFiscaux;
}

const sumIfMois = (m: MoisData | undefined, type: "r" | "d") =>
  (m?.transactions || [])
    .filter((t) => t.type === type)
    .reduce((s, t) => s + Math.abs(t.m), 0);

/** Flux de trésorerie SYSCOHADA (comptes 52x/57x) pour un mois.
 *  type "r" = débit (entrées), type "d" = crédit (sorties).
 *  Les écritures liées à une facture sont exclues (déjà comptées via transactions). */
const sumEcrituresMois = (m: MoisData | undefined, type: "r" | "d"): number => {
  if (!m?.ecritures) return 0;
  return m.ecritures
    .filter(ecritureTresorerieAutonome)
    .flatMap((e) => (Array.isArray(e.lignes) ? e.lignes : []))
    .filter((l) => l.compte.startsWith("52") || l.compte.startsWith("57"))
    .reduce((s, l) => s + (type === "r" ? l.debit : l.credit), 0);
};

/**
 * Carte « Trésorerie » :
 *  - Encaissements   = somme des transactions de recette (factures payées + manuelles)
 *  - Décaissements   = somme des transactions de dépense
 *  - Prévision 30 j  = trésorerie nette + factures en_attente du mois
 *                       − charges récurrentes estimées (masse salariale chargée
 *                       + moyenne des dépenses des 3 derniers mois)
 *                       − impôts et cotisations dus (CNSS/AMU, IRPP, TVA)
 */
export const TresorerieCard = ({
  donneesMensuelles,
  employes,
  annee,
  mois,
  taux = TAUX_DEFAUT,
}: Props) => {
  const { t } = useTranslation();
  const k = moisKey(annee, mois);
  const m = donneesMensuelles[k];

  const stats = useMemo(() => {
    const encaissementsMois = sumIfMois(m, "r") + sumEcrituresMois(m, "r");
    const decaissementsMois = sumIfMois(m, "d") + sumEcrituresMois(m, "d");
    const soldeMois = encaissementsMois - decaissementsMois;

    // Trésorerie cumulée = solde net depuis le début (transactions + SYSCOHADA)
    let tresorerie = 0;
    Object.values(donneesMensuelles).forEach((mm) => {
      if (!mm) return;
      tresorerie +=
        sumIfMois(mm, "r") + sumEcrituresMois(mm, "r")
        - sumIfMois(mm, "d") - sumEcrituresMois(mm, "d");
    });

    // Factures en attente sur le mois courant (encaissements probables)
    const facturesEnAttente = (m?.factures || [])
      .filter((f) => f.statut === "en_attente")
      .reduce((s, f) => s + f.totalTtc, 0);

    // Charges salariales du mois : coût employeur calculé comme les bulletins
    // (ancienneté, primes et HS validées, congés sans solde, taux du mois)
    const moisData = m ?? { transactions: [], factures: [], primes: {}, ecritures: [] };
    const chargesSalariales = employes.reduce(
      (s, e) => s + calculerPaie(e, moisData, annee, mois, taux).coutEmployeur,
      0,
    );

    //  - moyenne des dépenses (hors salaires auto) sur les 3 derniers mois clos
    let totalDepRecur = 0;
    let nbMois = 0;
    for (let i = 1; i <= 3; i++) {
      const d = new Date(annee, mois - 1 - i, 1);
      const mm = donneesMensuelles[moisKey(d.getFullYear(), d.getMonth() + 1)];
      if (!mm) continue;
      const dep = (mm.transactions || [])
        .filter((t) => t.type === "d" && t.source !== "salaires")
        .reduce((s, t) => s + Math.abs(t.m), 0);
      totalDepRecur += dep;
      nbMois++;
    }
    const depensesRecurrentes = nbMois > 0 ? totalDepRecur / nbMois : 0;

    // Impôts et cotisations déjà dus, à reverser (écritures validées) :
    // CNSS/AMU (43), IRPP retenu (447), TVA due (443 − 445 si positive)
    const soldes = new Map<string, number>();
    Object.values(donneesMensuelles).forEach((mm) => {
      (mm?.ecritures || [])
        .filter((e) => e.statut !== "brouillon")
        .forEach((e) => (Array.isArray(e.lignes) ? e.lignes : []).forEach((l) => {
          soldes.set(l.compte, (soldes.get(l.compte) || 0) + l.debit - l.credit);
        }));
    });
    const dette = (prefixes: string[]) => Math.max(0, -sommePrefixes(soldes, prefixes));
    const aReverser = dette(["43"]) + dette(["447"]) + dette(["443", "445"]);

    // Prévision sur 30 jours
    const previsionEntrees = facturesEnAttente;
    const previsionSorties = chargesSalariales + depensesRecurrentes + aReverser;
    const previsionNette = tresorerie + previsionEntrees - previsionSorties;

    return {
      encaissementsMois,
      decaissementsMois,
      soldeMois,
      tresorerie,
      facturesEnAttente,
      chargesSalariales,
      depensesRecurrentes,
      aReverser,
      previsionEntrees,
      previsionSorties,
      previsionNette,
    };
  }, [m, donneesMensuelles, employes, annee, mois, taux]);

  const previsionTone =
    stats.previsionNette > stats.tresorerie
      ? "text-success"
      : stats.previsionNette < 0
      ? "text-destructive"
      : "text-warning";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {t("tresorerie.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Tile
            icon={<ArrowDownCircle className="size-5 text-success" />}
            label={t("tresorerie.encaissements_label")}
            value={formatMontant(stats.encaissementsMois)}
            sub={t("tresorerie.encaissements_sub")}
            tone="success"
          />
          <Tile
            icon={<ArrowUpCircle className="size-5 text-destructive" />}
            label={t("tresorerie.decaissements_label")}
            value={formatMontant(stats.decaissementsMois)}
            sub={t("tresorerie.decaissements_sub")}
            tone="destructive"
          />
          <Tile
            icon={<TrendingUp className="size-5 text-primary" />}
            label={t("tresorerie.solde_label")}
            value={formatSolde(stats.soldeMois)}
            sub={t("tresorerie.solde_sub", { value: formatSolde(stats.tresorerie) })}
            tone={stats.soldeMois >= 0 ? "success" : "destructive"}
          />
        </div>

        <div className="rounded-lg border-2 border-dashed border-border p-4 bg-muted/30">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("tresorerie.forecast_title")}
            </p>
            <span className={`amount text-lg font-bold whitespace-nowrap ${previsionTone}`}>
              {formatSolde(stats.previsionNette)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t("tresorerie.pending_invoices")}</span>
              <span className="amount text-success">
                {formatMontant(stats.facturesEnAttente)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t("tresorerie.payroll_loaded")}</span>
              <span className="amount text-destructive">
                {formatMontant(stats.chargesSalariales)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t("tresorerie.starting_cash")}</span>
              <span className="amount">{formatSolde(stats.tresorerie)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t("tresorerie.taxes_due")}</span>
              <span className="amount text-destructive">
                {formatMontant(stats.aReverser)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t("tresorerie.recurring_expenses")}</span>
              <span className="amount text-destructive">
                {formatMontant(stats.depensesRecurrentes)}
              </span>
            </div>
          </div>
          {/* D6 : Barre de progression trésorerie actuelle → prévision 30j */}
          {stats.tresorerie !== 0 && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Trésorerie actuelle</span>
                <span>Prévision 30j</span>
              </div>
              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    stats.previsionNette >= stats.tresorerie ? "bg-success" : "bg-destructive"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.abs(
                        stats.previsionNette /
                          Math.max(Math.abs(stats.tresorerie), Math.abs(stats.previsionNette))
                      ) * 100
                    )}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono mt-0.5">
                <span className={stats.tresorerie >= 0 ? "text-success" : "text-destructive"}>
                  {formatSolde(stats.tresorerie)}
                </span>
                <span className={stats.previsionNette >= 0 ? "text-success" : "text-destructive"}>
                  {formatSolde(stats.previsionNette)}
                </span>
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-2 italic">{t("tresorerie.note")}</p>
        </div>
      </CardContent>
    </Card>
  );
};

const Tile = ({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "success" | "destructive" | "warning";
}) => {
  const cls =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
      ? "text-destructive"
      : "text-warning";
  return (
    <div className="rounded-lg border border-border p-3 bg-card">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`amount text-lg font-bold ${cls}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
};