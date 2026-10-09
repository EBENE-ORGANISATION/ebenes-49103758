/**
 * Bouton retour Android (APK).
 * Sans écouteur, Capacitor ne fait rien quand l'historique est vide et ne ferme
 * pas les fenêtres ouvertes. Ordre de traitement :
 *  1. fermer l'aperçu d'impression ;
 *  2. fermer la fenêtre, le menu ou la liste ouverte (comme la touche Échap) ;
 *  3. revenir à l'écran précédent ;
 *  4. sinon, quitter l'application après un second appui.
 */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { toast } from "sonner";

const DELAI_SORTIE_MS = 2000;

const COUCHES_OUVERTES = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
  "[data-radix-popper-content-wrapper]",
  "[vaul-drawer][data-state=\"open\"]",
].join(",");

const fermerCoucheOuverte = (): boolean => {
  const apercu = document.getElementById("print-preview-overlay");
  if (apercu) {
    apercu.remove();
    return true;
  }
  if (!document.querySelector(COUCHES_OUVERTES)) return false;
  // Les fenêtres Radix se ferment sur Échap (écouteur posé sur le document)
  const echap = { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true };
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", echap));
  return true;
};

export const ecouterBoutonRetour = (): void => {
  if (Capacitor.getPlatform() !== "android") return;
  let dernierAppui = 0;
  void App.addListener("backButton", ({ canGoBack }) => {
    if (fermerCoucheOuverte()) return;
    // Page de connexion : ne pas revenir vers les écrans de la session fermée
    const surConnexion = window.location.hash.startsWith("#/auth");
    if (canGoBack && !surConnexion) {
      window.history.back();
      return;
    }
    if (Date.now() - dernierAppui < DELAI_SORTIE_MS) {
      void App.exitApp();
      return;
    }
    dernierAppui = Date.now();
    toast("Appuyez encore sur Retour pour quitter", { duration: DELAI_SORTIE_MS });
  });
};
