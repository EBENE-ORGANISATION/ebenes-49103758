import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { ecouterRetourOAuth } from "./lib/connexionGoogle";

// APK : retour de la connexion Google dans l'application
ecouterRetourOAuth();

createRoot(document.getElementById("root")!).render(<App />);
