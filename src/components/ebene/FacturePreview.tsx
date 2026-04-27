import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Facture } from "@/types/ebene";
import { formatMontant } from "@/lib/ebene-utils";
import { Printer, X, FileDown, FileText } from "lucide-react";
import { exportElementToPDF, exportElementToWord } from "@/lib/exportDocs";
import { useSocieteActive } from "@/hooks/useSocieteContext";

interface Props {
  facture: Facture | null;
  onClose: () => void;
}

export const FacturePreview = ({ facture, onClose }: Props) => {
  if (!facture) return null;
  const societe = useSocieteActive();
  const logo = societe?.logoUrl || "";
  const couleur = societe?.couleurPrimaire || "#3D0000";
  const nomSoc = societe?.nom || "Société";
  // Pied : uniquement les coordonnées RÉELLES de la société active (pas de
  // fallback EBENE pour éviter d'imprimer les coordonnées d'une société
  // sur les documents d'une autre).
  const piedLignes: string[] = [];
  if (societe?.adresse) piedLignes.push(societe.adresse);
  const ligne2: string[] = [];
  if (societe?.rccm) ligne2.push(`RCCM : ${societe.rccm}`);
  if (societe?.telephone) ligne2.push(`Tél : ${societe.telephone}`);
  const ligne3: string[] = [];
  if (societe?.email) ligne3.push(`Email : ${societe.email}`);
  if (societe?.nif) ligne3.push(`NIF : ${societe.nif}`);
  if (societe?.siteWeb) ligne3.push(societe.siteWeb);

  const isProforma = facture.statut === "proforma";
  const sousTotal = facture.lignes.reduce((a, l) => a + l.montant, 0);
  const filename = `${isProforma ? "Proforma" : "Facture"}_${facture.numero.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const exportPDF = async () => {
    const el = document.getElementById("print-area");
    if (el) await exportElementToPDF(el, filename);
  };
  const exportWord = async () => {
    const el = document.getElementById("print-area");
    if (el) await exportElementToWord(el, filename);
  };

  return (
    <Dialog open={!!facture} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between gap-2 p-4 border-b border-border bg-muted/30 no-print">
          <h2 className="font-bold">Aperçu — {facture.numero}</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => window.print()} className="gap-1.5">
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

        <div
          id="print-area"
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
          {/* ─── EN-TÊTE : logo + barre marron ─── */}
          <div
            style={{
              position: "absolute",
              top: "12mm",
              left: "20mm",
              right: "0",
              display: "flex",
              alignItems: "center",
              gap: "0",
            }}
          >
            {logo ? (
              <img src={logo} alt={nomSoc} style={{ height: "22mm", width: "auto", objectFit: "contain" }} />
            ) : (
              <div
                style={{
                  height: "22mm",
                  width: "22mm",
                  background: couleur,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "12pt",
                  borderRadius: "2mm",
                }}
              >
                {nomSoc.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div
              style={{
                flex: 1,
                height: "2mm",
                background: couleur,
                marginLeft: "4mm",
              }}
            />
          </div>

          {/* ─── PIED : deux petits traits marron ─── */}
          <div
            style={{
              position: "absolute",
              bottom: "22mm",
              left: "20mm",
              right: "20mm",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ width: "30mm", height: "1.5mm", background: couleur, borderRadius: "1mm" }} />
            <div style={{ width: "30mm", height: "1.5mm", background: couleur, borderRadius: "1mm" }} />
          </div>

          {/* ─── PIED : coordonnées centrées ─── */}
          <div
            style={{
              position: "absolute",
              bottom: "8mm",
              left: "20mm",
              right: "20mm",
              textAlign: "center",
              fontSize: "10pt",
              lineHeight: 1.4,
              color: "#1a1a1a",
            }}
          >
            {piedLignes.join(" • ")}
            <br />
            {ligne2.join(", ")}
            <br />
            {ligne3.join(" — ")}
          </div>

          {/* ─── CONTENU DE LA FACTURE ─── */}
          <div style={{ marginTop: "20mm" }}>
            {/* Bandeau titre moderne */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "stretch",
                marginBottom: "12mm",
                gap: "6mm",
              }}
            >
              <div
                style={{
                  flex: 1,
                  background: isProforma
                    ? "linear-gradient(135deg, #a06800 0%, #c98a1f 100%)"
                    : "linear-gradient(135deg, #3D0000 0%, #6b1a1a 100%)",
                  color: "#fff",
                  padding: "6mm 8mm",
                  borderRadius: "3mm",
                  boxShadow: "0 2mm 4mm rgba(61,0,0,0.15)",
                }}
              >
                <p style={{ margin: 0, fontSize: "9pt", letterSpacing: "3px", opacity: 0.85, textTransform: "uppercase" }}>
                  {isProforma ? "Document commercial" : "Facture officielle"}
                </p>
                <h1
                  style={{
                    fontSize: "24pt",
                    fontWeight: 800,
                    margin: "1mm 0 0",
                    letterSpacing: "1.5px",
                  }}
                >
                  {isProforma ? "PROFORMA" : "FACTURE"}
                </h1>
              </div>
              <div
                style={{
                  background: "#f7efe9",
                  border: "1px solid #e5d4c5",
                  borderRadius: "3mm",
                  padding: "5mm 6mm",
                  minWidth: "65mm",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2mm" }}>
                  <span style={{ fontSize: "8.5pt", color: "#7a5a45", textTransform: "uppercase", letterSpacing: "1px" }}>
                    N°
                  </span>
                  <span style={{ fontSize: "11pt", fontWeight: 700, color: "#3D0000", fontFamily: "monospace" }}>
                    {facture.numero}
                  </span>
                </div>
                <div style={{ borderTop: "1px dashed #c9b29a", margin: "1mm 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2mm" }}>
                  <span style={{ fontSize: "8.5pt", color: "#7a5a45", textTransform: "uppercase", letterSpacing: "1px" }}>
                    Date
                  </span>
                  <span style={{ fontSize: "10.5pt", fontWeight: 600, color: "#3D0000" }}>{facture.date}</span>
                </div>
              </div>
            </div>

            {/* Bloc client moderne */}
            <div
              style={{
                background: "#fafafa",
                borderLeft: "4px solid #3D0000",
                padding: "5mm 6mm",
                marginBottom: "10mm",
                borderRadius: "0 2mm 2mm 0",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "8.5pt",
                  textTransform: "uppercase",
                  letterSpacing: "2px",
                  color: "#89604A",
                  fontWeight: 600,
                }}
              >
                Facturé à
              </p>
              <p style={{ margin: "2mm 0 0", fontSize: "14pt", fontWeight: 700, color: "#1a1a1a" }}>
                {facture.client}
              </p>
            </div>

            {/* Tableau des prestations — moderne */}
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                fontSize: "10.5pt",
                marginBottom: "8mm",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "4mm 5mm",
                      fontWeight: 600,
                      background: "#3D0000",
                      color: "#fff",
                      borderTopLeftRadius: "2mm",
                      fontSize: "10pt",
                      letterSpacing: "0.5px",
                    }}
                  >
                    DÉSIGNATION
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "4mm 5mm",
                      width: "50mm",
                      fontWeight: 600,
                      background: "#3D0000",
                      color: "#fff",
                      borderTopRightRadius: "2mm",
                      fontSize: "10pt",
                      letterSpacing: "0.5px",
                    }}
                  >
                    MONTANT (FCFA)
                  </th>
                </tr>
              </thead>
              <tbody>
                {facture.lignes.map((l, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fbf7f3" }}>
                    <td
                      style={{
                        padding: "3.5mm 5mm",
                        borderBottom: "1px solid #eadfd3",
                      }}
                    >
                      {l.description}
                    </td>
                    <td
                      style={{
                        padding: "3.5mm 5mm",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        borderBottom: "1px solid #eadfd3",
                        fontWeight: 500,
                      }}
                    >
                      {formatMontant(l.montant)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totaux modernes */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10mm" }}>
              <div style={{ width: "95mm" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5pt" }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: "2mm 4mm", color: "#666" }}>Sous-total</td>
                      <td style={{ padding: "2mm 4mm", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {formatMontant(sousTotal)}
                      </td>
                    </tr>
                    {facture.reduction > 0 && (
                      <tr>
                        <td style={{ padding: "2mm 4mm", color: "#666" }}>Réduction</td>
                        <td
                          style={{
                            padding: "2mm 4mm",
                            textAlign: "right",
                            color: "#a00",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          - {formatMontant(facture.reduction)}
                        </td>
                      </tr>
                    )}
                    <tr style={{ borderTop: "1px solid #e5d4c5" }}>
                      <td style={{ padding: "2mm 4mm", color: "#666" }}>Total HT</td>
                      <td style={{ padding: "2mm 4mm", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {formatMontant(facture.totalHT)}
                      </td>
                    </tr>
                    {facture.avecTva && (
                      <tr>
                        <td style={{ padding: "2mm 4mm", color: "#666" }}>TVA 18 %</td>
                        <td
                          style={{
                            padding: "2mm 4mm",
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {formatMontant(facture.totalTva)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Total TTC en bandeau dégradé */}
                <div
                  style={{
                    marginTop: "3mm",
                    background: "linear-gradient(135deg, #3D0000 0%, #6b1a1a 100%)",
                    color: "#fff",
                    padding: "4mm 5mm",
                    borderRadius: "2mm",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    boxShadow: "0 2mm 3mm rgba(61,0,0,0.2)",
                  }}
                >
                  <span style={{ fontSize: "11pt", fontWeight: 600, letterSpacing: "1.5px" }}>TOTAL TTC</span>
                  <span style={{ fontSize: "15pt", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                    {formatMontant(facture.totalTtc)}
                  </span>
                </div>
              </div>
            </div>

            {/* Mention arrêtée + signature */}
            <div
              style={{
                marginTop: "12mm",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                fontSize: "10pt",
                gap: "10mm",
              }}
            >
              <div
                style={{
                  flex: 1,
                  background: "#fbf7f3",
                  border: "1px solid #eadfd3",
                  borderRadius: "2mm",
                  padding: "4mm 5mm",
                }}
              >
                <p style={{ margin: 0, fontStyle: "italic", color: "#7a5a45", fontSize: "9.5pt" }}>
                  Arrêtée la présente facture à la somme de :
                </p>
                <p style={{ margin: "1.5mm 0 0", fontWeight: 700, color: "#3D0000", fontSize: "11pt" }}>
                  {formatMontant(facture.totalTtc)} FCFA TTC
                </p>
              </div>
              <div style={{ textAlign: "center", minWidth: "55mm" }}>
                <p style={{ margin: 0, color: "#89604A", fontWeight: 600, letterSpacing: "1px", fontSize: "9.5pt" }}>
                  LA DIRECTION
                </p>
                <div style={{ marginTop: "16mm", borderTop: "1.5px solid #3D0000", width: "100%" }} />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};