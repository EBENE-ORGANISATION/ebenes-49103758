import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { ecouterRetourOAuth } from "./lib/connexionGoogle";
import { ecouterBoutonRetour } from "./lib/boutonRetour";
import { capturerRetourRecuperation } from "./lib/recuperationMotDePasse";
import { ErreurApplication } from "./components/ErreurApplication";

// APK : retour de la connexion Google dans l'application
ecouterRetourOAuth();
// APK : bouton retour Android
ecouterBoutonRetour();
// Lien « Mot de passe oublié » : lu et retiré de l'adresse avant que le routeur ne la lise
capturerRetourRecuperation();

createRoot(document.getElementById("root")!).render(
  <ErreurApplication>
    <App />
  </ErreurApplication>,
);
