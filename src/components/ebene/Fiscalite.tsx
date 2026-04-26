import { useMemo, useState, useEffect } from "react";
import { Employe, MoisData, ParamsAnnuels, DonneesMensuelles, TauxFiscaux } from "@/types/ebene";
import { StatCard } from "./StatCard";
import { formatMontant, tauxPourMois, moisKey } from "@/lib/ebene-utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Settings2, History } from "lucide-react";
import { TauxHistoriqueDialog } from "./TauxHistoriqueDialog";
import { useAuth } from "@/hooks/useAuth";

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

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`flex justify-between py-1.5 ${strong ? "font-bold text-base border-t-2 border-border pt-2 mt-1" : "text-sm"}`}>
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

export const Fiscalite = ({
  data, employes, annee, mois, paramsAnnee, onUpdateParams, donneesMensuelles,
  tauxHistorique, onAjouterTaux, onSupprimerTaux,
}: Props) => {
  const { isChefCompta } = useAuth();
  const [editParams, setEditParams] = useState(false);
  const [thInput, setThInput] = useState("");
  const [rslInput, setRslInput] = useState("");
  const [showHistorique, setShowHistorique] = useState(false);

  useEffect(() => {
    setThInput(String(paramsAnnee.th ?? 30000));
    setRslInput(String(paramsAnnee.rsl ?? 52500));
  }, [paramsAnnee, annee, mois, tauxHistorique]);

  const taux = useMemo(() => tauxPourMois(tauxHistorique, annee, mois), [tauxHistorique, annee, mois]);

  // CA annuel cumulé pour calcul IMF (forfait minimum annuel)
  const caAnnuel = useMemo(() => {
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const md = donneesMensuelles[moisKey(annee, m)];
      if (!md) continue;
      total += (md.transactions || []).filter((t) => t.type === "r").reduce((a, t) => a + t.m, 0);
    }
    return total;
  }, [donneesMensuelles, annee]);

  const calc = useMemo(() => {
    const recettes = data.transactions.filter((t) => t.type === "r");
    const rec = recettes.reduce((a, t) => a + t.m, 0);
    // Patente différenciée par activité de la recette
    const recService = recettes
      .filter((t) => (t.activite || taux.activiteDefaut) === "service")
      .reduce((a, t) => a + t.m, 0);
    const recCommerce = recettes
      .filter((t) => (t.activite || taux.activiteDefaut) === "commerce")
      .reduce((a, t) => a + t.m, 0);
    const dep = Math.abs(data.transactions.filter((t) => t.type === "d").reduce((a, t) => a + t.m, 0));
    const ben = Math.max(0, rec - dep);
    const is = ben * taux.is;
    // IMF = max(forfait annuel, taux × CA annuel) → prorata mensuel
    const imfTheoriqueAnnuel = Math.max(taux.imfMin, caAnnuel * taux.imfTaux);
    const imfMensuel = imfTheoriqueAnnuel / 12;
    const impot = Math.max(is, imfMensuel);
    const regime = is >= imfMensuel ? "IS" : "IMF";

    const tva = Math.max(0, rec * taux.tva - dep * taux.tva);
    const patService = recService * taux.patenteService;
    const patCommerce = recCommerce * taux.patenteCommerce;
    const pat = patService + patCommerce;
    const thAnnuel = paramsAnnee.th ?? 30000;
    const rslAnnuel = paramsAnnee.rsl ?? 52500;
    const th = thAnnuel / 12;
    const rsl = rslAnnuel / 12;

    let masse = 0;
    employes.forEach((e) => {
      masse += e.salaire + (e.sursalaire || 0);
      const primes = data.primes[e.id] || [];
      primes.forEach((p) => (masse += p.montant || 0));
    });
    const cnss = masse * taux.cnssEmp;
    const amu = masse * taux.amuEmp;

    return {
      rec, dep, ben, is, imfMensuel, imfAnnuel: imfTheoriqueAnnuel, impot, regime, tva,
      pat, patService, patCommerce, recService, recCommerce,
      th, rsl, thAnnuel, rslAnnuel, masse, cnss, amu,
      totalFiscal: tva + impot + pat + th + rsl,
      totalSocial: cnss + amu,
    };
  }, [data, employes, paramsAnnee, taux, caAnnuel]);

  const sauverParams = () => {
    const th = parseFloat(thInput);
    const rsl = parseFloat(rslInput);
    onUpdateParams({
      th: isNaN(th) ? undefined : th,
      rsl: isNaN(rsl) ? undefined : rsl,
    });
    setEditParams(false);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="CA (Mois)" value={formatMontant(calc.rec)} tone="info" />
        <StatCard label="Bénéfice (Mois)" value={formatMontant(calc.ben)} tone="success" />
        <StatCard
          label="Impôt (Mois)"
          value={formatMontant(calc.impot)}
          tone="warning"
          hint={`Régime appliqué : ${calc.regime}`}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Taux applicables (en vigueur depuis le <strong>{taux.dateEffet}</strong>) — TVA {(taux.tva*100).toFixed(0)}% • IS {(taux.is*100).toFixed(0)}% • Patente service {(taux.patenteService*100).toFixed(2)}% / commerce {(taux.patenteCommerce*100).toFixed(2)}%
        </p>
        {isChefCompta && (
          <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={() => setShowHistorique(true)}>
            <History className="size-3" /> Historique des taux
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-elevated p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-base flex items-center gap-2">
              💼 <span>Charges Fiscales (Mois)</span>
            </h3>
            <Button
              size="sm"
              variant="outline"
              className="gap-1 h-7 text-xs"
              onClick={() => setEditParams(!editParams)}
            >
              <Settings2 className="size-3" /> Paramètres
            </Button>
          </div>
          {editParams && (
            <div className="bg-muted/40 border-2 border-border rounded-lg p-3 mb-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                ℹ️ L'activité (service / commerce) est désormais saisie <strong>par recette</strong>
                dans la Comptabilité — la patente est calculée automatiquement (0,75% service,
                0,55% commerce).
              </p>
              <p className="text-xs text-muted-foreground">
                Montants annuels pour {annee} (répartis sur 12 mois)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-bold uppercase">TH annuel</Label>
                  <Input type="number" value={thInput} onChange={(e) => setThInput(e.target.value)} className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase">RSL annuel</Label>
                  <Input type="number" value={rslInput} onChange={(e) => setRslInput(e.target.value)} className="h-9 mt-1" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={sauverParams} className="bg-success text-success-foreground hover:bg-success/90">
                  ✓ Enregistrer
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditParams(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}
          <Row label={`TVA nette ${(taux.tva*100).toFixed(0)}%`} value={formatMontant(calc.tva)} />
          <RowSmall label={`IS ${(taux.is*100).toFixed(0)}% (si bénéfice)`} value={formatMontant(calc.is)} />
          <RowSmall label={`IMF (max ${formatMontant(taux.imfMin)}/an ou ${(taux.imfTaux*100).toFixed(2)}% du CA annuel)`} value={formatMontant(calc.imfMensuel) + " / mois"} />
          <RowSmall label={`→ IMF annuel calculé`} value={formatMontant(calc.imfAnnuel)} />
          <Row label={`→ Impôt retenu (${calc.regime})`} value={formatMontant(calc.impot)} />
          <Row label="Patente (par activité)" value={formatMontant(calc.pat)} />
          <RowSmall label={`Service ${(taux.patenteService*100).toFixed(2)}% × ${formatMontant(calc.recService)}`} value={formatMontant(calc.patService)} />
          <RowSmall label={`Commerce ${(taux.patenteCommerce*100).toFixed(2)}% × ${formatMontant(calc.recCommerce)}`} value={formatMontant(calc.patCommerce)} />
          <Row label={`TH (1/12 de ${formatMontant(calc.thAnnuel)})`} value={formatMontant(calc.th)} />
          <Row label={`RSL (1/12 de ${formatMontant(calc.rslAnnuel)})`} value={formatMontant(calc.rsl)} />
          <Row label="TOTAL FISCAL" value={formatMontant(calc.totalFiscal)} strong />
        </div>

        <div className="card-elevated p-5">
          <h3 className="font-bold text-base mb-3 flex items-center gap-2">
            👥 <span>Charges Sociales (Mois)</span>
          </h3>
          <Row label="Masse salariale (brut)" value={formatMontant(calc.masse)} />
          <Row label={`CNSS employeur ${(taux.cnssEmp*100).toFixed(1)}%`} value={formatMontant(calc.cnss)} />
          <Row label={`AMU employeur ${(taux.amuEmp*100).toFixed(0)}%`} value={formatMontant(calc.amu)} />
          <Row label="TOTAL SOCIAL" value={formatMontant(calc.totalSocial)} strong />
        </div>
      </div>

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
