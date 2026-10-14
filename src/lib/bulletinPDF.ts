// Bulletin de paie PDF : le même document que l'aperçu (DocumentBulletin, modèle D),
// rendu hors écran puis exporté. Réutilise calculerPaie() et contenuBulletin() ;
// ne réécrit aucune logique de paie.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { Employe, MoisData, MOIS_NOMS, TauxFiscaux, TAUX_DEFAUT } from "@/types/ebene";
import { calculerPaie, contenuBulletin, type MontantsEnregistres } from "@/lib/paie";
import { exportElementToPDF } from "@/lib/exportDocs";
import { DocumentBulletin } from "@/components/impression/DocumentBulletin";

/** Sous-ensemble de societe_config + societes utilisé pour la mise en forme du bulletin. */
export interface BulletinSocieteInfo {
  nom?: string | null;
  adresse?: string | null;
  telephone?: string | null;
  email?: string | null;
  nif?: string | null;
  rccm?: string | null;
  logo_url?: string | null;
  mention_facture?: string | null;
  couleur_primaire?: string | null;
  /** N° employeur CNSS (identification de la société). */
  cnss_employeur?: string | null;
}

/**
 * Génère et télécharge le bulletin de paie PDF d'un employé pour un mois donné.
 * Pour un bulletin enregistré, passer `enregistre` : le PDF reprend alors ses
 * montants (ceux validés/payés), pas un recalcul sur les données actuelles.
 */
export const generateBulletin = async (
  employe: Employe,
  moisData: MoisData,
  annee: number,
  mois: number,
  societe?: BulletinSocieteInfo | null,
  /** Taux CNSS/AMU du mois (tauxPourMois sur l'historique de la société). */
  taux: TauxFiscaux = TAUX_DEFAUT,
  /** Montants du bulletin enregistré, qui font foi s'ils sont fournis. */
  enregistre?: MontantsEnregistres | null,
): Promise<void> => {
  const hote = document.createElement("div");
  hote.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;pointer-events:none;";
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  try {
    const c = calculerPaie(employe, moisData, annee, mois, taux);
    flushSync(() =>
      racine.render(
        createElement(DocumentBulletin, {
          employe,
          contenu: contenuBulletin(c, employe, enregistre),
          annee,
          mois,
          anciennete: c.anciennete,
          cnssEmployeur: societe?.cnss_employeur ?? null,
          societe: {
            nom: societe?.nom || "Société",
            adresse: societe?.adresse,
            telephone: societe?.telephone,
            nif: societe?.nif,
            rccm: societe?.rccm,
            logoUrl: societe?.logo_url,
            couleur: societe?.couleur_primaire,
          },
        }),
      ),
    );
    await document.fonts?.ready.catch(() => undefined);
    const element = hote.firstElementChild as HTMLElement | null;
    if (!element) throw new Error("bulletin non rendu");
    const nom = `Bulletin_${(employe.nom || "employe").replace(/\s+/g, "_")}_${MOIS_NOMS[mois - 1]}_${annee}`;
    await exportElementToPDF(element, nom);
  } catch (err) {
    console.error("[bulletinPDF]", err);
    toast.error("Impossible de générer le bulletin PDF");
  } finally {
    racine.unmount();
    hote.remove();
  }
};
