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
import { Trans, useTranslation } from "react-i18next";

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

  // Heures sup : seules les HS validées (ou héritées sans statut) impactent la paie.
  const hsBrut = (data.heuresSup || {})[employe.id];
  const hsValide =
    hsBrut && (hsBrut.statutValidation === undefined || hsBrut.statutValidation === "valide");
  const hs = hsValide
    ? hsBrut!
    : { jourSemaine: 0, jourSup: 0, dimancheFerie: 0, nuitSemaine: 0, nuitDimancheFerie: 0 };
  const hsMontant =
    hs.jourSemaine * th * HS_TAUX.jourSemaine +
    hs.jourSup * th * HS_TAUX.jourSup +
    hs.dimancheFerie * th * HS_TAUX.dimancheFerie +
    hs.nuitSemaine * th * HS_TAUX.nuitSemaine +
    hs.nuitDimancheFerie * th * HS_TAUX.nuitDimancheFerie;

  // Primes : seules les primes validées (ou héritées sans statut) sont payées.
  const primes = ((data.primes || {})[employe.id] || []).filter(
    (p) => p.statutValidation === undefined || p.statutValidation === "valide"
  );
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
    .filter(
      (a) =>
        a.employeId === employe.id &&
        a.type === "sans_solde" &&
        (a.statutValidation === undefined || a.statutValidation === "valide")
    )
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
  const { t } = useTranslation();
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
          <h2 className="text-xl font-bold">{t("grh_bulletin.title")}</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5">
              <Printer className="size-4" /> {t("grh_bulletin.print")}
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
            <p className="font-bold text-lg">{t("grh_bulletin.company")}</p>
            <p className="text-xs text-muted-foreground">{t("grh_bulletin.nif")}</p>
            <h3 className="text-base font-bold mt-2">
              {t("grh_bulletin.header", { mois: MOIS_NOMS[mois - 1], annee })}
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <p><strong>{t("grh_bulletin.name")}</strong> {employe.nom}</p>
              <p><strong>{t("grh_bulletin.matricule")}</strong> {employe.matricule || "-"}</p>
              <p><strong>{t("grh_bulletin.poste")}</strong> {employe.poste}</p>
              <p><strong>{t("grh_bulletin.category")}</strong> {employe.categorie || "-"} - {t("grh_bulletin.echelon")} {employe.echelon || 1}</p>
            </div>
            <div>
              <p><strong>{t("grh_bulletin.cnss")}</strong> {employe.numCnss || "-"}</p>
              <p><strong>{t("grh_bulletin.hire_date")}</strong> {employe.dateEmbauche || "-"}</p>
              <p><strong>{t("grh_bulletin.seniority")}</strong> {t("grh_bulletin.seniority_years", { val: c.anciennete.toFixed(1) })}</p>
              <p><strong>{t("grh_bulletin.situation")}</strong> {employe.situation === "marie" ? t("grh_bulletin.married") : t("grh_bulletin.single")} - {t("grh_bulletin.children_short", { n: employe.enfants })}</p>
            </div>
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted">
                <th className="text-left p-2 border border-border">{t("grh_bulletin.designation")}</th>
                <th className="text-right p-2 border border-border w-32">{t("grh_bulletin.gain")}</th>
                <th className="text-right p-2 border border-border w-32">{t("grh_bulletin.retenue")}</th>
              </tr>
            </thead>
            <tbody>
              <Line label={t("grh_bulletin.base")} gain={c.base} />
              {c.sursalaire > 0 && <Line label={t("grh_bulletin.sursalaire")} gain={c.sursalaire} />}
              {c.primeAnciennete > 0 && (
                <Line label={t("grh_bulletin.prime_anc", { pct: (c.tauxAnc * 100).toFixed(0) })} gain={c.primeAnciennete} />
              )}
              {c.hsMontant > 0 && <Line label={t("grh_bulletin.hs")} gain={c.hsMontant} />}
              {c.primes.map((p) => <Line key={p.id} label={t("grh_bulletin.prime", { libelle: p.libelle })} gain={p.montant} />)}
              {(employe.indemniteTransport || 0) > 0 && (
                <Line label={t("grh_bulletin.indem_transport")} gain={employe.indemniteTransport!} />
              )}
              {(employe.indemniteLogement || 0) > 0 && (
                <Line label={t("grh_bulletin.indem_logement")} gain={employe.indemniteLogement!} />
              )}
              {(employe.indemniteFonction || 0) > 0 && (
                <Line label={t("grh_bulletin.indem_fonction")} gain={employe.indemniteFonction!} />
              )}
              <tr className="font-bold bg-muted/50">
                <td className="p-2 border border-border">{t("grh_bulletin.brut")}</td>
                <td className="p-2 border border-border text-right amount">{formatMontant(c.brut)}</td>
                <td className="p-2 border border-border" />
              </tr>
              <Line label={t("grh_bulletin.cnss_sal")} retenue={c.cnssSal} />
              <Line label={t("grh_bulletin.amu_sal")} retenue={c.amuSal} />
              <Line label={t("grh_bulletin.irpp")} retenue={c.irpp} />
              {c.deductionSansSolde > 0 && (
                <Line label={t("grh_bulletin.sans_solde", { j: c.joursSansSolde })} retenue={c.deductionSansSolde} />
              )}
              {c.retenuesDiverses > 0 && <Line label={t("grh_bulletin.retenues_div")} retenue={c.retenuesDiverses} />}
              <tr className="font-bold bg-muted/50">
                <td className="p-2 border border-border">{t("grh_bulletin.total_retenues")}</td>
                <td className="p-2 border border-border" />
                <td className="p-2 border border-border text-right amount">{formatMontant(c.totalRetenues)}</td>
              </tr>
              <tr className="font-bold text-base bg-success/15">
                <td className="p-2 border border-border">{t("grh_bulletin.net")}</td>
                <td className="p-2 border border-border text-right amount" colSpan={2}>
                  {formatMontant(c.net)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mt-4 text-xs text-muted-foreground border-t border-border pt-3">
            <p>
              <Trans
                i18nKey="grh_bulletin.charges"
                values={{ cnss: formatMontant(c.cnssEmp), amu: formatMontant(c.amuEmp), cout: formatMontant(c.coutEmployeur) }}
                components={[<strong key="0" />, <span key="1" />, <strong key="2" />]}
              />
            </p>
            <p className="mt-2 italic">{t("grh_bulletin.footer")}</p>
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