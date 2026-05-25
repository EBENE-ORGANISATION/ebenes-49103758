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

  // ── Base imposable IRPP ──────────────────────────────────────────────────
  // Selon CGI Togo : le RB inclut TOUTES les rémunérations y compris
  // l'indemnité de transport. On passe donc `brut` complet à calculerIRPP.
  const imposable = brut; // historique — conservé pour l'affichage bulletin

  // CNSS salarié 4%, AMU salarié 5% (taux réglementaires Togo)
  // Ces montants s'affichent séparément sur le bulletin ; calculerIRPP
  // refait le calcul en interne à 9 % sur la base imposable.
  const cnssSal = (base + sursalaire + primeAnciennete + hsMontant) * 0.04;
  const amuSal = (base + sursalaire) * 0.05;

  // Déductions fiscales facultatives (VI, VII, VIII) tirées du profil employé
  const interetPret = employe.interetPretImmobilier ?? 0;
  const assurVie    = employe.assuranceVie ?? 0;
  const retraiteC   = employe.retraiteComplementaire ?? 0;

  // calculerIRPP applique la méthode CGI complète :
  // RB complet → CNSS 9 % → forfait 28 % → CF → RNT → VI/VII/VIII → RNI → barème
  const irpp = calculerIRPP(
    brut,
    employe.situation,
    employe.enfants,
    interetPret,
    assurVie,
    retraiteC,
  );

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

        <div id="print-area" className="bg-white text-gray-900 p-6 rounded-lg text-sm">
          {/* En-tête société + titre bulletin */}
          <div className="flex items-start justify-between border-b-2 border-gray-800 pb-4 mb-4">
            <div>
              <p className="font-bold text-base uppercase tracking-wide">{t("grh_bulletin.company")}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t("grh_bulletin.nif")}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-base uppercase">BULLETIN DE PAIE</p>
              <p className="text-sm font-semibold text-gray-600">
                {MOIS_NOMS[mois - 1].toUpperCase()} {annee}
              </p>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div className="space-y-1">
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">{t("grh_bulletin.name")} :</span>
                  <span className="font-bold">{employe.nom}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">{t("grh_bulletin.matricule")} :</span>
                  <span className="font-mono">{employe.matricule || "—"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">{t("grh_bulletin.poste")} :</span>
                  <span>{employe.poste}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">{t("grh_bulletin.category")} :</span>
                  <span>{employe.categorie || "—"} — Éch. {employe.echelon || 1}</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">{t("grh_bulletin.cnss")} :</span>
                  <span className="font-mono">{employe.numCnss || "—"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">{t("grh_bulletin.hire_date")} :</span>
                  <span>{employe.dateEmbauche || "—"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">{t("grh_bulletin.seniority")} :</span>
                  <span>{c.anciennete.toFixed(1)} ans ({(c.tauxAnc * 100).toFixed(0)}%)</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">{t("grh_bulletin.situation")} :</span>
                  <span>{employe.situation === "marie" ? t("grh_bulletin.married") : t("grh_bulletin.single")} — {employe.enfants} enf.</span>
                </div>
              </div>
            </div>
          </div>

          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wide">{t("grh_bulletin.designation")}</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wide w-32">{t("grh_bulletin.gain")}</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wide w-32">{t("grh_bulletin.retenue")}</th>
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
              <tr className="font-bold bg-gray-100 border-t-2 border-gray-400">
                <td className="px-3 py-2 border border-gray-300 uppercase text-xs tracking-wide">{t("grh_bulletin.brut")}</td>
                <td className="px-3 py-2 border border-gray-300 text-right font-mono">{formatMontant(c.brut)}</td>
                <td className="px-3 py-2 border border-gray-300" />
              </tr>
              <Line label={t("grh_bulletin.cnss_sal")} retenue={c.cnssSal} />
              <Line label={t("grh_bulletin.amu_sal")} retenue={c.amuSal} />
              <Line label={t("grh_bulletin.irpp")} retenue={c.irpp} />
              {c.deductionSansSolde > 0 && (
                <Line label={t("grh_bulletin.sans_solde", { j: c.joursSansSolde })} retenue={c.deductionSansSolde} />
              )}
              {c.retenuesDiverses > 0 && <Line label={t("grh_bulletin.retenues_div")} retenue={c.retenuesDiverses} />}
              <tr className="font-bold bg-gray-100 border-t-2 border-gray-400">
                <td className="px-3 py-2 border border-gray-300 uppercase text-xs tracking-wide">{t("grh_bulletin.total_retenues")}</td>
                <td className="px-3 py-2 border border-gray-300" />
                <td className="px-3 py-2 border border-gray-300 text-right font-mono">{formatMontant(c.totalRetenues)}</td>
              </tr>
              <tr className="font-bold bg-green-50 border-t-4 border-green-600">
                <td className="px-3 py-2.5 border border-gray-300 text-sm uppercase tracking-wide text-green-800">
                  {t("grh_bulletin.net")}
                </td>
                <td className="px-3 py-2.5 border border-gray-300 text-right text-lg font-bold text-green-800 font-mono" colSpan={2}>
                  {formatMontant(c.net)} FCFA
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mt-4 border-t-2 border-gray-300 pt-3">
            <div className="bg-gray-50 border border-gray-200 rounded p-2.5 text-xs text-gray-600 space-y-1">
              <p className="font-semibold text-gray-700">Charges patronales :</p>
              <div className="grid grid-cols-3 gap-2">
                <span>CNSS Patronal (17,5%) : <span className="font-mono font-semibold">{formatMontant(c.cnssEmp)}</span></span>
                <span>AMU Patronal (5%) : <span className="font-mono font-semibold">{formatMontant(c.amuEmp)}</span></span>
                <span className="font-bold">Coût employeur total : <span className="font-mono">{formatMontant(c.coutEmployeur)}</span></span>
              </div>
            </div>
            <div className="mt-3 flex justify-between items-end">
              <p className="text-xs text-gray-400 italic">{t("grh_bulletin.footer")}</p>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-6">Signature et cachet de l'employeur</p>
                <div className="border-t border-gray-400 w-40 mx-auto" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Line = ({ label, gain, retenue }: { label: string; gain?: number; retenue?: number }) => (
  <tr className="border-b border-gray-200 hover:bg-gray-50">
    <td className="px-3 py-1.5 border-x border-gray-200">{label}</td>
    <td className="px-3 py-1.5 border-r border-gray-200 text-right font-mono tabular-nums text-blue-700">
      {gain !== undefined && gain > 0 ? formatMontant(gain) : ""}
    </td>
    <td className="px-3 py-1.5 border-r border-gray-200 text-right font-mono tabular-nums text-red-600">
      {retenue !== undefined && retenue > 0 ? formatMontant(retenue) : ""}
    </td>
  </tr>
);