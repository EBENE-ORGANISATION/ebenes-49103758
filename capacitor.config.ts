import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration — EBENE SERVICES
 *
 * Stratégie : bundle local (offline-first).
 *  - Pas de `server.url` → l'app native embarque le contenu de `dist/`.
 *  - HTTPS uniquement (cleartext = false).
 *  - Android : pas de mixed content.
 *
 * Les plateformes natives (Android, iOS) sont ajoutées localement via
 * `npx cap add android` après un `git pull` du projet — elles ne sont
 * pas committées dans ce dépôt.
 */
const config: CapacitorConfig = {
  appId: "com.ebeneservices.app",
  appName: "EBENE SERVICES",
  webDir: "dist",
  server: {
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;