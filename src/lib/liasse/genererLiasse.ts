// Génération de la liasse (états financiers complets) dans le modèle officiel.
import type { DonneesMensuelles } from "@/types/ebene";
import { etatsFinanciersLiasse } from "./etatsLiasse";
import { saisiesReel, type InfosSociete } from "./modeleReel";
import { saisiesSmt } from "./modeleSmt";
import { saisiesNotesImmobilisations, saisiesNotesSoldes } from "./notesReel";
import { remplirModele, type Saisie } from "./xlsxPatch";

export type SystemeLiasse = "normal" | "smt";

export const MODELES: Record<SystemeLiasse, { fichier: string; nom: string }> = {
  normal: { fichier: "modeles/liasse-systeme-normal.xlsx", nom: "Système normal" },
  smt: { fichier: "modeles/liasse-smt.xlsx", nom: "Système minimal de trésorerie (SMT)" },
};

/** Régime TPU : système minimal de trésorerie ; autres régimes : système normal. */
export const systemeDuRegime = (regime?: string | null): SystemeLiasse => (regime === "TPU" ? "smt" : "normal");

export interface DonneesLiasse {
  donnees: DonneesMensuelles;
  annee: number;
  societe: InfosSociete;
  dateArrete: string;
  /** Saisies complémentaires (notes annexes, identification détaillée…). */
  complements?: Saisie[];
}

/** Toutes les cellules à remplir pour un système donné. */
export const saisiesLiasse = (systeme: SystemeLiasse, d: DonneesLiasse) => {
  const etats = etatsFinanciersLiasse(d.donnees, d.annee);
  const base = systeme === "smt"
    ? saisiesSmt(d.donnees, etats, d.societe)
    : [
        ...saisiesReel(etats, d.societe, d.dateArrete),
        ...saisiesNotesSoldes(d.donnees, d.annee),
        ...saisiesNotesImmobilisations(d.donnees, d.annee),
      ];
  return { etats, saisies: [...base, ...(d.complements ?? [])] };
};

/** Remplit le modèle (contenu du fichier) et renvoie le classeur produit. */
export const genererLiasse = async (systeme: SystemeLiasse, modele: ArrayBuffer | Uint8Array, d: DonneesLiasse) => {
  const { etats, saisies } = saisiesLiasse(systeme, d);
  const fichier = await remplirModele(modele, saisies);
  return { etats, fichier };
};
