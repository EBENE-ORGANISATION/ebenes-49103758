import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, RefreshCw, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  type RegimeFiscal,
  type SecteurActivite,
  type ImpotApplicable,
  REGIME_LABELS,
  REGIME_DESCRIPTIONS,
  SECTEUR_LABELS,
  PERIODICITE_LABELS,
  SEUIL_TVA_TOGO,
  REGIMES_SANS_TVA,
  SECTEURS_SANS_TVA,
} from "@/types/fiscal";
import {
  generateSetImpots,
  regimeRecommande,
  calcAssujetti,
} from "@/utils/fiscalAutoSet";
import { useFiscalite } from "@/hooks/useFiscalite";
import { useTransactions } from "@/hooks/data/useTransactions";

interface Props {
  societeId: string;
  canEdit?: boolean;
}

const fmt = (n: number) => n.toLocaleString("fr-FR");

export const TauxImpots = ({ societeId, canEdit = false }: Props) => {
  const { fiscalite, isLoading, updateFiscal, isUpdating } = useFiscalite(societeId);
  const { transactions } = useTransactions(societeId);

  const [regime,  setRegime]  = useState<RegimeFiscal>("IS");
  const [secteur, setSecteur] = useState<SecteurActivite>("SE");
  const [tvaAuto, setTvaAuto] = useState(false);
  const [dirty,   setDirty]   = useState(false);

  // ── CA calculé automatiquement depuis les recettes de l'année en cours ──
  const anneeEnCours = new Date().getFullYear();
  const caAutoCalcule = useMemo(() => {
    let total = 0;
    for (let mois = 1; mois <= 12; mois++) {
      const key = `${anneeEnCours}-${mois}`;
      for (const t of (transactions[key] ?? [])) {
        if (t.type === "r") total += t.m;
      }
    }
    return Math.round(total);
  }, [transactions, anneeEnCours]);

  // ── Sync depuis la DB (régime, secteur, TVA uniquement — CA vient des recettes) ──
  useEffect(() => {
    if (!fiscalite) return;
    setRegime(fiscalite.regime_fiscal);
    setSecteur(fiscalite.secteur_activite);
    setTvaAuto(fiscalite.assujetti_tva);
    setDirty(false);
  }, [fiscalite]);

  // ── Auto-sauvegarde de ca_annuel_estime dès que les recettes changent ──
  const lastSavedCaRef = useRef<number | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      if (lastSavedCaRef.current === caAutoCalcule) return;
      try {
        await updateFiscal({ ca_annuel_estime: caAutoCalcule });
        lastSavedCaRef.current = caAutoCalcule;
      } catch { /* silencieux — l'utilisateur n'a rien fait */ }
    }, 2000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [caAutoCalcule]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Calculs en temps réel ────────────────────────────────────────────────
  const tvaAutoCalc  = calcAssujetti(caAutoCalcule, regime, secteur);
  const tvaPossible  = !REGIMES_SANS_TVA.includes(regime) && !SECTEURS_SANS_TVA.includes(secteur);

  const preview: ImpotApplicable[] = generateSetImpots({
    regime,
    secteur,
    caAnnuel:     caAutoCalcule,
    assujetti_tva: tvaAuto,
  });

  const handleSave = async () => {
    try {
      await updateFiscal({
        regime_fiscal:    regime,
        secteur_activite: secteur,
        assujetti_tva:    tvaAuto,
        ca_annuel_estime: caAutoCalcule,
      });
      lastSavedCaRef.current = caAutoCalcule;
      setDirty(false);
      toast.success("Régime fiscal mis à jour");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleAutoTVA = () => {
    setTvaAuto(calcAssujetti(caAutoCalcule, regime, secteur));
    setDirty(true);
  };

  const handleRecommande = () => {
    setRegime(regimeRecommande(caAutoCalcule, secteur));
    setDirty(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── CA calculé automatiquement ──────────────────────────────────── */}
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <TrendingUp className="size-4 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            CA {anneeEnCours} — calculé automatiquement depuis les recettes enregistrées
          </p>
          <p className="text-lg font-bold tabular-nums">
            {fmt(caAutoCalcule)} <span className="text-sm font-normal text-muted-foreground">FCFA</span>
          </p>
        </div>
        <Badge variant={caAutoCalcule > SEUIL_TVA_TOGO ? "default" : "secondary"} className="shrink-0 text-xs">
          {caAutoCalcule > SEUIL_TVA_TOGO ? "Seuil TVA dépassé" : "Sous le seuil TVA"}
        </Badge>
      </div>

      {/* ── Sélecteurs ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Régime fiscal */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Régime fiscal *
          </Label>
          <Select
            value={regime}
            onValueChange={(v) => { setRegime(v as RegimeFiscal); setDirty(true); }}
            disabled={!canEdit}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(REGIME_LABELS) as [RegimeFiscal, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground italic">{REGIME_DESCRIPTIONS[regime]}</p>
        </div>

        {/* Secteur d'activité */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Secteur d'activité *
          </Label>
          <Select
            value={secteur}
            onValueChange={(v) => { setSecteur(v as SecteurActivite); setDirty(true); }}
            disabled={!canEdit}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(SECTEUR_LABELS) as [SecteurActivite, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* TVA */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Assujetti TVA (18%)
          </Label>
          <div className="flex items-center gap-3 mt-1">
            <Switch
              checked={tvaAuto}
              onCheckedChange={(v) => { setTvaAuto(v); setDirty(true); }}
              disabled={!canEdit || !tvaPossible}
            />
            <span className="text-sm">
              {!tvaPossible
                ? "Non applicable (régime exonéré)"
                : tvaAuto
                ? "Oui — collecte et déclare la TVA"
                : "Non assujetti"}
            </span>
          </div>
          {canEdit && tvaPossible && caAutoCalcule > 0 && tvaAutoCalc !== tvaAuto && (
            <Button size="sm" variant="outline" className="text-xs h-7 mt-1" onClick={handleAutoTVA}>
              <RefreshCw className="size-3 mr-1" />
              Auto : passer à {tvaAutoCalc ? "Assujetti" : "Non assujetti"} (CA {tvaAutoCalc ? ">" : "<"} 60 M)
            </Button>
          )}
        </div>
      </div>

      {/* ── Actions ────────────────────────────────────────────────────── */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSave} disabled={!dirty || isUpdating}>
            {isUpdating
              ? <><Loader2 className="size-4 mr-2 animate-spin" />Enregistrement…</>
              : <><Save className="size-4 mr-2" />Enregistrer</>}
          </Button>
          {caAutoCalcule > 0 && (
            <Button variant="outline" size="sm" onClick={handleRecommande} className="text-xs">
              Régime recommandé : {regimeRecommande(caAutoCalcule, secteur)}
            </Button>
          )}
        </div>
      )}

      {/* ── Aperçu des impôts applicables ──────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">
          Impôts et taxes applicables
          <span className="text-muted-foreground font-normal ml-2 text-xs">
            ({preview.length} taxe{preview.length > 1 ? "s" : ""} — CGI Togo 2025)
          </span>
        </p>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-2 font-semibold">Code</th>
                <th className="text-left p-2 font-semibold">Taxe</th>
                <th className="text-left p-2 font-semibold">Assiette</th>
                <th className="text-right p-2 font-semibold">Taux</th>
                <th className="text-right p-2 font-semibold">Montant estimé</th>
                <th className="text-left p-2 font-semibold">Périodicité</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((imp) => (
                <tr key={imp.code} className="border-t hover:bg-muted/20">
                  <td className="p-2 font-mono font-bold text-primary text-xs">{imp.code}</td>
                  <td className="p-2">
                    {imp.label}
                    {imp.article && (
                      <span className="text-muted-foreground ml-1 text-[10px]">({imp.article})</span>
                    )}
                  </td>
                  <td className="p-2 text-muted-foreground capitalize">{imp.assiette.replace(/_/g, " ")}</td>
                  <td className="p-2 text-right tabular-nums font-semibold">
                    {(imp.taux * 100).toFixed(imp.taux < 0.01 ? 2 : 0)}%
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {imp.montant_estime != null
                      ? `${fmt(imp.montant_estime)} FCFA`
                      : imp.montant_min != null
                      ? `Min. ${fmt(imp.montant_min)} FCFA`
                      : "—"}
                  </td>
                  <td className="p-2">
                    {imp.periodicite && (
                      <Badge variant="outline" className="text-xs">
                        {PERIODICITE_LABELS[imp.periodicite]}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
