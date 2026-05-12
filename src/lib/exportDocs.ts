// Utilitaires d'export PDF + Word d'un élément HTML
// Utilisés pour bulletins de paie & factures
//
// ⚠️ Tous les imports lourds (html2pdf, html-to-docx) sont dynamiques
// pour éviter de les inclure dans le bundle initial (~2 MB économisés).
import { toast } from "sonner";

export const exportElementToPDF = async (element: HTMLElement, filename: string) => {
  // Import dynamique → vendor-pdf chargé seulement au premier export PDF
  const { default: html2pdf } = await import("html2pdf.js");
  const opt = {
    margin: 10,
    filename: `${filename}.pdf`,
    image: { type: "jpeg" as const, quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
    jsPDF: { unit: "mm" as const, format: "a4", orientation: "portrait" as const },
  };
  await html2pdf().set(opt).from(element).save();
};

/** CSS embarqué commun pour les exports Word */
const WORD_STYLES = `
  body{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:12px;}
  table{border-collapse:collapse;width:100%;}
  th,td{border:1px solid #555;padding:4px 6px;}
  th{background:#eee;text-align:left;}
  h1,h2,h3{margin:6px 0;}
  .text-right{text-align:right;}
  .text-center{text-align:center;}
  .font-bold{font-weight:bold;}
`.trim();

const buildHtml = (innerHtml: string) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${WORD_STYLES}</style></head><body>${innerHtml}</body></html>`;

/**
 * Export Word.
 *
 * Stratégie :
 *  1. Tente `html-to-docx` (vrai DOCX, fonctionne sous Electron où Node.js
 *     est disponible, et dans certains navigateurs modernes).
 *  2. Si l'import échoue ou que le module lève une erreur (modules Node.js
 *     non disponibles en contexte browser), bascule sur une stratégie de
 *     repli : Blob HTML avec Content-Type `application/msword`, ouvrable
 *     directement par Microsoft Word et LibreOffice.
 */
export const exportElementToWord = async (element: HTMLElement, filename: string) => {
  const html = buildHtml(element.innerHTML);

  // ── Tentative 1 : html-to-docx (vrai .docx) ─────────────────────────────
  try {
    type HtmlToDocxFn = (
      html: string,
      headerHTML?: string | null,
      options?: Record<string, unknown>,
    ) => Promise<Blob>;

    const mod = await import("html-to-docx");
    const HTMLtoDOCX = (mod.default ?? mod) as HtmlToDocxFn;

    const blob = await HTMLtoDOCX(html, null, {
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: false,
    });

    triggerDownload(blob, `${filename}.docx`);
    return;
  } catch (err) {
    console.warn("[exportDocs] html-to-docx indisponible, bascule .doc :", err);
  }

  // ── Repli 2 : HTML enregistré comme .doc (compatible Word / LibreOffice) ─
  try {
    // Le BOM UTF-8 (﻿) aide Word à détecter l'encodage correctement.
    const blob = new Blob(["﻿" + html], {
      type: "application/vnd.ms-word;charset=utf-8",
    });
    triggerDownload(blob, `${filename}.doc`);
    toast.info(
      "Export Word (.doc) — format compatible Word/LibreOffice. " +
      "Pour un .docx natif, utilisez l'application bureau.",
    );
  } catch (err) {
    console.error("[exportDocs] Échec export Word :", err);
    toast.error("Export Word indisponible dans ce navigateur. Utilisez l'export PDF.");
  }
};

/** Déclenche le téléchargement d'un Blob via un lien temporaire. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
