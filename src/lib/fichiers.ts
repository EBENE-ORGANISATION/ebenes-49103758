/**
 * Enregistrement des fichiers générés (PDF, Excel, Word, JSON…).
 *  - Navigateur et Windows : téléchargement classique.
 *  - Android (APK) : la WebView ignore les téléchargements de Blob. Le fichier
 *    est écrit dans le cache de l'application puis proposé dans la feuille de
 *    partage (Enregistrer dans Fichiers, Drive, WhatsApp, Imprimer…).
 */
import { toast } from "sonner";
import { isNative } from "@/lib/platform";

type Donnees = Blob | Uint8Array | ArrayBuffer | string;

const versBlob = (donnees: Donnees, type: string): Blob =>
  donnees instanceof Blob ? donnees : new Blob([donnees], { type });

const versBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result).split(",")[1] ?? "");
    lecteur.onerror = () => reject(lecteur.error);
    lecteur.readAsDataURL(blob);
  });

const telechargerNavigateur = (blob: Blob, nom: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Révoquer trop tôt annule le téléchargement sur certains navigateurs
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

const partagerNatif = async (blob: Blob, nom: string) => {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const { uri } = await Filesystem.writeFile({
    path: nom.replace(/[\\/:*?"<>|]+/g, "_"),
    data: await versBase64(blob),
    directory: Directory.Cache,
  });
  try {
    await Share.share({ title: nom, files: [uri], dialogTitle: "Enregistrer ou envoyer" });
  } catch (err) {
    // Fermeture de la feuille de partage par l'utilisateur : rien à signaler
    if (!/cancel/i.test((err as Error)?.message ?? "")) throw err;
  }
};

/** Enregistre (ou partage, sur Android) un fichier généré par l'application. */
export const enregistrerFichier = async (
  nom: string,
  donnees: Donnees,
  type = "application/octet-stream",
): Promise<void> => {
  const blob = versBlob(donnees, type);
  if (!isNative()) {
    telechargerNavigateur(blob, nom);
    return;
  }
  try {
    await partagerNatif(blob, nom);
  } catch (err) {
    toast.error(`Enregistrement du fichier impossible : ${(err as Error)?.message ?? err}`);
  }
};

export const TYPE_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const TYPE_PDF = "application/pdf";
