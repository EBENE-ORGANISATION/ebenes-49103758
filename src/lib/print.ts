/**
 * Utilitaire d'impression robuste.
 *
 * `window.print()` natif imprime toute la page : dans une SPA avec dialogues
 * Radix (portails, position: fixed, overflow auto), même avec un CSS
 * `@media print` qui masque tout sauf `#print-area`, le rendu finit souvent
 * vide (élément clipé, dupliqué, ou positionné hors page).
 *
 * `printElement` clone le nœud cible dans une fenêtre dédiée avec toutes les
 * feuilles de styles du document, puis déclenche l'impression. Le résultat
 * est identique au rendu écran et fonctionne dans tous les navigateurs.
 */
export const printElement = (el: HTMLElement | null, title = "Impression"): void => {
  if (!el) {
    window.print();
    return;
  }

  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) {
    // Pop-up bloquée : fallback sur l'impression native
    window.print();
    return;
  }

  // Récupère toutes les feuilles de styles (link + style inline) du document
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("\n");

  const cloned = el.cloneNode(true) as HTMLElement;

  win.document.open();
  win.document.write(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${title.replace(/[<>]/g, "")}</title>
${styles}
<style>
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { padding: 12mm; font-family: 'Poppins', Arial, sans-serif; }
  .no-print { display: none !important; }
  @page { size: A4; margin: 12mm; }
  table { border-collapse: collapse; width: 100%; }
  /* Force les couleurs/backgrounds à l'impression */
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
</style>
</head>
<body>
</body>
</html>`);
  win.document.close();

  win.document.body.appendChild(cloned);

  // Attend que les ressources (fonts, images) soient chargées
  const launch = () => {
    try {
      win.focus();
      win.print();
    } finally {
      // Petit délai avant fermeture pour laisser le dialogue d'impression s'ouvrir
      setTimeout(() => win.close(), 300);
    }
  };

  if (win.document.readyState === "complete") {
    setTimeout(launch, 250);
  } else {
    win.addEventListener("load", () => setTimeout(launch, 250));
  }
};

/** Variante par id, utile lorsque le composant marque déjà sa zone imprimable. */
export const printElementById = (id: string, title?: string): void => {
  printElement(document.getElementById(id), title);
};