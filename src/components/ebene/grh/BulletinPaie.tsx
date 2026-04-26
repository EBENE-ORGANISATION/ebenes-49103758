import { Employe, MoisData, MOIS_NOMS, Prime } from "@/types/ebene";
import {
  formatMontant,
  tauxHoraire,
  tauxAnciennete,
  calculerAnciennete,
  calculerIRPP,
  HS_TAUX,
  deductionCongesSansSolde,
} from "@/lib/ebene-utils";
import { Button } from "@/components/ui/button";
import { Printer, X, FileDown, FileText } from "lucide-react";
import { exportElementToPDF, exportElementToWord } from "@/lib/exportDocs";

interface Props {
  employe: Employe;
  data: MoisData;
  annee: number;
  mois: number;
  onClose: () => void;
}

export interface CalculPaie {
  base: number;
  sursalaire: number;
  primeAnciennete: number;
  hsMontant: number;
  primesDiverses: number;
  indemnites: number;
  brut: number;
  imposable: number;
  irpp: number;
  cnssSal: number;
  amuSal: number;
  retenuesDiverses: number;
  joursSansSolde: number;
  deductionSansSolde: number;
  totalRetenues: number;
  net: number;
  // patronal
  cnssEmp: number;
  amuEmp: number;
  totalPatronal: number;
  coutEmployeur: number;
  // détail
  primes: Prime[];
  anciennete: number;
  tauxAnc: number;
  th: number;
}

export const calculerPaie = (employe: Employe, data: MoisData): CalculPaie => {
  const base = employe.salaire || 0;
  const sursalaire = employe.sursalaire || 0;
  const th = tauxHoraire(base, sursalaire);

  const anciennete = calculerAnciennete(employe.dateEmbauche);
  const tauxAnc = tauxAnciennete(anciennete);
  const primeAnciennete = base * tauxAnc;

  const hs = (data.heuresSup || {})[employe.id] || {
    jourSemaine: 0,
    jourSup: 0,
    dimancheFerie: 0,
    nuitSemaine: 0,
    nuitDimancheFerie: 0,
  };
  const hsMontant =
    hs.jourSemaine * th * HS_TAUX.jourSemaine +
    hs.jourSup * th * HS_TAUX.jourSup +
    hs.dimancheFerie * th * HS_TAUX.dimancheFerie +
    hs.nuitSemaine * th * HS_TAUX.nuitSemaine +
    hs.nuitDimancheFerie * th * HS_TAUX.nuitDimancheFerie;

  const primes = (data.primes || {})[employe.id] || [];
  const primesDiverses = primes.reduce((a, p) => a + p.montant, 0);

  const indemnites =
    (employe.indemniteTransport || 0) +
    (employe.indemniteLogement || 0) +
    (employe.indemniteFonction || 0);

  const brut =
    base +
    sursalaire +
    primeAnciennete +
    hsMontant +
    primesDiverses +
    indemnites;

  // Base imposable IRPP : on exclut indemnité transport (souvent exonérée)
  const imposable = brut - (employe.indemniteTransport || 0);

  // CNSS salarié 4%, AMU salarié 5% (taux réglementaires Togo)
  const cnssSal = (base + sursalaire + primeAnciennete + hsMontant) * 0.04;
  const amuSal = (base + sursalaire) * 0.05;

  const irpp = calculerIRPP(imposable - cnssSal, employe.situation, employe.enfants);

  const retenuesDiverses = (data.retenues || {})[employe.id] || 0;

  // Congés sans solde : somme des jours d'absences de type "sans_solde" du mois
  const joursSansSolde = (data.absences || [])
    .filter((a) => a.employeId === employe.id && a.type === "sans_solde")
    .reduce((acc, a) => acc + (a.jours || 0), 0);
  const deductionSansSolde = deductionCongesSansSolde(base, sursalaire, joursSansSolde);

  const totalRetenues = irpp + cnssSal + amuSal + retenuesDiverses + deductionSansSolde;
  const net = brut - totalRetenues;

  // Charges patronales
  const cnssEmp = (base + sursalaire + primeAnciennete + hsMontant) * 0.175;
  const amuEmp = (base + sursalaire) * 0.05;
  const totalPatronal = cnssEmp + amuEmp;
  const coutEmployeur = brut + totalPatronal;

  return {
    base,
    sursalaire,
    primeAnciennete,
    hsMontant,
    primesDiverses,
    primeSalissure,
    indemnites,
    brut,
    imposable,
    irpp,
    cnssSal,
    amuSal,
    retenuesDiverses,
    joursSansSolde,
    deductionSansSolde,
    totalRetenues,
    net,
    cnssEmp,
    amuEmp,
    totalPatronal,
    coutEmployeur,
    primes,
    anciennete,
    tauxAnc,
    th,
  };
};

export const BulletinPaie = ({ employe, data, annee, mois, onClose }: Props) => {
  const c = calculerPaie(employe, data);
  const filename = `Bulletin_${employe.nom.replace(/\s+/g, "_")}_${MOIS_NOMS[mois - 1]}_${annee}`;
  const exportPDF = async () => {
    const el = document.getElementById("print-area");
    if (el) await exportElementToPDF(el, filename);
  };
  const exportWord = async () => {
    const el = document.getElementById("print-area");
    if (el) await exportElementToWord(el, filename);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box w-full max-w-3xl">
        <div className="flex items-center justify-between mb-4 no-print">
          <h2 className="text-xl font-bold">Bulletin de paie</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5">
              <Printer className="size-4" /> Imprimer
            </Button>
            <Button size="sm" variant="outline" onClick={exportPDF} className="gap-1.5">
              <FileDown className="size-4" /> PDF
            </Button>
            <Button size="sm" variant="outline" onClick={exportWord} className="gap-1.5">
              <FileText className="size-4" /> Word
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div id="print-area" className="bg-white text-foreground p-6 border-2 border-border rounded-lg">
          <div className="text-center border-b-2 border-foreground pb-3 mb-4">
            <p className="font-bold text-lg">EBENE SERVICES</p>
            <p className="text-xs text-muted-foreground">NIF : 1 002 088 759</p>
            <h3 className="text-base font-bold mt-2">
              BULLETIN DE PAIE — {MOIS_NOMS[mois - 1]} {annee}
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <p><strong>Nom :</strong> {employe.nom}</p>
              <p><strong>Matricule :</strong> {employe.matricule || "-"}</p>
              <p><strong>Poste :</strong> {employe.poste}</p>
              <p><strong>Catégorie :</strong> {employe.categorie || "-"} - Échelon {employe.echelon || 1}</p>
            </div>
            <div>
              <p><strong>N° CNSS :</strong> {employe.numCnss || "-"}</p>
              <p><strong>Date embauche :</strong> {employe.dateEmbauche || "-"}</p>
              <p><strong>Ancienneté :</strong> {c.anciennete.toFixed(1)} ans</p>
              <p><strong>Situation :</strong> {employe.situation === "marie" ? "Marié(e)" : "Célibataire"} - {employe.enfants} enf.</p>
            </div>
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted">
                <th className="text-left p-2 border border-border">Désignation</th>
                <th className="text-right p-2 border border-border w-32">Gain</th>
                <th className="text-right p-2 border border-border w-32">Retenue</th>
              </tr>
            </thead>
            <tbody>
              <Line label="Salaire de base" gain={c.base} />
              {c.sursalaire > 0 && <Line label="Sursalaire" gain={c.sursalaire} />}
              {c.primeAnciennete > 0 && (
                <Line label={`Prime d'ancienneté (${(c.tauxAnc * 100).toFixed(0)}%)`} gain={c.primeAnciennete} />
              )}
              {c.hsMontant > 0 && <Line label="Heures supplémentaires" gain={c.hsMontant} />}
              {c.primes.map((p) => <Line key={p.id} label={`Prime : ${p.libelle}`} gain={p.montant} />)}
              {c.primeSalissure > 0 && <Line label="Prime salissure" gain={c.primeSalissure} />}
              {(employe.indemniteTransport || 0) > 0 && (
                <Line label="Indemnité transport" gain={employe.indemniteTransport!} />
              )}
              {(employe.indemniteLogement || 0) > 0 && (
                <Line label="Indemnité logement" gain={employe.indemniteLogement!} />
              )}
              {(employe.indemniteFonction || 0) > 0 && (
                <Line label="Indemnité fonction" gain={employe.indemniteFonction!} />
              )}
              <tr className="font-bold bg-muted/50">
                <td className="p-2 border border-border">SALAIRE BRUT</td>
                <td className="p-2 border border-border text-right amount">{formatMontant(c.brut)}</td>
                <td className="p-2 border border-border" />
              </tr>
              <Line label="CNSS salarié (4%)" retenue={c.cnssSal} />
              <Line label="AMU salarié (5%)" retenue={c.amuSal} />
              <Line label="IRPP" retenue={c.irpp} />
              {c.deductionSansSolde > 0 && (
                <Line label={`Congés sans solde (${c.joursSansSolde} j)`} retenue={c.deductionSansSolde} />
              )}
              {c.retenuesDiverses > 0 && <Line label="Retenues diverses" retenue={c.retenuesDiverses} />}
              <tr className="font-bold bg-muted/50">
                <td className="p-2 border border-border">TOTAL RETENUES</td>
                <td className="p-2 border border-border" />
                <td className="p-2 border border-border text-right amount">{formatMontant(c.totalRetenues)}</td>
              </tr>
              <tr className="font-bold text-base bg-success/15">
                <td className="p-2 border border-border">NET À PAYER</td>
                <td className="p-2 border border-border text-right amount" colSpan={2}>
                  {formatMontant(c.net)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mt-4 text-xs text-muted-foreground border-t border-border pt-3">
            <p><strong>Charges patronales</strong> — CNSS employeur (17,5%) : {formatMontant(c.cnssEmp)} • AMU employeur (5%) : {formatMontant(c.amuEmp)} • <strong>Coût total employeur : {formatMontant(c.coutEmployeur)}</strong></p>
            <p className="mt-2 italic">Bulletin établi conformément au Code du travail togolais et à la Convention collective interprofessionnelle.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Line = ({ label, gain, retenue }: { label: string; gain?: number; retenue?: number }) => (
  <tr>
    <td className="p-2 border border-border">{label}</td>
    <td className="p-2 border border-border text-right amount">
      {gain !== undefined ? formatMontant(gain) : ""}
    </td>
    <td className="p-2 border border-border text-right amount">
      {retenue !== undefined ? formatMontant(retenue) : ""}
    </td>
  </tr>
);