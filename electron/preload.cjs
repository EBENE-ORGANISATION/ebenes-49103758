/**
 * Preload Electron — pont sécurisé entre le main process et le renderer.
 *
 * Expose UNIQUEMENT les APIs nécessaires sous `window.electronAPI`,
 * via contextBridge. Aucun accès direct à Node depuis le renderer.
 *
 * Côté React, on détecte la présence de cette API via `isElectron()`
 * dans `src/lib/platform.ts`.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  /** Identifie le contexte (utilisé par isElectron()). */
  platform: "electron",

  /** Version de l'application empaquetée. */
  getVersion: () => ipcRenderer.invoke("app:get-version"),

  /**
   * Affiche la boîte de dialogue native "Enregistrer sous…" et écrit
   * les données fournies dans le fichier choisi.
   *
   * @param {Object} opts
   * @param {string} [opts.defaultPath] - Nom de fichier suggéré
   * @param {Array<{name:string,extensions:string[]}>} [opts.filters]
   * @param {string|number[]|Uint8Array} opts.data - Contenu à écrire
   * @param {"utf8"|"binary"} [opts.encoding="binary"]
   * @returns {Promise<{canceled:boolean, filePath?:string, error?:string}>}
   */
  saveFileDialog: (opts) => {
    const payload = { ...opts };
    // Sérialise Uint8Array → number[] pour traverser le pont IPC.
    if (opts && opts.data instanceof Uint8Array) {
      payload.data = Array.from(opts.data);
    }
    return ipcRenderer.invoke("dialog:save-file", payload);
  },

  /**
   * Affiche la boîte de dialogue native "Ouvrir…".
   * @returns {Promise<{canceled:boolean, files?:Array<{name:string,path:string,data:number[]}>}>}
   */
  openFileDialog: (opts) => ipcRenderer.invoke("dialog:open-file", opts || {}),

  /** S'abonne aux commandes du menu (ex: export archive). */
  onMenuCommand: (channel, handler) => {
    const allowed = ["menu:export-archive"];
    if (!allowed.includes(channel)) return () => {};
    const wrapped = (_evt, ...args) => handler(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});