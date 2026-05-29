/** Utilitaire d'impression avec aperçu intégré. */
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const getDocumentStyles = () =>
  Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("\n");

const buildPrintableHtml = (el: HTMLElement, title: string): string => {
  const cloned = el.cloneNode(true) as HTMLElement;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<base href="${escapeHtml(document.baseURI)}" />
<title>${escapeHtml(title)}</title>
${getDocumentStyles()}
<style>
  html, body { margin: 0; padding: 0; background: #fff !important; color: #000 !important; }
  body { padding: 12mm; font-family: Arial, sans-serif; }
  .no-print, [data-radix-popper-content-wrapper] { display: none !important; }
  @page { size: A4; margin: 12mm; }
  table { border-collapse: collapse; width: 100%; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
</style>
</head>
<body>${cloned.outerHTML}</body>
</html>`;
};

const waitForFrame = async (iframe: HTMLIFrameElement) => {
  const frameWindow = iframe.contentWindow;
  const frameDocument = iframe.contentDocument;
  if (!frameWindow || !frameDocument) return;

  await new Promise<void>((resolve) => {
    if (frameDocument.readyState === "complete") resolve();
    else iframe.addEventListener("load", () => resolve(), { once: true });
  });

  await frameDocument.fonts?.ready.catch(() => undefined);
  await Promise.all(
    Array.from(frameDocument.images).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    }),
  );
};

/**
 * Ouvre un aperçu avant impression dans l'application, puis imprime le contenu
 * depuis une iframe dédiée pour éviter les pages vierges liées aux modales SPA.
 */
export const printElement = (el: HTMLElement | null, title = "Impression"): void => {
  if (!el) {
    window.print();
    return;
  }

  const existing = document.getElementById("print-preview-overlay");
  existing?.remove();

  const overlay = document.createElement("div");
  overlay.id = "print-preview-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:18px;";

  const panel = document.createElement("div");
  panel.style.cssText = "width:min(980px,100%);height:min(92vh,1120px);background:#fff;border-radius:10px;box-shadow:0 24px 80px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden;";

  const header = document.createElement("div");
  header.style.cssText = "height:56px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 14px;border-bottom:1px solid #e5e7eb;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif;";
  header.innerHTML = `<strong style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Aperçu avant impression — ${escapeHtml(title)}</strong>`;

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:8px;flex-shrink:0;";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Fermer";
  closeButton.style.cssText = "height:36px;padding:0 12px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#0f172a;font-weight:600;cursor:pointer;";

  const printButton = document.createElement("button");
  printButton.type = "button";
  printButton.textContent = "Imprimer";
  printButton.style.cssText = "height:36px;padding:0 14px;border:0;border-radius:7px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer;";

  const iframe = document.createElement("iframe");
  iframe.title = `Aperçu ${title}`;
  iframe.style.cssText = "flex:1;width:100%;border:0;background:#fff;";

  const closePreview = () => overlay.remove();
  closeButton.onclick = closePreview;
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closePreview();
  });

  printButton.onclick = async () => {
    printButton.textContent = "Préparation…";
    printButton.setAttribute("disabled", "true");
    await waitForFrame(iframe);
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    printButton.textContent = "Imprimer";
    printButton.removeAttribute("disabled");
  };

  actions.append(printButton, closeButton);
  header.appendChild(actions);
  panel.append(header, iframe);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  iframe.srcdoc = buildPrintableHtml(el, title);
};

/** Variante par id, utile lorsque le composant marque déjà sa zone imprimable. */
export const printElementById = (id: string, title?: string): void => {
  printElement(document.getElementById(id), title);
};