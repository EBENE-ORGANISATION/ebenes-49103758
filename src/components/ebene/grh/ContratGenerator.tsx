import { Employe, MOIS_NOMS } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Printer, X, FileDown, FileText } from "lucide-react";
import { formatMontant, tauxPourMois, dateFr } from "@/lib/ebene-utils";
import { pctTaux } from "@/lib/paie";
import { useTauxHistoriqueCourant } from "@/hooks/data/useTauxHistorique";
import { printElementById } from "@/lib/print";
import { Trans, useTranslation } from "react-i18next";
import { useEmployeur } from "@/hooks/useEmployeur";
import { exportElementToPDF, exportElementToWord } from "@/lib/exportDocs";
import { Bande, ChiffresCles, Marque, Pied, Signature, couleurDocument, page, lbl, SERIF, SANS } from "@/components/impression/styleDocument";
import { useSocieteDocument } from "@/components/impression/useSocieteDocument";
import type { CSSProperties } from "react";

/** Titre d'article : couleur de la société, gras, juste au-dessus de son texte. */
const titreArticle = (couleur: string): CSSProperties => ({ fontSize: "14px", fontWeight: 700, color: couleur, margin: "12px 0 2px" });

interface Props {
  employe: Employe;
  onClose: () => void;
}

export const ContratGenerator = ({ employe, onClose }: Props) => {
  const { t } = useTranslation();
  const employeur = useEmployeur();
  const societe = useSocieteDocument();
  const couleur = couleurDocument(societe.couleur);
  const art = titreArticle(couleur);
  const historiqueTaux = useTauxHistoriqueCourant();
  const today = new Date();
  // Taux de cotisation en vigueur à la date du contrat (historique de la société)
  const taux = tauxPourMois(historiqueTaux, today.getFullYear(), today.getMonth() + 1);
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
  const filename = `Contrat_${employe.nom.replace(/\s+/g, "_")}`;
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
      <div className="modal-box w-full max-w-[860px]">
        <div className="flex items-center justify-between mb-4 no-print">
          <h2 className="text-xl font-bold">{t("grh_contrat.title")}</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => printElementById("print-area", `Contrat ${employe.nom}`)} className="gap-1.5">
              <Printer className="size-4" /> {t("grh_contrat.print")}
            </Button>
            <Button size="sm" variant="outline" onClick={exportPDF} className="gap-1.5">
              <FileDown className="size-4" /> PDF
            </Button>
            <Button size="sm" variant="outline" onClick={exportWord} className="gap-1.5">
              <FileText className="size-4" /> Word
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}><X className="size-4" /></Button>
          </div>
        </div>

        <div className="overflow-x-auto">
        <div id="print-area" data-page-a4="" style={page({ padding: "46px 60px 90px", fontFamily: SERIF, fontSize: "13.5px", lineHeight: 1.55 })}>
          <Bande couleur={couleur} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "24px", fontFamily: SANS }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <Marque societe={societe} taille={44} />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 700, fontSize: "14px" }}>{employeur.nom}</span>
                <span style={lbl}>{[employeur.nif && `NIF ${employeur.nif}`, societe.rccm && `RCCM ${societe.rccm}`].filter(Boolean).join(" · ")}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontWeight: 700, fontSize: "12px", letterSpacing: "0.06em" }}>{t("grh_contrat.republic")}</span>
              <span style={lbl}>{t("grh_contrat.motto")}</span>
            </div>
          </div>

          <div style={{ marginTop: "30px", display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "26px", fontWeight: 700, color: couleur, lineHeight: 1.15 }}>{typeLabel[ct]}</span>
            <span style={lbl}>Code du travail du Togo · Convention collective interprofessionnelle</span>
          </div>

          <div style={{ fontFamily: SANS }}>
            <ChiffresCles
              items={[
                { label: "Emploi", valeur: employe.poste || "—" },
                { label: "Classification", valeur: `${employe.categorie || "E1"}, échelon ${employe.echelon || 1}` },
                { label: "Prise d'effet", valeur: employe.dateEmbauche ? dateFr(employe.dateEmbauche) : "—" },
                { label: "Salaire de base", valeur: <span style={{ color: couleur }}>{formatMontant(employe.salaire)}</span>, accent: true },
              ]}
            />
          </div>

          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <p style={{ ...lbl, fontWeight: 600, letterSpacing: "0.06em", margin: 0 }}>{t("grh_contrat.parties")}</p>
          <p>
            <Trans
              i18nKey="grh_contrat.employer"
              values={{
                nom: employeur.nom,
                nif: employeur.nif ? t("grh_contrat.employer_nif", { nif: employeur.nif }) : "",
                representant: !employeur.representant
                  ? ""
                  : employeur.fonctionRepresentant
                    ? t("grh_contrat.employer_rep_fonction", { nom: employeur.representant, fonction: employeur.fonctionRepresentant })
                    : t("grh_contrat.employer_rep", { nom: employeur.representant }),
              }}
              components={[<strong key="0" />, <span key="1" />, <strong key="2" />]}
            />
          </p>
          <p style={{ margin: 0 }}>{t("grh_contrat.one_part")}</p>
          <p style={{ ...lbl, fontWeight: 600, letterSpacing: "0.06em", margin: 0 }}>{t("grh_contrat.and")}</p>
          <p>
            <strong>{employe.nom}</strong>
            {employe.dateNaissance && t("grh_contrat.born_on", { date: dateFr(employe.dateNaissance) })}
            {employe.lieuNaissance && t("grh_contrat.born_at", { lieu: employe.lieuNaissance })}
            {employe.nationalite && t("grh_contrat.of_nat", { nat: employe.nationalite })}
            {employe.cni && t("grh_contrat.holder", { num: employe.cni })}
            {employe.adresse && t("grh_contrat.living", { adr: employe.adresse })}
            <Trans i18nKey="grh_contrat.worker_label" components={[<span key="0" />, <strong key="1" />]} />
          </p>
          <p style={{ margin: 0 }}>{t("grh_contrat.other_part")}</p>
          <p style={{ margin: 0 }}>{t("grh_contrat.agreed")}</p>
          </div>

          <p style={art}>{t("grh_contrat.art1")}</p>
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

          <p style={art}>{t("grh_contrat.art2")}</p>
          <p>
            {ct === "cdd" && employe.dateFinContrat ? (
              <Trans i18nKey="grh_contrat.art2_body_cdd" values={{ date: employe.dateEmbauche ? dateFr(employe.dateEmbauche) : "...", fin: dateFr(employe.dateFinContrat) }} components={[<span key="0" />, <strong key="1" />]} />
            ) : ct === "essai" ? (
              <Trans i18nKey="grh_contrat.art2_body_essai" values={{ date: employe.dateEmbauche ? dateFr(employe.dateEmbauche) : "..." }} components={[<span key="0" />, <strong key="1" />]} />
            ) : (
              <Trans i18nKey="grh_contrat.art2_body_cdi" values={{ date: employe.dateEmbauche ? dateFr(employe.dateEmbauche) : "..." }} components={[<span key="0" />, <strong key="1" />]} />
            )}
          </p>

          <p style={art}>{t("grh_contrat.art3")}</p>
          <p>
            <Trans
              i18nKey="grh_contrat.art3_body"
              values={{ salaire: formatMontant(employe.salaire), sursalaire: sursalaireText }}
              components={[<span key="0" />, <strong key="1" />]}
            />
          </p>
          <ul style={{ margin: "4px 0 0", paddingLeft: "22px" }}>
            {(employe.indemniteTransport || 0) > 0 && <li>{t("grh_contrat.art3_transport", { val: formatMontant(employe.indemniteTransport!) })}</li>}
            {(employe.indemniteLogement || 0) > 0 && <li>{t("grh_contrat.art3_logement", { val: formatMontant(employe.indemniteLogement!) })}</li>}
            {(employe.indemniteFonction || 0) > 0 && <li>{t("grh_contrat.art3_fonction", { val: formatMontant(employe.indemniteFonction!) })}</li>}
            <li>{t("grh_contrat.art3_anc")}</li>
          </ul>

          <p style={art}>{t("grh_contrat.art4")}</p>
          <p>{t("grh_contrat.art4_body")}</p>

          <p style={art}>{t("grh_contrat.art5")}</p>
          <p>
            <Trans i18nKey="grh_contrat.art5_body" components={[<span key="0" />, <strong key="1" />]} />
          </p>

          <p style={art}>{t("grh_contrat.art6")}</p>
          <p>
            <Trans
              i18nKey="grh_contrat.art6_body"
              values={{
                num: employe.numCnss || t("grh_contrat.cnss_to_assign"),
                cnssSal: pctTaux(taux.cnssSal),
                cnssEmp: pctTaux(taux.cnssEmp),
                amuSal: pctTaux(taux.amuSal),
                amuEmp: pctTaux(taux.amuEmp),
              }}
              components={[<span key="0" />, <strong key="1" />]}
            />
          </p>

          <p style={art}>{t("grh_contrat.art7")}</p>
          <p>{t("grh_contrat.art7_body")}</p>

          <p style={{ marginTop: "18px" }}>{t("grh_contrat.signed_at", { date: dateStr })}</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "40px", marginTop: "18px", fontFamily: SANS }}>
            <Signature titre={t("grh_contrat.sign_employer")} precision={employeur.representant || undefined} hauteur={80} />
            <Signature titre={t("grh_contrat.sign_worker")} precision={`${employe.nom}, précédé de « Lu et approuvé »`} hauteur={80} />
          </div>

          <div style={{ fontFamily: SANS }}>
            <Pied gauche="Paraphes — Employeur : ______  Travailleur : ______" droite="Fait en deux exemplaires originaux" />
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};