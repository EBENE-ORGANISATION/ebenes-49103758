import { useMemo, useState } from "react";
import { Employe } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatMontant,
  calculerAnciennete,
  dureePreavis,
  indemnitePreavis,
  indemniteLicenciement,
  indemniteRetraite,
  indemniteConges,
} from "@/lib/ebene-utils";
import { Calculator, FileDown, FileText } from "lucide-react";
import { exportElementToPDF, exportElementToWord } from "@/lib/exportDocs";
import { Trans, useTranslation } from "react-i18next";

interface Props {
  employes: Employe[];
}

type Motif = "licenciement_simple" | "licenciement_grave" | "licenciement_lourde" | "demission" | "retraite" | "fin_cdd";

export const IndemnitesCalculator = ({ employes }: Props) => {
  const { t } = useTranslation();
  const MOTIF_LABELS: Record<Motif, string> = {
    licenciement_simple: t("grh_indemnites.motif_lic_simple"),
    licenciement_grave: t("grh_indemnites.motif_lic_grave"),
    licenciement_lourde: t("grh_indemnites.motif_lic_lourde"),
    demission: t("grh_indemnites.motif_demission"),
    retraite: t("grh_indemnites.motif_retraite"),
    fin_cdd: t("grh_indemnites.motif_fin_cdd"),
  };
  const [employeId, setEmployeId] = useState("");
  const [motif, setMotif] = useState<Motif>("licenciement_simple");
  const [dateRupture, setDateRupture] = useState(new Date().toISOString().split("T")[0]);
  const [salaireMoyenInput, setSalaireMoyenInput] = useState("");
  const [soldeConges, setSoldeConges] = useState("");

  const employe = useMemo(
    () => employes.find((e) => e.id === parseInt(employeId, 10)) || null,
    [employes, employeId]
  );

  const calcul = useMemo(() => {
    if (!employe) return null;
    const anc = calculerAnciennete(employe.dateEmbauche, new Date(dateRupture));
    const salaireMoyen =
      parseFloat(salaireMoyenInput) ||
      (employe.salaire || 0) + (employe.sursalaire || 0);
    const solde = parseFloat(soldeConges) || employe.soldeConges || 0;

    const fauteLourde = motif === "licenciement_lourde";
    const fauteGrave = motif === "licenciement_grave";

    // Préavis : pas dû en cas de faute grave/lourde
    const droitPreavis = !fauteLourde && !fauteGrave && motif !== "fin_cdd";
    const joursPreavis = droitPreavis ? dureePreavis(employe.categorie, anc) : 0;
    const montantPreavis = droitPreavis ? indemnitePreavis(employe, anc) : 0;

    // Indemnité de licenciement : seulement licenciement (sauf faute lourde)
    let indLic = 0;
    if (motif === "licenciement_simple" || motif === "licenciement_grave") {
      indLic = indemniteLicenciement(salaireMoyen, anc, fauteLourde);
    }

    // Indemnité de retraite : 75% de l'indemnité de licenciement (sans faute)
    const indRet = motif === "retraite" ? indemniteRetraite(salaireMoyen, anc) : 0;

    // Congés payés toujours dûs
    const indConges = indemniteConges(employe, solde);

    // Gratification de fin de CDD (5% du total brut, pratique courante TG)
    const gratifCDD = motif === "fin_cdd" ? salaireMoyen * 12 * anc * 0.05 : 0;

    const total = montantPreavis + indLic + indRet + indConges + gratifCDD;

    return {
      anciennete: anc,
      salaireMoyen,
      solde,
      droitPreavis,
      joursPreavis,
      montantPreavis,
      indLic,
      indRet,
      indConges,
      gratifCDD,
      fauteLourde,
      fauteGrave,
      total,
    };
  }, [employe, motif, dateRupture, salaireMoyenInput, soldeConges]);

  const exportPDF = async () => {
    const el = document.getElementById("indemnites-print");
    if (!el || !employe) return;
    await exportElementToPDF(el, `Indemnites_${employe.nom.replace(/\s+/g, "_")}_${dateRupture}`);
  };
  const exportWord = async () => {
    const el = document.getElementById("indemnites-print");
    if (!el || !employe) return;
    await exportElementToWord(el, `Indemnites_${employe.nom.replace(/\s+/g, "_")}_${dateRupture}`);
  };

  return (
    <div className="space-y-4">
      <div className="card-elevated p-4 bg-info/5 border-l-4 border-l-info">
        <p className="text-sm flex items-start gap-2">
          <Calculator className="size-4 text-info shrink-0 mt-0.5" />
          <span>
            <Trans i18nKey="grh_indemnites.info" components={[<span key="0" />, <strong key="1" />, <span key="2" />, <strong key="3" />]} />
          </span>
        </p>
      </div>

      <div className="card-elevated p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>{t("grh_indemnites.employee")}</Label>
            <Select value={employeId} onValueChange={setEmployeId}>
              <SelectTrigger>
                <SelectValue placeholder={t("grh_indemnites.employee_ph")} />
              </SelectTrigger>
              <SelectContent>
                {employes.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.nom} {e.matricule ? `(${e.matricule})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("grh_indemnites.motif")}</Label>
            <Select value={motif} onValueChange={(v) => setMotif(v as Motif)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MOTIF_LABELS).map(([k, lbl]) => (
                  <SelectItem key={k} value={k}>
                    {lbl}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("grh_indemnites.rupture_date")}</Label>
            <Input
              type="date"
              value={dateRupture}
              onChange={(e) => setDateRupture(e.target.value)}
            />
          </div>
          <div>
            <Label>{t("grh_indemnites.avg_salary")}</Label>
            <Input
              type="number"
              placeholder={
                employe
                  ? String((employe.salaire || 0) + (employe.sursalaire || 0))
                  : t("grh_indemnites.avg_salary_ph")
              }
              value={salaireMoyenInput}
              onChange={(e) => setSalaireMoyenInput(e.target.value)}
            />
          </div>
          <div>
            <Label>{t("grh_indemnites.leave_balance")}</Label>
            <Input
              type="number"
              step="0.5"
              placeholder={employe ? String(employe.soldeConges || 0) : "0"}
              value={soldeConges}
              onChange={(e) => setSoldeConges(e.target.value)}
            />
          </div>
        </div>
      </div>

      {employe && calcul && (
        <>
          <div className="flex flex-wrap gap-2 justify-end no-print">
            <Button size="sm" variant="outline" onClick={exportPDF} className="gap-1.5">
              <FileDown className="size-4" /> PDF
            </Button>
            <Button size="sm" variant="outline" onClick={exportWord} className="gap-1.5">
              <FileText className="size-4" /> Word
            </Button>
          </div>

          <div id="indemnites-print" className="card-elevated p-6 bg-card">
            <div className="text-center border-b-2 border-foreground pb-3 mb-4">
              <p className="font-bold text-lg">{t("grh_indemnites.company")}</p>
              <h3 className="text-base font-bold mt-2">
                {t("grh_indemnites.title_decompte", { nom: employe.nom })}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("grh_indemnites.sub_decompte", { motif: MOTIF_LABELS[motif], date: dateRupture })}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <p><strong>{t("grh_indemnites.matricule")}</strong> {employe.matricule || "-"}</p>
              <p><strong>{t("grh_indemnites.poste")}</strong> {employe.poste}</p>
              <p><strong>{t("grh_indemnites.hire_date")}</strong> {employe.dateEmbauche || "-"}</p>
              <p><strong>{t("grh_indemnites.seniority")}</strong> {t("grh_indemnites.seniority_value", { value: calcul.anciennete.toFixed(2) })}</p>
              <p><strong>{t("grh_indemnites.category")}</strong> {employe.categorie || "-"}</p>
              <p><strong>{t("grh_indemnites.avg_salary_label")}</strong> {formatMontant(calcul.salaireMoyen)}</p>
            </div>

            <table className="w-full text-sm border-collapse mb-4">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left p-2 border border-border">{t("grh_indemnites.th_indemnity")}</th>
                  <th className="text-left p-2 border border-border">{t("grh_indemnites.th_detail")}</th>
                  <th className="text-right p-2 border border-border w-32">{t("grh_indemnites.th_amount")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2 border border-border">{t("grh_indemnites.preavis")}</td>
                  <td className="p-2 border border-border text-xs">
                    {calcul.droitPreavis
                      ? t("grh_indemnites.preavis_days", { days: calcul.joursPreavis })
                      : calcul.fauteLourde || calcul.fauteGrave
                      ? t("grh_indemnites.preavis_fault")
                      : t("grh_indemnites.not_applicable")}
                  </td>
                  <td className="p-2 border border-border text-right amount">
                    {formatMontant(calcul.montantPreavis)}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 border border-border">{t("grh_indemnites.ind_lic")}</td>
                  <td className="p-2 border border-border text-xs">
                    {calcul.indLic > 0
                      ? t("grh_indemnites.ind_lic_detail")
                      : calcul.fauteLourde
                      ? t("grh_indemnites.ind_lic_lourde")
                      : t("grh_indemnites.not_applicable")}
                  </td>
                  <td className="p-2 border border-border text-right amount">
                    {formatMontant(calcul.indLic)}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 border border-border">{t("grh_indemnites.ind_ret")}</td>
                  <td className="p-2 border border-border text-xs">
                    {motif === "retraite" ? t("grh_indemnites.ind_ret_detail") : t("grh_indemnites.not_applicable")}
                  </td>
                  <td className="p-2 border border-border text-right amount">
                    {formatMontant(calcul.indRet)}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 border border-border">{t("grh_indemnites.ind_conges")}</td>
                  <td className="p-2 border border-border text-xs">
                    {t("grh_indemnites.ind_conges_detail", { days: calcul.solde })}
                  </td>
                  <td className="p-2 border border-border text-right amount">
                    {formatMontant(calcul.indConges)}
                  </td>
                </tr>
                {calcul.gratifCDD > 0 && (
                  <tr>
                    <td className="p-2 border border-border">{t("grh_indemnites.grat_cdd")}</td>
                    <td className="p-2 border border-border text-xs">{t("grh_indemnites.grat_cdd_detail")}</td>
                    <td className="p-2 border border-border text-right amount">
                      {formatMontant(calcul.gratifCDD)}
                    </td>
                  </tr>
                )}
                <tr className="font-bold text-base bg-success/15">
                  <td className="p-2 border border-border" colSpan={2}>
                    {t("grh_indemnites.total")}
                  </td>
                  <td className="p-2 border border-border text-right amount">
                    {formatMontant(calcul.total)}
                  </td>
                </tr>
              </tbody>
            </table>

            <p className="text-xs italic text-muted-foreground border-t border-border pt-3">
              {t("grh_indemnites.footer")}
            </p>
          </div>
        </>
      )}
    </div>
  );
};
