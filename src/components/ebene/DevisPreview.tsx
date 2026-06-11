import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Devis } from "@/types/ebene";
import { formatMontant } from "@/lib/ebene-utils";
import { Printer, X, FileDown, FileText } from "lucide-react";
import { exportElementToPDF, exportElementToWord } from "@/lib/exportDocs";
import { printElementById } from "@/lib/print";
import { useTenant } from "@/hooks/useTenant";
import { useTranslation } from "react-i18next";

interface Props {
  devis: Devis | null;
  onClose: () => void;
}

export const DevisPreview = ({ devis, onClose }: Props) => {
  const { t } = useTranslation();
  const { currentSociete, societeConfig } = useTenant();
  if (!devis) return null;

  const sousTotal = devis.lignes.reduce((a, l) => a + l.montant, 0);
  const nomSociete = currentSociete?.nom || t("facture_preview.fallback_company");
  const logoSrc = societeConfig?.logo_url || null;
  const couleurPrimaire = societeConfig?.couleur_primaire || "#3D0000";
  const couleurAccent = societeConfig?.couleur_accent || "#89604A";
  const adresse = societeConfig?.adresse || "";
  const telephone = societeConfig?.telephone || "";
  const email = societeConfig?.email || "";
  const nif = societeConfig?.nif || "";
  const rccm = societeConfig?.rccm || "";
  const mention = societeConfig?.mention_facture?.trim() || "";
  const filename = `Devis_${devis.numero.replace(/[^A-Za-z0-9_-]/g, "_")}`;

  const exportPDF = async () => {
    const el = document.getElementById("print-area-devis");
    if (el) await exportElementToPDF(el, filename);
  };
  const exportWord = async () => {
    const el = document.getElementById("print-area-devis");
    if (el) await exportElementToWord(el, filename);
  };

  return (
    <Dialog open={!!devis} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between gap-2 p-4 border-b border-border bg-muted/30 no-print">
          <h2 className="font-bold">Devis {devis.numero}</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => printElementById("print-area-devis", `Devis ${devis.numero}`)} className="gap-1.5">
              <Printer className="size-4" /> {t("facture_preview.print")}
            </Button>
            <Button size="sm" variant="outline" onClick={exportPDF} className="gap-1.5">
              <FileDown className="size-4" /> {t("facture_preview.pdf")}
            </Button>
            <Button size="sm" variant="outline" onClick={exportWord} className="gap-1.5">
              <FileText className="size-4" /> {t("facture_preview.word")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div
          id="print-area-devis"
          className="bg-white text-black mx-auto"
          style={{
            width: "210mm",
            minHeight: "297mm",
            position: "relative",
            fontFamily: "'Poppins', Arial, sans-serif",
            padding: "30mm 20mm 35mm 20mm",
            boxSizing: "border-box",
          }}
        >
          <div style={{ position: "absolute", top: "12mm", left: "20mm", right: 0, display: "flex", alignItems: "center" }}>
            {logoSrc && (
              <img src={logoSrc} alt={nomSociete} style={{ height: "32mm", width: "auto", maxWidth: "85mm", objectFit: "contain" }} />
            )}
            <div style={{ flex: 1, height: "2mm", background: couleurPrimaire, marginLeft: "4mm" }} />
          </div>

          <div style={{ position: "absolute", bottom: "22mm", left: "20mm", right: "20mm", display: "flex", justifyContent: "space-between" }}>
            <div style={{ width: "30mm", height: "1.5mm", background: couleurPrimaire, borderRadius: "1mm" }} />
            <div style={{ width: "30mm", height: "1.5mm", background: couleurPrimaire, borderRadius: "1mm" }} />
          </div>

          <div style={{ position: "absolute", bottom: "8mm", left: "20mm", right: "20mm", textAlign: "center", fontSize: "10pt", lineHeight: 1.4, color: "#1a1a1a" }}>
            <div style={{ fontWeight: 700, marginBottom: "1mm", color: couleurPrimaire }}>{nomSociete}</div>
            {adresse && <>{adresse}<br /></>}
            {[telephone && t("facture_preview.tel", { value: telephone }), email && t("facture_preview.email", { value: email })].filter(Boolean).join("  •  ")}
            {(telephone || email) && <br />}
            {[rccm && t("facture_preview.rccm", { value: rccm }), nif && t("facture_preview.nif", { value: nif })].filter(Boolean).join("  •  ")}
          </div>

          <div style={{ marginTop: "20mm" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "stretch", marginBottom: "12mm", gap: "6mm" }}>
              <div style={{ flex: 1, background: `linear-gradient(135deg, ${couleurPrimaire} 0%, ${couleurAccent} 100%)`, color: "#fff", padding: "6mm 8mm", borderRadius: "3mm", boxShadow: "0 2mm 4mm rgba(61,0,0,0.15)" }}>
                <p style={{ margin: 0, fontSize: "9pt", letterSpacing: "3px", opacity: 0.85, textTransform: "uppercase" }}>Document commercial</p>
                <h1 style={{ fontSize: "24pt", fontWeight: 800, margin: "1mm 0 0", letterSpacing: "1.5px" }}>DEVIS</h1>
              </div>
              <div style={{ background: "#f7efe9", border: "1px solid #e5d4c5", borderRadius: "3mm", padding: "5mm 6mm", minWidth: "65mm", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2mm" }}>
                  <span style={{ fontSize: "8.5pt", color: "#7a5a45", textTransform: "uppercase", letterSpacing: "1px" }}>N°</span>
                  <span style={{ fontSize: "11pt", fontWeight: 700, color: "#3D0000", fontFamily: "monospace" }}>{devis.numero}</span>
                </div>
                <div style={{ borderTop: "1px dashed #c9b29a", margin: "1mm 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2mm" }}>
                  <span style={{ fontSize: "8.5pt", color: "#7a5a45", textTransform: "uppercase", letterSpacing: "1px" }}>Date</span>
                  <span style={{ fontSize: "10.5pt", fontWeight: 600, color: "#3D0000" }}>{devis.date}</span>
                </div>
                {devis.dateValidite && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2mm" }}>
                    <span style={{ fontSize: "8.5pt", color: "#7a5a45", textTransform: "uppercase", letterSpacing: "1px" }}>Validité</span>
                    <span style={{ fontSize: "10.5pt", fontWeight: 600, color: "#3D0000" }}>{devis.dateValidite}</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: "#fafafa", borderLeft: `4px solid ${couleurPrimaire}`, padding: "5mm 6mm", marginBottom: "10mm", borderRadius: "0 2mm 2mm 0" }}>
              <p style={{ margin: 0, fontSize: "8.5pt", textTransform: "uppercase", letterSpacing: "2px", color: "#89604A", fontWeight: 600 }}>
                {t("facture_preview.billed_to")}
              </p>
              <p style={{ margin: "2mm 0 0", fontSize: "14pt", fontWeight: 700, color: "#1a1a1a" }}>{devis.client}</p>
            </div>

            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "10.5pt", marginBottom: "8mm" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "4mm 5mm", fontWeight: 600, background: couleurPrimaire, color: "#fff", borderTopLeftRadius: "2mm", fontSize: "10pt" }}>
                    {t("facture_preview.designation")}
                  </th>
                  <th style={{ textAlign: "right", padding: "4mm 5mm", width: "50mm", fontWeight: 600, background: couleurPrimaire, color: "#fff", borderTopRightRadius: "2mm", fontSize: "10pt" }}>
                    {t("facture_preview.amount_xof")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {devis.lignes.map((l, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fbf7f3" }}>
                    <td style={{ padding: "3.5mm 5mm", borderBottom: "1px solid #eadfd3" }}>{l.description}</td>
                    <td style={{ padding: "3.5mm 5mm", textAlign: "right", fontVariantNumeric: "tabular-nums", borderBottom: "1px solid #eadfd3", fontWeight: 500 }}>
                      {formatMontant(l.montant)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10mm" }}>
              <div style={{ width: "95mm" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5pt" }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: "2mm 4mm", color: "#666" }}>{t("facture_preview.subtotal")}</td>
                      <td style={{ padding: "2mm 4mm", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatMontant(sousTotal)}</td>
                    </tr>
                    {devis.reduction > 0 && (
                      <tr>
                        <td style={{ padding: "2mm 4mm", color: "#666" }}>{t("facture_preview.discount")}</td>
                        <td style={{ padding: "2mm 4mm", textAlign: "right", color: "#a00", fontVariantNumeric: "tabular-nums" }}>- {formatMontant(devis.reduction)}</td>
                      </tr>
                    )}
                    <tr style={{ borderTop: "1px solid #e5d4c5" }}>
                      <td style={{ padding: "2mm 4mm", color: "#666" }}>{t("facture_preview.total_ht")}</td>
                      <td style={{ padding: "2mm 4mm", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatMontant(devis.totalHT)}</td>
                    </tr>
                    {devis.avecTva && (
                      <tr>
                        <td style={{ padding: "2mm 4mm", color: "#666" }}>{t("facture_preview.vat_18")}</td>
                        <td style={{ padding: "2mm 4mm", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatMontant(devis.totalTva)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div style={{ marginTop: "3mm", background: `linear-gradient(135deg, ${couleurPrimaire} 0%, ${couleurAccent} 100%)`, color: "#fff", padding: "4mm 5mm", borderRadius: "2mm", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2mm 3mm rgba(61,0,0,0.2)" }}>
                  <span style={{ fontSize: "11pt", fontWeight: 600, letterSpacing: "1.5px" }}>{t("facture_preview.total_ttc")}</span>
                  <span style={{ fontSize: "15pt", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{formatMontant(devis.totalTtc)}</span>
                </div>
              </div>
            </div>

            {mention && (
              <div style={{ marginTop: "8mm", padding: "3mm 4mm", background: "#fbf7f3", borderRadius: "2mm", fontSize: "9pt", fontStyle: "italic", color: "#555", textAlign: "center" }}>
                {mention}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};