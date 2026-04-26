import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import type { DonneesMensuelles, Transaction } from "@/types/ebene";
import { moisKey } from "@/lib/ebene-utils";

/**
 * Export comptable SYSCOHADA Révisé.
 *
 * Génère un classeur Excel à deux feuilles :
 *  - "Grand-livre" : journal chronologique (date, n° pièce, libellé, débit, crédit, solde courant)
 *  - "Balance"     : balance générale par compte (totaux + soldes débiteur/créditeur)
 *
 * Le mapping vers le plan comptable SYSCOHADA est heuristique :
 * il s'appuie sur la `source` de la transaction (facture / salaires / fournisseur / manuelle)
 * et sur des mots-clés présents dans la description ou le libellé fournisseur.
 * Les écritures non identifiées tombent dans des comptes par défaut (758 produits divers,
 * 658 charges diverses).
 *
 * NB : seules les transactions au statut « valide » (ou héritées sans statut) sont reportées.
 */

/** Classes principales SYSCOHADA utilisées pour le mapping. */
export const SYSCOHADA_COMPTES: Record<string, string> = {
  // Classe 4 — Tiers
  "401": "Fournisseurs, dettes en compte",
  "411": "Clients",
  "421": "Personnel - rémunérations dues",
  "422": "Personnel - rémunérations à payer",
  "431": "CNSS - cotisations sociales",
  "442": "État - autres impôts et taxes (TVA, IRPP)",
  "447": "État - impôts retenus à la source (IRPP)",
  // Classe 5 — Trésorerie
  "521": "Banques",
  "571": "Caisse",
  // Classe 6 — Charges
  "601": "Achats de marchandises",
  "604": "Achats stockés - matières et fournitures",
  "605": "Autres achats (eau, électricité, fournitures)",
  "611": "Transports sur achats",
  "613": "Locations et charges locatives",
  "618": "Divers frais (téléphone, internet)",
  "624": "Entretien, réparations et maintenance",
  "625": "Primes d'assurance",
  "627": "Publicité, publications, relations publiques",
  "628": "Frais bancaires et de télécommunication",
  "641": "Impôts et taxes directs (patente, TH, RSL)",
  "658": "Charges diverses d'exploitation",
  "661": "Rémunérations directes versées au personnel",
  "664": "Charges sociales (CNSS employeur, AMU)",
  // Classe 7 — Produits
  "701": "Ventes de marchandises",
  "706": "Services vendus",
  "758": "Produits divers de gestion courante",
};

/** Détecte le compte SYSCOHADA débité ou crédité pour une transaction donnée. */
const mapperCompte = (t: Transaction): string => {
  const desc = (t.desc || "").toLowerCase();
  const four = (t.fournisseur || "").toLowerCase();
  const haystack = `${desc} ${four}`;

  // ─── Recettes ────────────────────────────────────────────────────────────
  if (t.type === "r") {
    if (t.source === "facture") {
      // Vente de services par défaut, marchandises si activité commerce.
      return t.activite === "commerce" ? "701" : "706";
    }
    if (/vente|marchandise/.test(haystack)) return "701";
    if (/prestation|service|honoraire/.test(haystack)) return "706";
    return "758";
  }

  // ─── Dépenses ────────────────────────────────────────────────────────────
  if (t.source === "salaires" || /salaire|paie|rémun/.test(haystack)) return "661";
  if (/cnss|amu|sécurité sociale|secu/.test(haystack)) return "664";
  if (/tva|irpp|impôt|impot|patente|taxe|th |rsl/.test(haystack)) return "641";
  if (/loyer|location/.test(haystack)) return "613";
  if (/transport|carburant|essence/.test(haystack)) return "611";
  if (/eau|électric|electric|edf|ceet/.test(haystack)) return "605";
  if (/téléph|telephon|internet|togocom|moov/.test(haystack)) return "618";
  if (/entretien|réparation|reparation|maintenance/.test(haystack)) return "624";
  if (/assurance/.test(haystack)) return "625";
  if (/publicité|publicite|marketing|pub /.test(haystack)) return "627";
  if (/banque|frais bancaires|agios/.test(haystack)) return "628";
  if (/achat marchandise/.test(haystack)) return "601";
  if (/achat|fourniture|matière|matiere/.test(haystack) || t.source === "fournisseur") return "604";

  return "658";
};

/** Compte de contrepartie trésorerie. */
const compteTresorerie = "521"; // Banque par défaut

interface LigneJournal {
  date: string;
  piece: string;
  compte: string;
  libelleCompte: string;
  desc: string;
  debit: number;
  credit: number;
}

const construireLignes = (
  annee: number,
  donneesMensuelles: DonneesMensuelles
): LigneJournal[] => {
  const lignes: LigneJournal[] = [];
  let pieceSeq = 1;
  for (let mois = 1; mois <= 12; mois++) {
    const m = donneesMensuelles[moisKey(annee, mois)];
    if (!m) continue;
    const transactions = (m.transactions || [])
      .filter((t) => !t.statut || t.statut === "valide")
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));

    for (const t of transactions) {
      const piece = `PC${String(pieceSeq).padStart(5, "0")}`;
      pieceSeq++;
      const montant = Math.abs(t.m);
      const compte = mapperCompte(t);
      const libCompte = SYSCOHADA_COMPTES[compte] || "Compte non identifié";
      const libTreso = SYSCOHADA_COMPTES[compteTresorerie];

      if (t.type === "r") {
        // Trésorerie au débit, produit au crédit
        lignes.push({
          date: t.date,
          piece,
          compte: compteTresorerie,
          libelleCompte: libTreso,
          desc: t.desc,
          debit: montant,
          credit: 0,
        });
        lignes.push({
          date: t.date,
          piece,
          compte,
          libelleCompte: libCompte,
          desc: t.desc,
          debit: 0,
          credit: montant,
        });
      } else {
        // Charge au débit, trésorerie au crédit
        lignes.push({
          date: t.date,
          piece,
          compte,
          libelleCompte: libCompte,
          desc: t.desc,
          debit: montant,
          credit: 0,
        });
        lignes.push({
          date: t.date,
          piece,
          compte: compteTresorerie,
          libelleCompte: libTreso,
          desc: t.desc,
          debit: 0,
          credit: montant,
        });
      }
    }
  }
  return lignes;
};

/** Construit la feuille Grand-livre regroupée par compte (présentation classique). */
const buildGrandLivreSheet = (lignes: LigneJournal[]) => {
  // Regroupement par compte avec solde courant.
  const parCompte = new Map<string, LigneJournal[]>();
  lignes.forEach((l) => {
    if (!parCompte.has(l.compte)) parCompte.set(l.compte, []);
    parCompte.get(l.compte)!.push(l);
  });

  const rows: (string | number)[][] = [];
  rows.push(["Date", "N° pièce", "Libellé", "Débit", "Crédit", "Solde"]);

  const comptesTries = Array.from(parCompte.keys()).sort();
  for (const compte of comptesTries) {
    const items = parCompte.get(compte)!;
    const libCompte = SYSCOHADA_COMPTES[compte] || "—";
    rows.push([`Compte ${compte} — ${libCompte}`, "", "", "", "", ""]);
    let solde = 0;
    for (const l of items) {
      solde += l.debit - l.credit;
      rows.push([l.date, l.piece, l.desc, l.debit || "", l.credit || "", solde]);
    }
    rows.push(["", "", "Total", sum(items, "debit"), sum(items, "credit"), solde]);
    rows.push(["", "", "", "", "", ""]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 50 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];
  return ws;
};

/** Construit la feuille Balance générale par compte. */
const buildBalanceSheet = (lignes: LigneJournal[]) => {
  const totals = new Map<string, { debit: number; credit: number }>();
  lignes.forEach((l) => {
    const cur = totals.get(l.compte) || { debit: 0, credit: 0 };
    cur.debit += l.debit;
    cur.credit += l.credit;
    totals.set(l.compte, cur);
  });

  const rows: (string | number)[][] = [];
  rows.push([
    "Compte",
    "Libellé",
    "Total débit",
    "Total crédit",
    "Solde débiteur",
    "Solde créditeur",
  ]);

  let totalDebit = 0;
  let totalCredit = 0;
  let totalSD = 0;
  let totalSC = 0;

  Array.from(totals.keys())
    .sort()
    .forEach((compte) => {
      const { debit, credit } = totals.get(compte)!;
      const solde = debit - credit;
      const sd = solde > 0 ? solde : 0;
      const sc = solde < 0 ? -solde : 0;
      totalDebit += debit;
      totalCredit += credit;
      totalSD += sd;
      totalSC += sc;
      rows.push([
        compte,
        SYSCOHADA_COMPTES[compte] || "—",
        debit,
        credit,
        sd || "",
        sc || "",
      ]);
    });

  rows.push(["", "TOTAUX", totalDebit, totalCredit, totalSD, totalSC]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 10 },
    { wch: 45 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
  ];
  return ws;
};

const sum = (rows: LigneJournal[], k: "debit" | "credit") =>
  rows.reduce((a, l) => a + (l[k] || 0), 0);

/**
 * Génère et télécharge le classeur SYSCOHADA pour l'année donnée.
 */
export const exportGrandLivre = (
  annee: number,
  donneesMensuelles: DonneesMensuelles
): void => {
  const lignes = construireLignes(annee, donneesMensuelles);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildGrandLivreSheet(lignes), "Grand-livre");
  XLSX.utils.book_append_sheet(wb, buildBalanceSheet(lignes), "Balance");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, `EBENE_SYSCOHADA_${annee}.xlsx`);
};