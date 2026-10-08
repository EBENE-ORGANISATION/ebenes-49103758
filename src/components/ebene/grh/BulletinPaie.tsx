import { Employe, MoisData, MOIS_NOMS } from "@/types/ebene";
import { formatMontant, tauxPourMois } from "@/lib/ebene-utils";
import { calculerPaie, pctTaux } from "@/lib/paie";
import { useTauxHistoriqueCourant } from "@/hooks/data/useTauxHistorique";
import { Button } from "@/components/ui/button";
import { Printer, X, FileDown, FileText } from "lucide-react";
import { exportElementToPDF, exportElementToWord } from "@/lib/exportDocs";
import { printElementById } from "@/lib/print";
import { Trans, useTranslation } from "react-i18next";
import { useEmployeur } from "@/hooks/useEmployeur";

interface Props {
  employe: Employe;
  data: MoisData;
  annee: number;
  mois: number;
  onClose: () => void;
}

// Calcul déplacé dans @/lib/paie (module pur) ; réexporté pour les appelants existants.
export { calculerPaie, type CalculPaie } from "@/lib/paie";

export const BulletinPaie = ({ employe, data, annee, mois, onClose }: Props) => {
  const { t } = useTranslation();
  const employeur = useEmployeur();
  const historique = useTauxHistoriqueCourant();
  const c = calculerPaie(employe, data, annee, mois, tauxPourMois(historique, annee, mois));
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
            <Button size="sm" variant="outline" onClick={() => printElementById("print-area", `Bulletin ${employe.nom}`)} className="gap-1.5">
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
              <p className="font-bold text-base uppercase tracking-wide">{employeur.nom}</p>
              {employeur.nif && <p className="text-xs text-gray-500 mt-0.5">{t("grh_bulletin.nif", { nif: employeur.nif })}</p>}
              {employeur.adresse && <p className="text-xs text-gray-500">{employeur.adresse}</p>}
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
              <Line label={t("grh_bulletin.cnss_sal", { pct: pctTaux(c.taux.cnssSal) })} retenue={c.cnssSal} />
              <Line label={t("grh_bulletin.amu_sal", { pct: pctTaux(c.taux.amuSal) })} retenue={c.amuSal} />
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
                  {formatMontant(c.net)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mt-4 border-t-2 border-gray-300 pt-3">
            <div className="bg-gray-50 border border-gray-200 rounded p-2.5 text-xs text-gray-600 space-y-1">
              <p className="font-semibold text-gray-700">Charges patronales :</p>
              <div className="grid grid-cols-3 gap-2">
                <span>CNSS Patronal ({pctTaux(c.taux.cnssEmp)}%) : <span className="font-mono font-semibold">{formatMontant(c.cnssEmp)}</span></span>
                <span>AMU Patronal ({pctTaux(c.taux.amuEmp)}%) : <span className="font-mono font-semibold">{formatMontant(c.amuEmp)}</span></span>
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