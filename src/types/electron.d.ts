/**
 * Types ambiants pour l'API Electron exposée par `electron/preload.cjs`.
 * Disponible uniquement quand l'app tourne dans le shell Electron.
 */
export {};

declare global {
  interface ElectronSaveResult {
    canceled: boolean;
    filePath?: string;
    error?: string;
  }

  interface ElectronOpenResult {
    canceled: boolean;
    files?: Array<{ name: string; path: string; data: number[] }>;
    error?: string;
  }

  interface ElectronAPI {
    platform: "electron";
    getVersion(): Promise<string>;
    saveFileDialog(opts: {
      defaultPath?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
      data: Uint8Array | number[] | string;
      encoding?: "utf8" | "binary";
    }): Promise<ElectronSaveResult>;
    openFileDialog(opts?: {
      filters?: Array<{ name: string; extensions: string[] }>;
      multiple?: boolean;
    }): Promise<ElectronOpenResult>;
    onMenuCommand(
      channel: "menu:export-archive",
      handler: (...args: unknown[]) => void,
    ): () => void;
    onUpdateAvailable(cb: (payload: { version?: string }) => void): () => void;
    onDownloadProgress(cb: (payload: { percent?: number }) => void): () => void;
    onUpdateDownloaded(cb: (payload: { version?: string }) => void): () => void;
    onUpdateError(cb: (payload: { message?: string }) => void): () => void;
    installUpdate(): void;
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }
}