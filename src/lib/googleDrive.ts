/**
 * Client front pour les sauvegardes Google Drive.
 *
 * ⚠️ Architecture choisie : Connecteur Lovable (gateway centralisé).
 *  - Aucun secret exposé au navigateur (pas de VITE_GOOGLE_CLIENT_ID/API_KEY).
 *  - Tous les appels Google Drive passent par l'edge function `drive-backup`,
 *    qui utilise le scope minimal `drive.file` (uniquement les fichiers créés
 *    par cette application).
 *  - Backups stockés dans le dossier "EBENE_BACKUPS" du Drive admin connecté.
 *
 * Toutes les fonctions enveloppent les erreurs dans un try/catch et
 * affichent un toast.error() en cas d'échec — un échec Drive n'interrompt
 * jamais la sauvegarde Supabase principale.
 */
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export interface DriveFileInfo {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}

export interface DriveBackupResult {
  ok: boolean;
  file?: DriveFileInfo;
  error?: string;
}

/** Snapshot complet du store (sérialisable en JSON). */
export interface EbeneSnapshot {
  donneesMensuelles: unknown;
  employes: unknown;
  paramsAnnuels: unknown;
  tauxHistorique: unknown;
  articles: unknown;
  fournisseurs: unknown;
  categoriesStock: unknown;
  sanctions: unknown;
  exportedAt: string;
  version: 1;
}

/** Type minimal du store attendu pour backup/restauration. */
export interface EbeneStoreLike {
  donneesMensuelles: unknown;
  employes: unknown;
  paramsAnnuels: unknown;
  tauxHistorique: unknown;
  articles: unknown;
  fournisseurs: unknown;
  categoriesStock: unknown;
  sanctions: unknown;
  importerDonnees: (data: Record<string, unknown>) => void;
}

/**
 * Initialisation : aucun SDK Google à charger côté client puisque la
 * communication passe par l'edge function. Cette fonction vérifie juste
 * que l'utilisateur a une session valide (sinon les appels échoueront).
 */
export async function initGoogleDrive(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  } catch (err) {
    console.error("[googleDrive] initGoogleDrive:", err);
    return false;
  }
}

/** Construit un snapshot JSON complet du store. */
export function snapshotFromStore(store: EbeneStoreLike): EbeneSnapshot {
  return {
    donneesMensuelles: store.donneesMensuelles,
    employes: store.employes,
    paramsAnnuels: store.paramsAnnuels,
    tauxHistorique: store.tauxHistorique,
    articles: store.articles,
    fournisseurs: store.fournisseurs,
    categoriesStock: store.categoriesStock,
    sanctions: store.sanctions,
    exportedAt: new Date().toISOString(),
    version: 1,
  };
}

/**
 * Upload du snapshot vers Drive (dossier EBENE_BACKUPS).
 * Si un fichier du même jour existe déjà, il est écrasé.
 * silent=true → pas de toast en cas d'échec (utilisé par le backup auto).
 */
export async function backupToDrive(
  store: EbeneStoreLike,
  options: { silent?: boolean } = {}
): Promise<DriveBackupResult> {
  try {
    const snapshot = snapshotFromStore(store);
    const { data, error } = await supabase.functions.invoke("drive-backup", {
      body: { snapshot },
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "Erreur Drive inconnue");
    if (!options.silent) {
      toast.success("Sauvegarde Google Drive réussie");
    }
    return { ok: true, file: data.file };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[googleDrive] backupToDrive failed:", message);
    if (!options.silent) {
      toast.error(`Échec sauvegarde Drive : ${message}`);
    }
    return { ok: false, error: message };
  }
}

/** Liste les 10 derniers backups disponibles dans EBENE_BACKUPS. */
export async function listDriveBackups(): Promise<DriveFileInfo[]> {
  try {
    const { data, error } = await supabase.functions.invoke("drive-backup", {
      body: {},
      method: "GET" as never,
    } as never);
    // supabase.functions.invoke ne supporte pas GET avec query params facilement → fallback fetch direct
    if (error || !data) {
      return await listViaFetch();
    }
    if (!data.ok) throw new Error(data.error || "Erreur Drive");
    return (data.files as DriveFileInfo[]) ?? [];
  } catch {
    return await listViaFetch();
  }
}

async function listViaFetch(): Promise<DriveFileInfo[]> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("Non authentifié");
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-backup?action=list`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Erreur Drive");
    return (j.files as DriveFileInfo[]) ?? [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[googleDrive] listDriveBackups failed:", message);
    toast.error(`Impossible de lister les sauvegardes Drive : ${message}`);
    return [];
  }
}

/** Télécharge un backup et le réinjecte dans le store via importerDonnees(). */
export async function restoreFromDrive(
  fileId: string,
  store: EbeneStoreLike
): Promise<boolean> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("Non authentifié");
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-backup?action=download&fileId=${encodeURIComponent(fileId)}`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Échec téléchargement Drive");
    const snap = j.data as Record<string, unknown>;
    if (!snap || typeof snap !== "object") throw new Error("Snapshot invalide");
    store.importerDonnees(snap);
    toast.success("Restauration depuis Drive réussie");
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[googleDrive] restoreFromDrive failed:", message);
    toast.error(`Échec restauration Drive : ${message}`);
    return false;
  }
}