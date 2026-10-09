// Identification de la société dans la liasse : fiches d'identification,
// dirigeants, associés, capital (notes 13 et 31) — module pur.
import type { IdentificationSociete } from "@/data/identification.repo";
import type { Saisie } from "./xlsxPatch";
import type { EtatsFinanciersLiasse } from "./etatsLiasse";

/** Codes de la table des codes (note 36). */
export const CODE_FORME: Record<string, string> = {
  SA_PUBLIQUE: "00", SA: "01", SARL: "02", SCS: "03", SNC: "04", SP: "05", GIE: "06", ASSOCIATION: "07", SAS: "08", EI: "09", AUTRE: "09",
};

export interface ActiviteCA { nom: string; ca: number }

export interface InfosIdentification {
  identification: IdentificationSociete;
  regimeFiscal?: string | null;
  representant?: string | null;
  fonctionRepresentant?: string | null;
  /** Chiffre d'affaires HT de l'exercice par activité. */
  activites?: ActiviteCA[];
  /** Effectif et masse salariale de l'exercice (note 31). */
  effectif?: number;
  masseSalariale?: number;
}

/** Une case par chiffre : « 08 » → Q13 = 0, R13 = 8. */
const chiffres = (feuille: string, ligne: number, colonnes: string[], valeur: string | number | undefined, sorties: Saisie[]) => {
  if (valeur === undefined || valeur === null || valeur === "") return;
  const s = String(valeur).padStart(colonnes.length, "0").slice(-colonnes.length);
  colonnes.forEach((c, i) => sorties.push({ feuille, cellule: `${c}${ligne}`, valeur: Number(s[i]) }));
};

/** Cellules d'identification ; `decalageFiche2` : −1 pour le SMT (fiche 2 remontée d'une ligne). */
export const saisiesIdentification = (
  infos: InfosIdentification,
  etats: EtatsFinanciersLiasse,
  options: { systeme: "normal" | "smt" },
): Saisie[] => {
  const id = infos.identification;
  const out: Saisie[] = [];
  const set = (feuille: string, cellule: string, valeur: number | string | null | undefined) => {
    if (valeur === undefined || valeur === null || valeur === "") return;
    out.push({ feuille, cellule, valeur });
  };

  // Fiche d'identification 1 (même disposition dans les deux modèles)
  const f1 = "FICHE IDENTIFICATION 1 ";
  set(f1, "C13", id.greffe);
  set(f1, "L13", id.repertoireEntites);
  set(f1, "C15", id.cnssEmployeur);
  set(f1, "H15", id.codeImportateur);
  set(f1, "O15", id.codeActivite);
  set(f1, "P17", id.sigle);
  set(f1, "N20", id.boitePostale);
  set(f1, "P20", id.ville);
  set(f1, "B32", id.contact);
  set(f1, "B35", id.expertComptable);
  set(f1, "B40", id.commissaireComptes);
  set(f1, "B49", id.signataire ?? infos.representant);
  set(f1, "B52", id.qualiteSignataire ?? infos.fonctionRepresentant);
  (id.banques ?? []).slice(0, 5).forEach((b, i) => {
    set(f1, `K${48 + i}`, b.banque);
    set(f1, `O${48 + i}`, b.compte);
  });
  if (options.systeme === "normal") {
    set("FICHE DEPOT SYST NORM", "D31", id.sigle);
    set("FICHE DEPOT SYST NORM", "F14", id.centreImpots);
  } else {
    set("FICHE DEPOT SMT REF", "E23", id.sigle);
  }

  // Fiche d'identification 2 : codes, contrôle, activités
  const f2 = "FICHE IDENTIFICATION 2 ";
  const d = options.systeme === "smt" ? -1 : 0;
  chiffres(f2, 9 + d, ["Q", "R"], id.formeJuridique ? CODE_FORME[id.formeJuridique] : undefined, out);
  chiffres(f2, 11 + d, ["Q"], infos.regimeFiscal === "TPU" ? 2 : infos.regimeFiscal ? 1 : undefined, out);
  chiffres(f2, 13 + d, ["Q", "R"], id.paysSiege ?? "08", out);
  chiffres(f2, 15 + d, ["Q", "R"], id.nbEtablissements, out);
  chiffres(f2, 17 + d, ["Q", "R"], id.nbEtablissementsHors, out);
  chiffres(f2, 20 + d, ["Q", "R", "S", "T"], id.premiereAnnee ?? (id.dateCreation ? id.dateCreation.slice(0, 4) : undefined), out);
  const ligneControle = { public: 9, prive_national: 11, prive_etranger: 13 } as const;
  if (id.controle) set(f2, `AI${ligneControle[id.controle] + d}`, "X");
  const acts = [...(infos.activites ?? [])].filter((a) => a.ca).sort((a, b) => b.ca - a.ca);
  const total = acts.reduce((t, a) => t + a.ca, 0);
  const lignesAct = [26, 28, 30].map((l) => l + d);
  const affichees = acts.length > 3 ? [...acts.slice(0, 2), { nom: "Divers", ca: acts.slice(2).reduce((t, a) => t + a.ca, 0) }] : acts;
  affichees.forEach((a, i) => {
    set(f2, `B${lignesAct[i]}`, a.nom);
    set(f2, `X${lignesAct[i]}`, Math.round(a.ca));
    if (total) set(f2, `AG${lignesAct[i]}`, Math.round((a.ca / total) * 1000) / 10);
  });
  if (affichees.length && id.codeActivite) chiffres(f2, lignesAct[0], ["Q", "R", "S", "T", "U", "V"], id.codeActivite.replace(/\D/g, ""), out);
  if (total) { set(f2, `X${32 + d}`, Math.round(total)); set(f2, `AG${32 + d}`, 100); }

  if (options.systeme === "smt") return out;

  // Fiche des dirigeants et associés
  const fd = "FICHE DIRIGEANTS";
  (id.dirigeants ?? []).slice(0, 8).forEach((x, i) => {
    const l = 11 + i;
    set(fd, `A${l}`, x.nif); set(fd, `B${l}`, x.nom); set(fd, `D${l}`, x.prenoms);
    set(fd, `F${l}`, x.qualite); set(fd, `H${l}`, x.telephone); set(fd, `I${l}`, x.adresse);
  });
  const associes = (id.associes ?? []).slice(0, 7);
  const capitalTotal = associes.reduce((t, a) => t + (a.montant ?? 0), 0) || id.capitalSocial || 0;
  associes.forEach((x, i) => {
    const l = 25 + i;
    set(fd, `A${l}`, x.nif); set(fd, `B${l}`, x.nom); set(fd, `D${l}`, x.prenoms); set(fd, `F${l}`, x.nationalite);
    if (x.montant !== undefined) {
      set(fd, `I${l}`, Math.round((x.montant / 1_000_000) * 1000) / 1000);
      if (capitalTotal) set(fd, `J${l}`, Math.round((x.montant / capitalTotal) * 1000) / 10);
    }
  });
  if (associes.length) {
    set(fd, "I32", Math.round((capitalTotal / 1_000_000) * 1000) / 1000);
    set(fd, "J32", 100);
  }

  // Note 13 : capital
  set("NOTE 13", "G9", id.valeurNominale);
  associes.forEach((x, i) => {
    const l = 11 + i;
    set("NOTE 13", `A${l}`, [x.nom, x.prenoms].filter(Boolean).join(" "));
    set("NOTE 13", `E${l}`, x.nationalite);
    set("NOTE 13", `F${l}`, "Ordinaires");
    set("NOTE 13", `G${l}`, x.nombreParts);
    set("NOTE 13", `H${l}`, x.montant);
  });

  // Note 31 : capital, résultats, personnel (exercice N)
  const n31 = "NOTE 31";
  set(n31, "G15", id.capitalSocial ?? (etats.n.passif.CA || undefined));
  set(n31, "G16", id.nombreParts);
  set(n31, "G22", etats.n.cr.XB);
  set(n31, "G23", etats.n.cr.XG);
  set(n31, "G24", -etats.n.cr.RQ);
  set(n31, "G25", -etats.n.cr.RS);
  set(n31, "G26", etats.n.cr.XI);
  set(n31, "H22", etats.n1.cr.XB);
  set(n31, "H23", etats.n1.cr.XG);
  set(n31, "H26", etats.n1.cr.XI);
  set(n31, "G31", infos.effectif);
  set(n31, "G33", infos.masseSalariale !== undefined ? Math.round(infos.masseSalariale) : undefined);
  return out;
};
