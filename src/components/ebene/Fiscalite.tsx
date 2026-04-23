import { useMemo } from "react";
import { Employe, MoisData } from "@/types/ebene";
import { StatCard } from "./StatCard";
import { formatMontant } from "@/lib/ebene-utils";

interface Props {
  data: MoisData;
  employes: Employe[];
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

export const Fiscalite = ({ data, employes }: Props) => {
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
    const th = 30000;
    const rsl = 52500;

    let masse = 0;
    employes.forEach((e) => {
      masse += e.salaire + 5000;
      const primes = data.primes[e.id] || [];
      primes.forEach((p) => (masse += p.montant || 0));
    });
    const cnss = masse * 0.175;
    const amu = masse * 0.05;

    return {
      rec, dep, ben, is, imf, impot, regime, tva, pat, th, rsl,
      masse, cnss, amu,
      totalFiscal: tva + impot + pat + th + rsl,
      totalSocial: cnss + amu,
    };
  }, [data, employes]);

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
          <h3 className="font-bold text-base mb-3 flex items-center gap-2">
            💼 <span>Charges Fiscales (Mois)</span>
          </h3>
          <Row label="TVA nette 18%" value={formatMontant(calc.tva)} />
          <RowSmall label="IS 27% (si bénéfice)" value={formatMontant(calc.is)} />
          <RowSmall label="IMF 1% (minimum)" value={formatMontant(calc.imf)} />
          <Row label={`→ Impôt retenu (${calc.regime})`} value={formatMontant(calc.impot)} />
          <Row label="Patente (0,75% CA)" value={formatMontant(calc.pat)} />
          <Row label="TH (forfait)" value={formatMontant(calc.th)} />
          <Row label="RSL (forfait)" value={formatMontant(calc.rsl)} />
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