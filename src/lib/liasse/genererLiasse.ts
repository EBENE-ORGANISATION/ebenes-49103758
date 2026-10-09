// Génération de la liasse (états financiers complets) dans le modèle officiel.
import type { DonneesMensuelles } from "@/types/ebene";
import { etatsFinanciersLiasse } from "./etatsLiasse";
import { saisiesReel, type InfosSociete } from "./modeleReel";
import { saisiesSmt } from "./modeleSmt";
import { saisiesNotesImmobilisations, saisiesNotesSoldes } from "./notesReel";
import { complementsReel, complementsSmt, type DonneesGestion } from "./etatsComplementaires";
import { saisiesIdentification, type ActiviteCA, type InfosIdentification } from "./identificationLiasse";
import type { DonneesMensuelles as DM } from "@/types/ebene";
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
  /** Immobilisations, stock et personnel (notes et états complémentaires). */
  gestion?: DonneesGestion;
  /** Identification complète (fiches, dirigeants, capital). */
  identification?: InfosIdentification;
  /** Saisies complémentaires. */
  complements?: Saisie[];
}

/** Toutes les cellules à remplir pour un système donné. */
export const saisiesLiasse = (systeme: SystemeLiasse, d: DonneesLiasse) => {
  const etats = etatsFinanciersLiasse(d.donnees, d.annee);
  const base = systeme === "smt"
    ? [...saisiesSmt(d.donnees, etats, d.societe), ...complementsSmt(d.donnees, d.annee, d.gestion ?? {})]
    : [
        ...complementsReel(d.donnees, d.annee, d.gestion ?? {}),
        ...saisiesReel(etats, d.societe, d.dateArrete),
        ...saisiesNotesSoldes(d.donnees, d.annee),
        ...saisiesNotesImmobilisations(d.donnees, d.annee),
      ];
  const ident = d.identification ? saisiesIdentification(d.identification, etats, { systeme }) : [];
  return { etats, saisies: [...base, ...ident, ...(d.complements ?? [])] };
};

/** Remplit le modèle (contenu du fichier) et renvoie le classeur produit. */
export const genererLiasse = async (systeme: SystemeLiasse, modele: ArrayBuffer | Uint8Array, d: DonneesLiasse) => {
  const { etats, saisies } = saisiesLiasse(systeme, d);
  const fichier = await remplirModele(modele, saisies);
  return { etats, fichier };
};

/** Chiffre d'affaires HT de l'exercice par activité (comptes 70 des écritures validées). */
export const caParActivite = (donnees: DM, annee: number, noms: Map<string, string>): ActiviteCA[] => {
  const ca = new Map<string, number>();
  for (const [k, m] of Object.entries(donnees)) {
    if (Number(k.split("-")[0]) !== annee) continue;
    for (const e of m?.ecritures ?? []) {
      if (e.statut === "brouillon") continue;
      for (const l of e.lignes ?? []) {
        if (!l.compte.startsWith("70")) continue;
        const nom = (e.activiteId && noms.get(e.activiteId)) || "Activité principale";
        ca.set(nom, (ca.get(nom) ?? 0) + (l.credit || 0) - (l.debit || 0));
      }
    }
  }
  return [...ca].map(([nom, v]) => ({ nom, ca: Math.round(v) }));
};
