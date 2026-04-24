// Utilitaires d'export PDF + Word d'un élément HTML
// Utilisés pour bulletins de paie & factures
import html2pdf from "html2pdf.js";

export const exportElementToPDF = async (element: HTMLElement, filename: string) => {
  // Clone pour ne pas casser le rendu en cas de styles dépendants du parent
  const opt = {
    margin: 10,
    filename: `${filename}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  };
  await html2pdf().set(opt).from(element).save();
};

export const exportElementToWord = async (element: HTMLElement, filename: string) => {
  // html-to-docx attend un HTML complet
  const HTMLtoDOCX = (await import("html-to-docx")).default as (
    html: string,
    headerHTML?: string | null,
    options?: Record<string, unknown>
  ) => Promise<Blob>;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:12px;}
    table{border-collapse:collapse;width:100%;}
    th,td{border:1px solid #555;padding:4px 6px;}
    th{background:#eee;text-align:left;}
    h1,h2,h3{margin:6px 0;}
    .text-right{text-align:right;}
    .text-center{text-align:center;}
    .font-bold{font-weight:bold;}
  </style></head><body>${element.innerHTML}</body></html>`;

  const blob = await HTMLtoDOCX(html, null, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.docx`;
  a.click();
  URL.revokeObjectURL(url);
};
