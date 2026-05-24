import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, Save, RefreshCw } from "lucide-react";
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

interface Props {
  societeId: string;
  canEdit?: boolean;
}

const fmt = (n: number) => n.toLocaleString("fr-FR");

export const TauxImpots = ({ societeId, canEdit = false }: Props) => {
  const { fiscalite, isLoading, updateFiscal, isUpdating } = useFiscalite(societeId);

  const [regime,    setRegime]    = useState<RegimeFiscal>("IS");
  const [secteur,   setSecteur]   = useState<SecteurActivite>("SE");
  const [caInput,   setCaInput]   = useState("");
  const [tvaAuto,   setTvaAuto]   = useState(false);
  const [dirty,     setDirty]     = useState(false);

  // Sync depuis la DB
  useEffect(() => {
    if (!fiscalite) return;
    setRegime(fiscalite.regime_fiscal);
    setSecteur(fiscalite.secteur_activite);
    setCaInput(fiscalite.ca_annuel_estime > 0 ? String(fiscalite.ca_annuel_estime) : "");
    setTvaAuto(fiscalite.assujetti_tva);
    setDirty(false);
  }, [fiscalite]);

  const ca = parseFloat(caInput.replace(/\s/g, "")) || 0;

  // Calculer la TVA automatiquement selon le CA
  const tvaAutoCalc = calcAssujetti(ca, regime, secteur);

  // Aperçu en temps réel des impôts
  const preview: ImpotApplicable[] = generateSetImpots({
    regime,
    secteur,
    caAnnuel: ca,
    assujetti_tva: tvaAuto,
  });

  const handleSave = async () => {
    try {
      await updateFiscal({
        regime_fiscal:    regime,
        secteur_activite: secteur,
        assujetti_tva:    tvaAuto,
        ca_annuel_estime: ca,
      });
      setDirty(false);
      toast.success("Régime fiscal mis à jour");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleAutoTVA = () => {
    const newTva = calcAssujetti(ca, regime, secteur);
    setTvaAuto(newTva);
    setDirty(true);
  };

  const handleRecommande = () => {
    const rec = regimeRecommande(ca, secteur);
    setRegime(rec);
    setDirty(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tvaPossible = !REGIMES_SANS_TVA.includes(regime) && !SECTEURS_SANS_TVA.includes(secteur);

  return (
    <div className="space-y-6">
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
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(REGIME_LABELS) as [RegimeFiscal, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground italic">
            {REGIME_DESCRIPTIONS[regime]}
          </p>
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
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(SECTEUR_LABELS) as [SecteurActivite, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* CA annuel estimé */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            CA annuel estimé (FCFA)
          </Label>
          <Input
            type="number"
            min="0"
            value={caInput}
            onChange={(e) => { setCaInput(e.target.value); setDirty(true); }}
            placeholder="Ex : 80000000"
            disabled={!canEdit}
          />
          {ca > 0 && (
            <p className="text-xs text-muted-foreground">
              {fmt(ca)} FCFA
              {ca > SEUIL_TVA_TOGO
                ? " — Seuil TVA dépassé (> 60 M)"
                : " — Sous le seuil TVA (< 60 M)"}
            </p>
          )}
        </div>

        {/* TVA */}
        <div className="space-y-1.5">
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
          {canEdit && tvaPossible && ca > 0 && tvaAutoCalc !== tvaAuto && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 mt-1"
              onClick={handleAutoTVA}
            >
              <RefreshCw className="size-3 mr-1" />
              Auto : passer à {tvaAutoCalc ? "Assujetti" : "Non assujetti"} (CA {tvaAutoCalc ? ">" : "<"} 60 M)
            </Button>
          )}
        </div>
      </div>

      {/* ── Actions ────────────────────────────────────────────────────── */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleSave}
            disabled={!dirty || isUpdating}
          >
            {isUpdating
              ? <><Loader2 className="size-4 mr-2 animate-spin" />Enregistrement…</>
              : <><Save className="size-4 mr-2" />Enregistrer</>}
          </Button>
          {ca > 0 && (
            <Button variant="outline" size="sm" onClick={handleRecommande} className="text-xs">
              Régime recommandé : {regimeRecommande(ca, secteur)}
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

        {preview.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Aucune taxe calculée — saisissez un CA estimé.
          </p>
        ) : (
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
        )}
      </div>
    </div>
  );
};
