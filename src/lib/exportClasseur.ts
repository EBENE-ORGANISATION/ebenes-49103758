/**
 * Export des données de la société en classeur Excel (un onglet par type de
 * données), et relecture de l'onglet « Taux fiscaux » pour la restauration.
 *
 * Ce module ne dépend pas de la bibliothèque Excel : il produit des lignes
 * (objets colonne → valeur) que l'appelant écrit avec `xlsx`. Les pièces
 * jointes (images, PDF) ne sont pas exportées : une cellule Excel est limitée
 * à 32 767 caractères.
 */
import {
  JOURNAL_LABELS,
  TYPE_ABSENCE_LABELS,
  TYPE_SANCTION_LABELS,
  type Activite,
  type Article,
  type CategorieArticle,
  type DonneesMensuelles,
  type Employe,
  type Fournisseur,
  type Immobilisation,
  type ParamsAnnuels,
  type Sanction,
  type TauxFiscaux,
} from "@/types/ebene";
import type * as XLSXModule from "xlsx";

export type Cellule = string | number | Date | null;
export type Ligne = Record<string, Cellule>;
export interface Feuille { nom: string; lignes: Ligne[] }

export interface DonneesExport {
  donneesMensuelles: DonneesMensuelles;
  employes: Employe[];
  paramsAnnuels: Record<string, ParamsAnnuels>;
  tauxHistorique: TauxFiscaux[];
  articles: Article[];
  fournisseurs: Fournisseur[];
  categoriesStock: CategorieArticle[];
  sanctions: Sanction[];
  immobilisations: Immobilisation[];
}

export interface ContexteExport {
  societe: string;
  activites: Activite[];
  /** Date de l'export (paramètre pour des tests reproductibles). */
  maintenant: Date;
}

export const FEUILLE_TAUX = "Taux fiscaux";

/** Fichier lisible mais mal rempli : le message dit quoi corriger. */
export class ErreurClasseur extends Error {}

/** Colonnes de l'onglet « Taux fiscaux » : relues telles quelles à l'import. */
const COLONNES_TAUX: [keyof TauxFiscaux, string][] = [
  ["dateEffet", "Date d'effet"],
  ["tva", "TVA"],
  ["is", "IS"],
  ["imfTaux", "IMF (taux)"],
  ["imfMin", "IMF (minimum)"],
  ["patenteService", "Patente service"],
  ["patenteCommerce", "Patente commerce"],
  ["cnssSal", "CNSS salarié"],
  ["cnssEmp", "CNSS employeur"],
  ["amuSal", "AMU salarié"],
  ["amuEmp", "AMU employeur"],
  ["activiteDefaut", "Activité par défaut"],
];

const STATUTS: Record<string, string> = {
  brouillon: "Brouillon", en_validation: "En validation", valide: "Validé", rejete: "Rejeté",
  en_attente: "En attente", payee: "Payée", proforma: "Proforma", annulee: "Annulée",
  envoye: "Envoyé", accepte: "Accepté", refuse: "Refusé", converti: "Converti",
  cloture: "Clôturé", actif: "Actif", cede: "Cédé", rebut: "Mis au rebut",
};
const statut = (s?: string | null) => (s ? STATUTS[s] ?? s : "");

/** « 2026-10-16 » → date Excel (minuit local, sans décalage de fuseau). */
export const dateExcel = (iso?: string | null): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

/** Clé « 2026-9 » → « 2026-09 », pour trier et filtrer. */
const moisLisible = (cle: string) => {
  const [a, m] = cle.split("-");
  return `${a}-${String(m).padStart(2, "0")}`;
};

/** Mois triés chronologiquement. */
const moisTries = (d: DonneesMensuelles) =>
  Object.keys(d).sort((x, y) => {
    const [ax, mx] = x.split("-").map(Number);
    const [ay, my] = y.split("-").map(Number);
    return ax - ay || mx - my;
  });

export function feuillesExport(d: DonneesExport, ctx: ContexteExport): Feuille[] {
  const nomActivite = new Map(ctx.activites.map((a) => [a.id, a.nom]));
  const act = (id?: string | null) => (id ? nomActivite.get(id) ?? "" : "");
  const nomEmploye = new Map(d.employes.map((e) => [e.id, e.nom]));
  const emp = (id?: number) => (id != null ? nomEmploye.get(id) ?? `#${id}` : "");
  const article = new Map(d.articles.map((a) => [a.id, a]));
  const nomFournisseur = new Map(d.fournisseurs.map((f) => [f.id, f.nom]));
  const nomCategorie = new Map(d.categoriesStock.map((c) => [c.id, c.nom]));
  const mois = moisTries(d.donneesMensuelles);
  const parMois = <T>(f: (cle: string) => T[]) => mois.flatMap(f);
  const numeroFacture = new Map(
    mois.flatMap((k) => (d.donneesMensuelles[k].factures ?? []).map((f) => [f.id, f.numero] as const)),
  );

  const operations = parMois((k) =>
    (d.donneesMensuelles[k].transactions ?? []).map((t) => ({
      "Mois": moisLisible(k),
      "Date": dateExcel(t.date),
      "Libellé": t.desc,
      "Type": t.type === "r" ? "Recette" : "Dépense",
      "Montant": Math.abs(t.m),
      "Origine": { manuelle: "Saisie", facture: "Facture", salaires: "Salaires", fournisseur: "Fournisseur" }[t.source] ?? t.source,
      "Facture": t.factureId != null ? numeroFacture.get(t.factureId) ?? "" : "",
      "Fournisseur": t.fournisseur ?? "",
      "Activité": act(t.activiteId),
      "Statut": statut(t.statut),
      "Motif de rejet": t.motifRejet ?? "",
    })),
  );

  const factures = parMois((k) =>
    (d.donneesMensuelles[k].factures ?? []).map((f) => ({
      "Mois": moisLisible(k),
      "Numéro": f.numero,
      "Date": dateExcel(f.date),
      "Client": f.client,
      "Statut": statut(f.statut),
      "Validation": statut(f.statutValidation),
      "Réduction": f.reduction ?? 0,
      "Total HT": f.totalHT,
      "TVA": f.totalTva,
      "Taxe de séjour": f.taxeSejour ?? 0,
      "Total TTC": f.totalTtc,
      "Encaissement": f.compteTresorerie === "521" ? "Banque" : f.compteTresorerie === "571" ? "Caisse" : "",
      "Activité": act(f.activiteId),
    })),
  );

  const lignesDocs = (type: "factures" | "devis") =>
    parMois((k) =>
      (d.donneesMensuelles[k][type] ?? []).flatMap((doc) =>
        doc.lignes.map((l) => ({
          [type === "factures" ? "Facture" : "Devis"]: doc.numero,
          "Description": l.description,
          "Article": l.articleId != null ? article.get(l.articleId)?.reference ?? "" : "",
          "Quantité": l.quantite ?? null,
          "Prix unitaire": l.prixUnitaire ?? null,
          "Montant": l.montant,
          "Activité": act(l.activiteId ?? doc.activiteId),
        })),
      ),
    );

  const devis = parMois((k) =>
    (d.donneesMensuelles[k].devis ?? []).map((v) => ({
      "Mois": moisLisible(k),
      "Numéro": v.numero,
      "Date": dateExcel(v.date),
      "Validité": dateExcel(v.dateValidite),
      "Client": v.client,
      "Statut": statut(v.statut),
      "Réduction": v.reduction ?? 0,
      "Total HT": v.totalHT,
      "TVA": v.totalTva,
      "Total TTC": v.totalTtc,
      "Facture": v.factureId != null ? numeroFacture.get(v.factureId) ?? "" : "",
      "Activité": act(v.activiteId),
      "Notes": v.notes ?? "",
    })),
  );

  const ecritures = parMois((k) =>
    (d.donneesMensuelles[k].ecritures ?? []).flatMap((e) =>
      e.lignes.map((l) => ({
        "Mois": moisLisible(k),
        "Date": dateExcel(e.date),
        "Journal": `${e.journal} — ${JOURNAL_LABELS[e.journal] ?? ""}`,
        "N° pièce": e.numeroPiece,
        "Libellé": e.libelle,
        "Compte": l.compte,
        "Intitulé": l.intitule,
        "Débit": l.debit || 0,
        "Crédit": l.credit || 0,
        "Tiers": l.tiers ?? "",
        "Statut": statut(e.statut),
        "Activité": act(l.activiteId ?? e.activiteId),
      })),
    ),
  );

  const mouvements = parMois((k) =>
    (d.donneesMensuelles[k].mouvementsStock ?? []).map((m) => {
      const a = article.get(m.articleId);
      return {
        "Mois": moisLisible(k),
        "Date": dateExcel(m.date),
        "Référence article": a?.reference ?? `#${m.articleId}`,
        "Désignation": a?.designation ?? "",
        "Type": { entree: "Entrée", sortie: "Sortie", ajustement: "Ajustement" }[m.type] ?? m.type,
        "Quantité": m.quantite,
        "Prix unitaire": m.prixUnitaire ?? null,
        "Motif": m.motif ?? "",
        "Référence": m.reference ?? "",
        "Activité": act(m.activiteId),
      };
    }),
  );

  const absences = parMois((k) =>
    (d.donneesMensuelles[k].absences ?? []).map((a) => ({
      "Mois": moisLisible(k),
      "Employé": emp(a.employeId),
      "Type": TYPE_ABSENCE_LABELS[a.type]?.label ?? a.type,
      "Début": dateExcel(a.dateDebut),
      "Fin": dateExcel(a.dateFin),
      "Jours": a.jours,
      "Motif": a.motif ?? "",
      "Statut": statut(a.statutValidation),
    })),
  );

  const primes = parMois((k) =>
    Object.entries(d.donneesMensuelles[k].primes ?? {}).flatMap(([id, liste]) =>
      (liste ?? []).map((p) => ({
        "Mois": moisLisible(k),
        "Employé": emp(Number(id)),
        "Libellé": p.libelle,
        "Montant": p.montant,
        "Statut": statut(p.statutValidation),
      })),
    ),
  );

  const heuresSup = parMois((k) =>
    Object.entries(d.donneesMensuelles[k].heuresSup ?? {}).map(([id, h]) => ({
      "Mois": moisLisible(k),
      "Employé": emp(Number(id)),
      "41e à 48e heure (+20 %)": h.jourSemaine ?? 0,
      "Au-delà de 48 h (+40 %)": h.jourSup ?? 0,
      "Dimanche et férié (+65 %)": h.dimancheFerie ?? 0,
      "Nuit semaine (+65 %)": h.nuitSemaine ?? 0,
      "Nuit dimanche et férié (+100 %)": h.nuitDimancheFerie ?? 0,
      "Statut": statut(h.statutValidation),
    })),
  );

  const retenues = parMois((k) =>
    Object.entries(d.donneesMensuelles[k].retenues ?? {})
      .filter(([, montant]) => montant)
      .map(([id, montant]) => ({ "Mois": moisLisible(k), "Employé": emp(Number(id)), "Montant": montant })),
  );

  const employes = d.employes.map((e) => ({
    "Matricule": e.matricule ?? "",
    "Nom": e.nom,
    "Poste": e.poste,
    "Activité": act(e.activiteId),
    "Répartition": (e.repartition ?? []).map((r) => `${act(r.activiteId)} ${r.part} %`).join(" ; "),
    "Sexe": e.sexe ?? "",
    "Date de naissance": dateExcel(e.dateNaissance),
    "Lieu de naissance": e.lieuNaissance ?? "",
    "Nationalité": e.nationalite ?? "",
    "CNI": e.cni ?? "",
    "N° CNSS": e.numCnss ?? "",
    "Adresse": e.adresse ?? "",
    "Téléphone": e.telephone ?? "",
    "E-mail": e.email ?? "",
    "Situation": e.situation === "marie" ? "Marié(e)" : "Célibataire",
    "Enfants": e.enfants,
    "Type de contrat": (e.typeContrat ?? "").toUpperCase(),
    "Date d'embauche": dateExcel(e.dateEmbauche),
    "Fin de contrat": dateExcel(e.dateFinContrat),
    "Catégorie": e.categorie ?? "",
    "Échelon": e.echelon ?? null,
    "Qualification": e.qualification ?? "",
    "Salaire de base": e.salaire,
    "Sursalaire": e.sursalaire ?? 0,
    "Indemnité de transport": e.indemniteTransport ?? 0,
    "Indemnité de logement": e.indemniteLogement ?? 0,
    "Indemnité de fonction": e.indemniteFonction ?? 0,
    "Intérêts prêt immobilier": e.interetPretImmobilier ?? 0,
    "Assurance vie": e.assuranceVie ?? 0,
    "Retraite complémentaire": e.retraiteComplementaire ?? 0,
    "Congés de reprise (j)": e.soldeConges ?? 0,
    "Statut": statut(e.statutValidation ?? "valide"),
  }));

  const sanctions = d.sanctions.map((s) => ({
    "Date": dateExcel(s.date),
    "Employé": emp(s.employeId),
    "Type": TYPE_SANCTION_LABELS[s.type] ?? s.type,
    "Motif": s.motif,
    "Jours de mise à pied": s.joursMiseAPied ?? null,
    "Observations": s.observations ?? "",
    "Statut": statut(s.statutValidation),
  }));

  const articles = d.articles.map((a) => ({
    "Référence": a.reference,
    "Désignation": a.designation,
    "Catégorie": a.categorieId != null ? nomCategorie.get(a.categorieId) ?? "" : "",
    "Nature": { marchandise: "Marchandise", matiere: "Matière", consommable: "Consommable" }[a.nature ?? "marchandise"],
    "Unité": a.unite,
    "Stock": a.stock,
    "Seuil d'alerte": a.seuilAlerte,
    "Prix d'achat (PMP)": a.prixAchat,
    "Prix de vente": a.prixVente,
    "Valeur du stock": Math.round(a.stock * a.prixAchat),
    "Fournisseur": a.fournisseurId != null ? nomFournisseur.get(a.fournisseurId) ?? "" : "",
    "Emplacement": a.emplacement ?? "",
    "Activité": act(a.activiteId),
    "Description": a.description ?? "",
  }));

  const fournisseurs = d.fournisseurs.map((f) => ({
    "Nom": f.nom, "Contact": f.contact ?? "", "Téléphone": f.telephone ?? "", "E-mail": f.email ?? "", "Adresse": f.adresse ?? "",
  }));

  const categories = d.categoriesStock.map((c) => ({ "Catégorie": c.nom }));

  const immobilisations = d.immobilisations.map((i) => ({
    "Libellé": i.libelle,
    "Catégorie": i.categorie ?? "",
    "Date d'acquisition": dateExcel(i.dateAcquisition),
    "Valeur d'origine": i.valeurOrigine,
    "Durée (ans)": i.dureeAmortissement,
    "Méthode": i.methode === "degressif" ? "Dégressif" : "Linéaire",
    "Valeur résiduelle": i.valeurResiduelle ?? 0,
    "Compte d'actif": i.comptesSYSCOHADA?.actif ?? "",
    "Compte d'amortissement": i.comptesSYSCOHADA?.amortissementCumule ?? "",
    "Compte de dotation": i.comptesSYSCOHADA?.dotation ?? "",
    "Statut": statut(i.statut ?? "actif"),
    "Date de cession": dateExcel(i.dateCession),
    "Prix de cession": i.valeurCession ?? null,
    "Plus ou moins-value": i.plusMoinsValue ?? null,
    "Activité": act(i.activiteId),
    "Notes": i.notes ?? "",
  }));

  const taux = [...d.tauxHistorique]
    .sort((a, b) => a.dateEffet.localeCompare(b.dateEffet))
    .map((t) => Object.fromEntries(COLONNES_TAUX.map(([cle, titre]) => [titre, t[cle]])) as Ligne);

  const params = Object.entries(d.paramsAnnuels ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([annee, p]) => ({
      "Année": Number(annee) || annee,
      "Taxe d'habitation": p.th ?? 0,
      "Loyer annuel": p.loyerAnnuel ?? 0,
      "Activité dominante": p.activite === "commerce" ? "Commerce" : p.activite === "service" ? "Service" : "",
    }));

  const contenu: Feuille[] = [
    { nom: "Opérations", lignes: operations },
    { nom: "Factures", lignes: factures },
    { nom: "Lignes de factures", lignes: lignesDocs("factures") },
    { nom: "Devis", lignes: devis },
    { nom: "Lignes de devis", lignes: lignesDocs("devis") },
    { nom: "Écritures", lignes: ecritures },
    { nom: "Mouvements de stock", lignes: mouvements },
    { nom: "Articles", lignes: articles },
    { nom: "Fournisseurs", lignes: fournisseurs },
    { nom: "Catégories de stock", lignes: categories },
    { nom: "Immobilisations", lignes: immobilisations },
    { nom: "Employés", lignes: employes },
    { nom: "Absences", lignes: absences },
    { nom: "Primes", lignes: primes },
    { nom: "Heures supplémentaires", lignes: heuresSup },
    { nom: "Retenues", lignes: retenues },
    { nom: "Sanctions", lignes: sanctions },
    { nom: FEUILLE_TAUX, lignes: taux },
    { nom: "Paramètres annuels", lignes: params },
  ];

  const lisezMoi: Feuille = {
    nom: "Lisez-moi",
    lignes: [
      { "Rubrique": "Société", "Valeur": ctx.societe },
      { "Rubrique": "Exporté le", "Valeur": ctx.maintenant },
      { "Rubrique": "Période", "Valeur": mois.length ? `${moisLisible(mois[0])} à ${moisLisible(mois[mois.length - 1])}` : "" },
      { "Rubrique": "Pièces jointes", "Valeur": "Non incluses (justificatifs, photos et PDF restent dans l'application)." },
      { "Rubrique": "Importer Excel", "Valeur": `Seul l'onglet « ${FEUILLE_TAUX} » est relu : les autres données ne sont pas modifiées.` },
      ...contenu.map((f) => ({ "Rubrique": `Onglet « ${f.nom} »`, "Valeur": `${f.lignes.length} ligne${f.lignes.length > 1 ? "s" : ""}` })),
    ],
  };

  return [lisezMoi, ...contenu];
}

/**
 * Écrit les onglets dans un classeur .xlsx : dates au format jj/mm/aaaa,
 * colonnes à la largeur de leur contenu, « Aucune donnée » pour un onglet vide.
 */
export function classeurXlsx(XLSX: typeof XLSXModule, feuilles: Feuille[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const f of feuilles) {
    const ws = f.lignes.length
      ? XLSX.utils.json_to_sheet(f.lignes, { dateNF: "dd/mm/yyyy", cellDates: true })
      : XLSX.utils.aoa_to_sheet([["Aucune donnée"]]);
    const titres = f.lignes.length ? Object.keys(f.lignes[0]) : ["Aucune donnée"];
    ws["!cols"] = titres.map((t) => {
      const largeur = Math.max(t.length, ...f.lignes.slice(0, 500).map((l) => {
        const v = l[t];
        return v instanceof Date ? 10 : String(v ?? "").length;
      }));
      return { wch: Math.min(60, Math.max(8, largeur + 2)) };
    });
    XLSX.utils.book_append_sheet(wb, ws, f.nom);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const nombre = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const isoDepuis = (v: unknown): string | null => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "string") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (iso) return v.trim();
    const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
    if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  }
  return null;
};

/**
 * Relit les lignes de l'onglet « Taux fiscaux » (objets titre → valeur).
 * Lève une erreur explicite si une ligne est incomplète ou illisible.
 */
export function lireTauxClasseur(lignes: Record<string, unknown>[]): TauxFiscaux[] {
  return lignes.map((l, i) => {
    const n = i + 2; // ligne Excel (en-tête en ligne 1)
    const dateEffet = isoDepuis(l["Date d'effet"]);
    if (!dateEffet) throw new ErreurClasseur(`Ligne ${n} : date d'effet illisible.`);
    const t = { dateEffet } as TauxFiscaux;
    for (const [cle, titre] of COLONNES_TAUX) {
      if (cle === "dateEffet") continue;
      if (cle === "activiteDefaut") {
        const a = String(l[titre] ?? "").trim().toLowerCase();
        if (a !== "service" && a !== "commerce") throw new ErreurClasseur(`Ligne ${n} : « ${titre} » doit valoir service ou commerce.`);
        t.activiteDefaut = a;
        continue;
      }
      const v = nombre(l[titre]);
      if (v === null) throw new ErreurClasseur(`Ligne ${n} : « ${titre} » manquant ou non numérique.`);
      (t as unknown as Record<string, number>)[cle] = v;
    }
    return t;
  });
}
