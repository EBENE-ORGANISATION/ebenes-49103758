import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownCircle, ArrowUpCircle, TrendingUp } from "lucide-react";
import { DonneesMensuelles, Employe, MoisData } from "@/types/ebene";
import { formatMontant, moisKey } from "@/lib/ebene-utils";
import { useTranslation } from "react-i18next";

interface Props {
  donneesMensuelles: DonneesMensuelles;
  employes: Employe[];
  annee: number;
  mois: number;
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
    .filter((e) => e.statut !== "brouillon" && !e.factureId)
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
 */
export const TresorerieCard = ({
  donneesMensuelles,
  employes,
  annee,
  mois,
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

    // Charges récurrentes mensuelles estimées
    //  - masse salariale brute + ~22.5% de charges patronales
    const masseBrute = employes.reduce(
      (s, e) =>
        s +
        (e.salaire || 0) +
        (e.sursalaire || 0) +
        (e.indemniteTransport || 0) +
        (e.indemniteLogement || 0) +
        (e.indemniteFonction || 0),
      0
    );
    const chargesSalariales = masseBrute * 1.225;

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

    // Prévision sur 30 jours
    const previsionEntrees = facturesEnAttente;
    const previsionSorties = chargesSalariales + depensesRecurrentes;
    const previsionNette = tresorerie + previsionEntrees - previsionSorties;

    return {
      encaissementsMois,
      decaissementsMois,
      soldeMois,
      tresorerie,
      facturesEnAttente,
      chargesSalariales,
      depensesRecurrentes,
      previsionEntrees,
      previsionSorties,
      previsionNette,
    };
  }, [m, donneesMensuelles, employes, annee, mois]);

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
            value={formatMontant(stats.soldeMois)}
            sub={t("tresorerie.solde_sub", { value: formatMontant(stats.tresorerie) })}
            tone={stats.soldeMois >= 0 ? "success" : "destructive"}
          />
        </div>

        <div className="rounded-lg border-2 border-dashed border-border p-4 bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("tresorerie.forecast_title")}
            </p>
            <span className={`amount text-lg font-bold ${previsionTone}`}>
              {formatMontant(stats.previsionNette)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("tresorerie.pending_invoices")}</span>
              <span className="amount text-success">
                {formatMontant(stats.facturesEnAttente)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("tresorerie.payroll_loaded")}</span>
              <span className="amount text-destructive">
                {formatMontant(stats.chargesSalariales)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("tresorerie.starting_cash")}</span>
              <span className="amount">{formatMontant(stats.tresorerie)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("tresorerie.recurring_expenses")}</span>
              <span className="amount text-destructive">
                {formatMontant(stats.depensesRecurrentes)}
              </span>
            </div>
          </div>
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