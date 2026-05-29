import { Employe, MOIS_NOMS } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { formatMontant } from "@/lib/ebene-utils";
import { printElementById } from "@/lib/print";
import { Trans, useTranslation } from "react-i18next";

interface Props {
  employe: Employe;
  onClose: () => void;
}

export const ContratGenerator = ({ employe, onClose }: Props) => {
  const { t } = useTranslation();
  const today = new Date();
  const dateStr = `${today.getDate()} ${MOIS_NOMS[today.getMonth()]} ${today.getFullYear()}`;

  const typeLabel: Record<string, string> = {
    cdi: t("grh_contrat.type_cdi"),
    cdd: t("grh_contrat.type_cdd"),
    essai: t("grh_contrat.type_essai"),
    stage: t("grh_contrat.type_stage"),
    interim: t("grh_contrat.type_interim"),
  };

  const ct = employe.typeContrat || "cdi";
  const qualifText = employe.qualification ? ` (${employe.qualification})` : "";
  const sursalaireText = (employe.sursalaire || 0) > 0
    ? t("grh_contrat.art3_sursalaire", { val: formatMontant(employe.sursalaire!) })
    : "";

  return (
    <div className="modal-overlay">
      <div className="modal-box w-full max-w-3xl">
        <div className="flex items-center justify-between mb-4 no-print">
          <h2 className="text-xl font-bold">{t("grh_contrat.title")}</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => printElementById("print-area", `Contrat ${employe.nom}`)} className="gap-1.5">
              <Printer className="size-4" /> {t("grh_contrat.print")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}><X className="size-4" /></Button>
          </div>
        </div>

        <div id="print-area" className="bg-white text-foreground p-8 border-2 border-border rounded-lg space-y-4 text-sm leading-relaxed">
          <div className="text-center border-b-2 border-foreground pb-3 mb-4">
            <p className="font-bold text-base">{t("grh_contrat.republic")}</p>
            <p className="text-xs">{t("grh_contrat.motto")}</p>
            <h3 className="text-lg font-bold mt-3 uppercase">
              {typeLabel[ct]}
            </h3>
          </div>

          <p><strong>{t("grh_contrat.parties")}</strong></p>
          <p>
            <Trans i18nKey="grh_contrat.employer" components={[<strong key="0" />, <span key="1" />, <strong key="2" />]} />
          </p>
          <p className="text-center">{t("grh_contrat.one_part")}</p>
          <p><strong>{t("grh_contrat.and")}</strong></p>
          <p>
            <strong>{employe.nom}</strong>
            {employe.dateNaissance && t("grh_contrat.born_on", { date: employe.dateNaissance })}
            {employe.lieuNaissance && t("grh_contrat.born_at", { lieu: employe.lieuNaissance })}
            {employe.nationalite && t("grh_contrat.of_nat", { nat: employe.nationalite })}
            {employe.cni && t("grh_contrat.holder", { num: employe.cni })}
            {employe.adresse && t("grh_contrat.living", { adr: employe.adresse })}
            <Trans i18nKey="grh_contrat.worker_label" components={[<span key="0" />, <strong key="1" />]} />
          </p>
          <p className="text-center">{t("grh_contrat.other_part")}</p>

          <p className="font-bold mt-4">{t("grh_contrat.agreed")}</p>

          <p><strong>{t("grh_contrat.art1")}</strong></p>
          <p>
            <Trans
              i18nKey="grh_contrat.art1_body"
              values={{
                poste: employe.poste,
                qualif: qualifText,
                cat: employe.categorie || "E1",
                ech: employe.echelon || 1,
              }}
              components={[<span key="0" />, <strong key="1" />, <span key="2" />, <strong key="3" />]}
            />
          </p>

          <p><strong>{t("grh_contrat.art2")}</strong></p>
          <p>
            {ct === "cdd" && employe.dateFinContrat ? (
              <Trans i18nKey="grh_contrat.art2_body_cdd" values={{ date: employe.dateEmbauche || "...", fin: employe.dateFinContrat }} components={[<span key="0" />, <strong key="1" />]} />
            ) : ct === "essai" ? (
              <Trans i18nKey="grh_contrat.art2_body_essai" values={{ date: employe.dateEmbauche || "..." }} components={[<span key="0" />, <strong key="1" />]} />
            ) : (
              <Trans i18nKey="grh_contrat.art2_body_cdi" values={{ date: employe.dateEmbauche || "..." }} components={[<span key="0" />, <strong key="1" />]} />
            )}
          </p>

          <p><strong>{t("grh_contrat.art3")}</strong></p>
          <p>
            <Trans
              i18nKey="grh_contrat.art3_body"
              values={{ salaire: formatMontant(employe.salaire), sursalaire: sursalaireText }}
              components={[<span key="0" />, <strong key="1" />]}
            />
          </p>
          <ul className="list-disc pl-6">
            {(employe.indemniteTransport || 0) > 0 && <li>{t("grh_contrat.art3_transport", { val: formatMontant(employe.indemniteTransport!) })}</li>}
            {(employe.indemniteLogement || 0) > 0 && <li>{t("grh_contrat.art3_logement", { val: formatMontant(employe.indemniteLogement!) })}</li>}
            {(employe.indemniteFonction || 0) > 0 && <li>{t("grh_contrat.art3_fonction", { val: formatMontant(employe.indemniteFonction!) })}</li>}
            <li>{t("grh_contrat.art3_anc")}</li>
          </ul>

          <p><strong>{t("grh_contrat.art4")}</strong></p>
          <p>{t("grh_contrat.art4_body")}</p>

          <p><strong>{t("grh_contrat.art5")}</strong></p>
          <p>
            <Trans i18nKey="grh_contrat.art5_body" components={[<span key="0" />, <strong key="1" />]} />
          </p>

          <p><strong>{t("grh_contrat.art6")}</strong></p>
          <p>
            <Trans
              i18nKey="grh_contrat.art6_body"
              values={{ num: employe.numCnss || t("grh_contrat.cnss_to_assign") }}
              components={[<span key="0" />, <strong key="1" />]}
            />
          </p>

          <p><strong>{t("grh_contrat.art7")}</strong></p>
          <p>{t("grh_contrat.art7_body")}</p>

          <p className="mt-6">{t("grh_contrat.signed_at", { date: dateStr })}</p>

          <div className="grid grid-cols-2 gap-8 mt-12">
            <div className="text-center">
              <p className="border-t border-foreground pt-2">{t("grh_contrat.sign_employer")}</p>
              <p className="text-xs italic">BITHO SIMBAYA</p>
            </div>
            <div className="text-center">
              <p className="border-t border-foreground pt-2">{t("grh_contrat.sign_worker")}</p>
              <p className="text-xs italic">{employe.nom}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};