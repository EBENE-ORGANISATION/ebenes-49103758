// Enregistrement du Service Worker (sorti de index.html pour permettre une
// politique de sécurité qui interdit les scripts en ligne).
// Enregistrement du Service Worker — UNIQUEMENT si :
//  - on n'est PAS dans Capacitor (window.Capacitor absent)
//  - on n'est PAS dans un iframe (preview Lovable)
//  - on n'est PAS sur un host de preview Lovable
(function () {
  try {
    if (typeof window === "undefined") return;
    if (window.Capacitor) return; // Capacitor gère son propre runtime

    var inIframe = false;
    try { inIframe = window.self !== window.top; } catch (e) { inIframe = true; }

    var host = window.location.hostname || "";
    var isPreviewHost =
      // Développement local : pas de cache, sinon Vite sert du code périmé
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.indexOf("id-preview--") !== -1 ||
      host.indexOf("lovableproject.com") !== -1 ||
      host.indexOf("lovable.app") !== -1;

    if (inIframe || isPreviewHost) {
      // En preview/iframe : on désinscrit tout SW résiduel pour
      // éviter de servir un build périmé.
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          regs.forEach(function (r) { r.unregister(); });
        }).catch(function () {});
      }
      return;
    }

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("/sw.js").catch(function (err) {
          console.warn("[SW] registration failed:", err);
        });
      });
    }
  } catch (e) {
    console.warn("[SW] bootstrap error:", e);
  }
})();
