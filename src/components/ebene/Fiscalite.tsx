import { useMemo, useState, useEffect } from "react";
import { Employe, MoisData, ParamsAnnuels } from "@/types/ebene";
import { StatCard } from "./StatCard";
import { formatMontant } from "@/lib/ebene-utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";

interface Props {
  data: MoisData;
  employes: Employe[];
  annee: number;
  paramsAnnee: ParamsAnnuels;
  onUpdateParams: (patch: Partial<ParamsAnnuels>) => void;
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

export const Fiscalite = ({ data, employes, annee, paramsAnnee, onUpdateParams }: Props) => {
  const [editParams, setEditParams] = useState(false);
  const [thInput, setThInput] = useState("");
  const [rslInput, setRslInput] = useState("");

  useEffect(() => {
    setThInput(String(paramsAnnee.th ?? 30000));
    setRslInput(String(paramsAnnee.rsl ?? 52500));
  }, [paramsAnnee, annee]);

  const calc = useMemo(() => {
    const rec = data.transactions.filter((t) => t.type === "r").reduce((a, t) => a + t.m, 0);
    const dep = Math.abs(data.transactions.filter((t) => t.type === "d").reduce((a, t) => a + t.m, 0));
    const ben = Math.max(0, rec - dep);
    const is = ben * 0.27;
    const imf = Math.max(20000, rec * 0.01);
    const impot = Math.max(is, imf);
    const regime = is >= imf ? "IS" : "IMF";
    const tva = Math.max(0, rec * 0.18 - dep * 0.18);
    const pat = rec * 0.0075;
    // TH et RSL : saisis au niveau annuel, prorata mensuel
    const thAnnuel = paramsAnnee.th ?? 30000;
    const rslAnnuel = paramsAnnee.rsl ?? 52500;
    const th = thAnnuel / 12;
    const rsl = rslAnnuel / 12;

    let masse = 0;
    employes.forEach((e) => {
      masse += e.salaire + 5000;
      const primes = data.primes[e.id] || [];
      primes.forEach((p) => (masse += p.montant || 0));
    });
    const cnss = masse * 0.175;
    const amu = masse * 0.05;

    return {
      rec, dep, ben, is, imf, impot, regime, tva, pat,
      th, rsl, thAnnuel, rslAnnuel,
      masse, cnss, amu,
      totalFiscal: tva + impot + pat + th + rsl,
      totalSocial: cnss + amu,
    };
  }, [data, employes, paramsAnnee]);

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
              <Settings2 className="size-3" /> TH / RSL
            </Button>
          </div>
          {editParams && (
            <div className="bg-muted/40 border-2 border-border rounded-lg p-3 mb-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Montants annuels pour {annee} (répartis sur 12 mois)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-bold uppercase">TH annuel</Label>
                  <Input
                    type="number"
                    value={thInput}
                    onChange={(e) => setThInput(e.target.value)}
                    className="h-9 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase">RSL annuel</Label>
                  <Input
                    type="number"
                    value={rslInput}
                    onChange={(e) => setRslInput(e.target.value)}
                    className="h-9 mt-1"
                  />
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
          <Row label="TVA nette 18%" value={formatMontant(calc.tva)} />
          <RowSmall label="IS 27% (si bénéfice)" value={formatMontant(calc.is)} />
          <RowSmall label="IMF 1% (minimum)" value={formatMontant(calc.imf)} />
          <Row label={`→ Impôt retenu (${calc.regime})`} value={formatMontant(calc.impot)} />
          <Row label="Patente (0,75% CA)" value={formatMontant(calc.pat)} />
          <Row
            label={`TH (1/12 de ${formatMontant(calc.thAnnuel)})`}
            value={formatMontant(calc.th)}
          />
          <Row
            label={`RSL (1/12 de ${formatMontant(calc.rslAnnuel)})`}
            value={formatMontant(calc.rsl)}
          />
          <Row label="TOTAL FISCAL" value={formatMontant(calc.totalFiscal)} strong />
        </div>

        <div className="card-elevated p-5">
          <h3 className="font-bold text-base mb-3 flex items-center gap-2">
            👥 <span>Charges Sociales (Mois)</span>
          </h3>
          <Row label="Masse salariale (brut)" value={formatMontant(calc.masse)} />
          <Row label="CNSS employeur 17,5%" value={formatMontant(calc.cnss)} />
          <Row label="AMU employeur 5%" value={formatMontant(calc.amu)} />
          <Row label="TOTAL SOCIAL" value={formatMontant(calc.totalSocial)} strong />
        </div>
      </div>
    </div>
  );
};