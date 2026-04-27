/**
 * Helpers de détection de plateforme.
 *
 * Permet de switcher entre les APIs navigateur et les APIs natives Capacitor
 * (Filesystem, Share, Network…) sans dupliquer le code métier.
 *
 * En mode web (PWA / navigateur classique), `Capacitor` n'est pas chargé,
 * et on retombe sur les implémentations standard.
 */
import { Capacitor } from "@capacitor/core";

/** Vrai si l'app tourne dans un conteneur natif Capacitor (Android, iOS). */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Vrai si l'app tourne sur Android (natif uniquement). */
export function isAndroid(): boolean {
  try {
    return Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

/** Vrai si l'app tourne sur iOS (natif uniquement). */
export function isIOS(): boolean {
  try {
    return Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

/** Vrai si l'app tourne dans un navigateur web (PWA, desktop, mobile web). */
export function isWeb(): boolean {
  try {
    return Capacitor.getPlatform() === "web";
  } catch {
    return true;
  }
}

/** Plateforme courante : "web" | "android" | "ios". */
export function platform(): "web" | "android" | "ios" | "electron" {
  try {
    if (isElectron()) return "electron";
    const p = Capacitor.getPlatform();
    if (p === "android" || p === "ios") return p;
    return "web";
  } catch {
    return "web";
  }
}

// ─── Electron (desktop Windows/macOS/Linux) ──────────────────────────────
/**
 * Vrai si l'app tourne dans le shell Electron (desktop .exe / .app / .AppImage).
 * On détecte l'API exposée par `electron/preload.cjs` via contextBridge.
 */
export function isElectron(): boolean {
  try {
    return typeof window !== "undefined"
      && typeof (window as unknown as { electronAPI?: { platform?: string } }).electronAPI === "object"
      && (window as unknown as { electronAPI?: { platform?: string } }).electronAPI?.platform === "electron";
  } catch {
    return false;
  }
}

/**
 * Sauvegarde un Blob/Uint8Array via la boîte de dialogue native Electron
 * "Enregistrer sous…" si on est dans Electron, sinon retourne false pour
 * que l'appelant utilise le fallback navigateur (téléchargement classique).
 *
 * @returns true si le fichier a été enregistré via Electron, false sinon.
 */
export async function saveFileViaElectron(
  filename: string,
  data: Blob | Uint8Array | string,
  filters?: Array<{ name: string; extensions: string[] }>,
): Promise<boolean> {
  if (!isElectron()) return false;
  const api = (window as unknown as {
    electronAPI?: {
      saveFileDialog: (opts: {
        defaultPath?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
        data: Uint8Array | string;
        encoding?: "utf8" | "binary";
      }) => Promise<{ canceled: boolean; filePath?: string; error?: string }>;
    };
  }).electronAPI;
  if (!api) return false;

  let payload: Uint8Array | string;
  let encoding: "utf8" | "binary" = "binary";
  if (typeof data === "string") {
    payload = data;
    encoding = "utf8";
  } else if (data instanceof Uint8Array) {
    payload = data;
  } else {
    // Blob → Uint8Array
    const buf = await data.arrayBuffer();
    payload = new Uint8Array(buf);
  }

  const result = await api.saveFileDialog({
    defaultPath: filename,
    filters,
    data: payload,
    encoding,
  });
  return !result.canceled && !!result.filePath;
}