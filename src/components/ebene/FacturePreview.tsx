import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Facture } from "@/types/ebene";
import { formatMontant } from "@/lib/ebene-utils";
import { Printer, X, FileDown, FileText } from "lucide-react";
import { exportElementToPDF, exportElementToWord } from "@/lib/exportDocs";
import logoEbene from "@/assets/ebene-logo.png";

interface Props {
  facture: Facture | null;
  onClose: () => void;
}

export const FacturePreview = ({ facture, onClose }: Props) => {
  if (!facture) return null;

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

        {/*
          Reproduction fidèle du papier à en-tête EBENE SERVICES :
          - Haut : logo à gauche + longue barre marron qui s'étend vers la droite
          - Bas  : deux petits traits marron de chaque côté
          - Pied : coordonnées centrées (Quartier, RCCM, Tél, Email, NIF)
        */}
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
            <img src={logoEbene} alt="EBENE SERVICES" style={{ height: "22mm", width: "auto" }} />
            <div
              style={{
                flex: 1,
                height: "2mm",
                background: "#3D0000",
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
            <div style={{ width: "30mm", height: "1.5mm", background: "#3D0000", borderRadius: "1mm" }} />
            <div style={{ width: "30mm", height: "1.5mm", background: "#3D0000", borderRadius: "1mm" }} />
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
            Quartier ADAWLATO, Rue du Grand Marché, N° RCCM: TG-LFW-01-2026-B13-00075
            <br />
            LOME-TOGO, TEL: (+228) 97 43 38 20,
            <br />
            Email: ebnservicess@gmail.com NIF: 1 002 088 759
          </div>

          {/* ─── CONTENU DE LA FACTURE ─── */}
          <div style={{ marginTop: "18mm" }}>
            {/* Titre + numéro + date */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10mm" }}>
              <div>
                <h1
                  style={{
                    fontSize: "20pt",
                    fontWeight: 700,
                    color: isProforma ? "#a06800" : "#3D0000",
                    margin: 0,
                    letterSpacing: "1px",
                  }}
                >
                  {isProforma ? "FACTURE PROFORMA" : "FACTURE"}
                </h1>
                <p style={{ margin: "2mm 0 0", fontFamily: "monospace", fontWeight: 700, fontSize: "12pt" }}>
                  N° {facture.numero}
                </p>
              </div>
              <div style={{ textAlign: "right", fontSize: "10pt" }}>
                <p style={{ margin: 0 }}>
                  <strong>Lomé, le </strong>
                  {facture.date}
                </p>
              </div>
            </div>

            {/* Bloc client */}
            <div style={{ marginBottom: "8mm" }}>
              <p style={{ margin: 0, fontSize: "9pt", textTransform: "uppercase", letterSpacing: "1px", color: "#555" }}>
                Doit
              </p>
              <p style={{ margin: "1mm 0 0", fontSize: "13pt", fontWeight: 600 }}>{facture.client}</p>
            </div>

            {/* Tableau des prestations */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5pt", marginBottom: "6mm" }}>
              <thead>
                <tr style={{ background: "#3D0000", color: "#fff" }}>
                  <th style={{ textAlign: "left", padding: "3mm 4mm", fontWeight: 600 }}>Désignation</th>
                  <th style={{ textAlign: "right", padding: "3mm 4mm", width: "45mm", fontWeight: 600 }}>Montant (FCFA)</th>
                </tr>
              </thead>
              <tbody>
                {facture.lignes.map((l, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #ccc" }}>
                    <td style={{ padding: "2.5mm 4mm" }}>{l.description}</td>
                    <td style={{ padding: "2.5mm 4mm", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {formatMontant(l.montant)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totaux */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <table style={{ width: "85mm", borderCollapse: "collapse", fontSize: "10.5pt" }}>
                <tbody>
                  <tr>
                    <td style={{ padding: "1.5mm 3mm", color: "#555" }}>Sous-total</td>
                    <td style={{ padding: "1.5mm 3mm", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {formatMontant(sousTotal)}
                    </td>
                  </tr>
                  {facture.reduction > 0 && (
                    <tr>
                      <td style={{ padding: "1.5mm 3mm", color: "#555" }}>Réduction</td>
                      <td style={{ padding: "1.5mm 3mm", textAlign: "right", color: "#a00", fontVariantNumeric: "tabular-nums" }}>
                        - {formatMontant(facture.reduction)}
                      </td>
                    </tr>
                  )}
                  <tr style={{ borderTop: "1px solid #999" }}>
                    <td style={{ padding: "1.5mm 3mm", color: "#555" }}>Total HT</td>
                    <td style={{ padding: "1.5mm 3mm", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {formatMontant(facture.totalHT)}
                    </td>
                  </tr>
                  {facture.avecTva && (
                    <tr>
                      <td style={{ padding: "1.5mm 3mm", color: "#555" }}>TVA 18 %</td>
                      <td style={{ padding: "1.5mm 3mm", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {formatMontant(facture.totalTva)}
                      </td>
                    </tr>
                  )}
                  <tr style={{ borderTop: "2px solid #3D0000", background: "#f7efe9" }}>
                    <td style={{ padding: "2.5mm 3mm", fontWeight: 700, fontSize: "12pt", color: "#3D0000" }}>
                      TOTAL TTC
                    </td>
                    <td
                      style={{
                        padding: "2.5mm 3mm",
                        textAlign: "right",
                        fontWeight: 700,
                        fontSize: "12pt",
                        color: "#3D0000",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatMontant(facture.totalTtc)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signature / mention */}
            <div style={{ marginTop: "18mm", display: "flex", justifyContent: "space-between", fontSize: "10pt" }}>
              <div>
                <p style={{ margin: 0, fontStyle: "italic", color: "#444" }}>
                  Arrêtée la présente facture à la somme de :
                </p>
                <p style={{ margin: "1mm 0 0", fontWeight: 600 }}>{formatMontant(facture.totalTtc)} FCFA TTC</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ margin: 0, color: "#555" }}>La Direction</p>
                <div style={{ marginTop: "14mm", borderTop: "1px solid #888", width: "50mm" }} />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};