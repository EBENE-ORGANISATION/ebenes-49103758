/**
 * EBENE SERVICES — Electron main process (Windows .exe build)
 * ----------------------------------------------------------
 * Charge l'app React (build Vite) dans une BrowserWindow native.
 * - En production : `dist/index.html` (file://)
 * - En dev        : http://localhost:8080 (vite)
 *
 * Sécurité :
 *   - contextIsolation: true
 *   - nodeIntegration: false
 *   - preload via electron/preload.cjs (contextBridge)
 *
 * NB : on utilise l'extension .cjs car package.json déclare "type":"module".
 */
const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");

const isDev = !app.isPackaged;

let mainWindow = null;

// ─── Auto-update (electron-updater) ──────────────────────────────────────
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
// Utilise le provider GitHub natif (API GitHub) plutôt qu'une URL générique
// qui dépend du redirect /releases/latest/download/ (404 fréquents si la
// release n'est pas marquée "Latest" par GitHub).
autoUpdater.setFeedURL({
  provider: "github",
  owner: "EBENE-ORGANISATION",
  repo: "ebenes-49103758",
});

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

autoUpdater.on("checking-for-update", () => {
  log.info("Checking for update...");
});
autoUpdater.on("update-available", (info) => {
  log.info("Update available:", info && info.version);
  sendToRenderer("update-available", { version: info && info.version });
  dialog.showMessageBox({
    type: "info",
    title: "Mise à jour disponible",
    message: `Une mise à jour (v${info && info.version}) est disponible.`,
    detail: "Le téléchargement a démarré automatiquement.",
    buttons: ["OK"],
  }).catch((err) => log.error("dialog update-available error:", err));
});
autoUpdater.on("update-not-available", () => {
  log.info("App is up to date");
});
autoUpdater.on("download-progress", (progress) => {
  sendToRenderer("download-progress", { percent: progress && progress.percent });
});
autoUpdater.on("update-downloaded", (info) => {
  log.info("Update downloaded:", info && info.version);
  sendToRenderer("update-downloaded", { version: info && info.version });
  dialog.showMessageBox({
    type: "info",
    title: "Mise à jour prête",
    message: `La mise à jour v${info && info.version} est prête à être installée.`,
    detail: "Redémarrez l'application pour appliquer la mise à jour.",
    buttons: ["Redémarrer maintenant", "Plus tard"],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
  }).catch((err) => log.error("dialog update-downloaded error:", err));
});
autoUpdater.on("error", (err) => {
  log.error("Auto-updater error:", err);
  sendToRenderer("update-error", { message: String(err && err.message ? err.message : err) });
  // Ne pas afficher de dialog pour les erreurs (fréquentes en dev ou hors ligne)
});

ipcMain.on("install-update", () => {
  try {
    autoUpdater.quitAndInstall();
  } catch (err) {
    log.error("quitAndInstall failed:", err);
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: "EBENE SERVICES",
    icon: path.join(__dirname, "..", "public", "icons", "icon.ico"),
    backgroundColor: "#1F3864",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Liens externes → navigateur par défaut (jamais dans la fenêtre Electron).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ─── Menu applicatif (FR) ────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: "Fichier",
      submenu: [
        {
          label: "Exporter archive…",
          accelerator: "CmdOrCtrl+E",
          click: () => {
            if (mainWindow) {
              // Demande au renderer de déclencher l'export JSON
              mainWindow.webContents.send("menu:export-archive");
            }
          },
        },
        { type: "separator" },
        { label: "Quitter", role: "quit" },
      ],
    },
    {
      label: "Édition",
      submenu: [
        { label: "Annuler", role: "undo" },
        { label: "Rétablir", role: "redo" },
        { type: "separator" },
        { label: "Couper", role: "cut" },
        { label: "Copier", role: "copy" },
        { label: "Coller", role: "paste" },
        { label: "Tout sélectionner", role: "selectAll" },
      ],
    },
    {
      label: "Affichage",
      submenu: [
        { label: "Recharger", role: "reload" },
        { label: "Plein écran", role: "togglefullscreen" },
        { type: "separator" },
        { label: "Zoom +", role: "zoomIn" },
        { label: "Zoom -", role: "zoomOut" },
        { label: "Zoom 100%", role: "resetZoom" },
      ],
    },
    {
      label: "Aide",
      submenu: [
        {
          label: "À propos",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "À propos d'EBENE SERVICES",
              message: "EBENE SERVICES",
              detail:
                "Système de gestion d'entreprise — comptabilité, fiscalité, " +
                "factures et social.\n\nVersion " + app.getVersion() +
                "\n© EBENE SERVICES",
              buttons: ["Fermer"],
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── IPC handlers (utilisés par preload via contextBridge) ───────────────
ipcMain.handle("dialog:save-file", async (_evt, opts) => {
  if (!mainWindow) return { canceled: true };
  const { defaultPath, filters, data, encoding } = opts || {};
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Enregistrer le fichier",
    defaultPath: defaultPath || "export",
    filters: filters || [{ name: "Tous les fichiers", extensions: ["*"] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  try {
    // `data` peut être string (texte) ou Uint8Array sérialisé en number[]
    if (data == null) {
      // Pas de données : on renvoie juste le chemin choisi
      return { canceled: false, filePath: result.filePath };
    }
    const buffer = Array.isArray(data)
      ? Buffer.from(data)
      : Buffer.from(String(data), encoding === "utf8" ? "utf8" : "binary");
    fs.writeFileSync(result.filePath, buffer);
    return { canceled: false, filePath: result.filePath };
  } catch (err) {
    return { canceled: true, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle("dialog:open-file", async (_evt, opts) => {
  if (!mainWindow) return { canceled: true };
  const { filters, multiple } = opts || {};
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Ouvrir un fichier",
    properties: multiple ? ["openFile", "multiSelections"] : ["openFile"],
    filters: filters || [{ name: "Tous les fichiers", extensions: ["*"] }],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  try {
    const files = result.filePaths.map((p) => ({
      path: p,
      name: path.basename(p),
      data: Array.from(fs.readFileSync(p)),
    }));
    return { canceled: false, files };
  } catch (err) {
    return { canceled: true, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle("app:get-version", () => app.getVersion());

// ─── Lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Vérifie les mises à jour 3s après le démarrage pour ne pas bloquer.
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        log.error("checkForUpdatesAndNotify failed:", err);
      });
    }, 3000);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});