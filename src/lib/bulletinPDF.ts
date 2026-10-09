// Génération du bulletin de paie PDF (jsPDF + jsPDF-AutoTable)
// Réutilise calculerPaie() et les utilitaires fiscaux ; ne réécrit aucune logique de paie.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { enregistrerFichier, TYPE_PDF } from "@/lib/fichiers";
import { Employe, MoisData, MOIS_NOMS, TauxFiscaux, TAUX_DEFAUT } from "@/types/ebene";
import { formatMontant as formatMontantEcran, textePdf } from "@/lib/ebene-utils";

/** Montant lisible dans un PDF jsPDF (espaces ordinaires comme séparateur de milliers). */
const formatMontant = (n: number) => textePdf(formatMontantEcran(n));
import { calculerPaie, contenuBulletin, type MontantsEnregistres } from "@/lib/paie";

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
}

/**
 * Génère et télécharge le bulletin de paie PDF d'un employé pour un mois donné.
 * - En-tête : société, période, infos employé
 * - Tableau gains : salaire brut, heures sup, primes, indemnités
 * - Tableau retenues : CNSS 4%, AMU 5%, IRPP (barème progressif togolais)
 * - Net à payer
 * - Mention légale SYSCOHADA
 *
 * Pour un bulletin enregistré, passer `enregistre` : le PDF reprend alors ses
 * montants (ceux validés/payés), pas un recalcul sur les données actuelles.
 */
export const generateBulletin = (
  employe: Employe,
  moisData: MoisData,
  annee: number,
  mois: number,
  societe?: BulletinSocieteInfo | null,
  /** Taux CNSS/AMU du mois (tauxPourMois sur l'historique de la société). */
  taux: TauxFiscaux = TAUX_DEFAUT,
  /** Montants du bulletin enregistré, qui font foi s'ils sont fournis. */
  enregistre?: MontantsEnregistres | null,
): void => {
  const c = calculerPaie(employe, moisData, annee, mois, taux);
  const b = contenuBulletin(c, employe, enregistre);
  const periode = `${MOIS_NOMS[mois - 1]} ${annee}`;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // ─── En-tête société ─────────────────────────────────────────────
  const nomSociete = (societe?.nom || "SOCIÉTÉ").toUpperCase();
  const nifSociete = societe?.nif ? `NIF : ${societe.nif}` : "";
  const rccmSociete = societe?.rccm ? `RCCM : ${societe.rccm}` : "";
  const adresseSociete = [societe?.adresse, societe?.telephone].filter(Boolean).join(" • ");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(nomSociete, pageW / 2, 15, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const subline = [nifSociete, rccmSociete].filter(Boolean).join("  •  ");
  if (subline) doc.text(subline, pageW / 2, 20, { align: "center" });
  if (adresseSociete) doc.text(adresseSociete, pageW / 2, 24, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const yTitre = adresseSociete ? 32 : 28;
  doc.text(`BULLETIN DE PAIE — ${periode.toUpperCase()}`, pageW / 2, yTitre, { align: "center" });
  doc.setLineWidth(0.4);
  doc.line(14, yTitre + 3, pageW - 14, yTitre + 3);

  // ─── Identité employé ────────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const colX1 = 14;
  const colX2 = pageW / 2 + 5;
  let y = (adresseSociete ? 32 : 28) + 10;
  const line = (label: string, value: string, x: number, yy: number) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, x, yy);
    doc.setFont("helvetica", "normal");
    doc.text(value, x + 32, yy);
  };
  line("Nom :", employe.nom || "-", colX1, y);
  line("N° CNSS :", employe.numCnss || "-", colX2, y);
  y += 5;
  line("Matricule :", employe.matricule || "-", colX1, y);
  line("Date embauche :", employe.dateEmbauche || "-", colX2, y);
  y += 5;
  line("Poste :", employe.poste || "-", colX1, y);
  line("Ancienneté :", `${c.anciennete.toFixed(1)} ans`, colX2, y);
  y += 5;
  line(
    "Catégorie :",
    `${employe.categorie || "-"} - éch. ${employe.echelon || 1}`,
    colX1,
    y
  );
  line(
    "Situation :",
    `${employe.situation === "marie" ? "Marié(e)" : "Célibataire"} - ${employe.enfants} enf.`,
    colX2,
    y
  );
  y += 6;

  // ─── Tableau Gains ───────────────────────────────────────────────
  const gainsRows: Array<[string, string]> = b.gains.map((l) => [l.libelle, formatMontant(l.montant)]);

  autoTable(doc, {
    startY: y,
    head: [["GAINS", "Montant"]],
    body: gainsRows,
    foot: [["SALAIRE BRUT", formatMontant(b.brut)]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 1.6 },
    headStyles: { fillColor: [76, 81, 191], textColor: 255, halign: "left" },
    footStyles: { fillColor: [230, 230, 240], textColor: 0, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 45 } },
    margin: { left: 14, right: 14 },
  });

  // ─── Tableau Retenues ────────────────────────────────────────────
  const retenuesRows: Array<[string, string]> = b.retenues.map((l) => [l.libelle, formatMontant(l.montant)]);

  // @ts-expect-error lastAutoTable est ajouté par jspdf-autotable
  const yAfterGains = (doc.lastAutoTable?.finalY ?? y) + 4;

  autoTable(doc, {
    startY: yAfterGains,
    head: [["RETENUES", "Montant"]],
    body: retenuesRows,
    foot: [["TOTAL RETENUES", formatMontant(b.totalRetenues)]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 1.6 },
    headStyles: { fillColor: [192, 86, 86], textColor: 255, halign: "left" },
    footStyles: { fillColor: [240, 230, 230], textColor: 0, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 45 } },
    margin: { left: 14, right: 14 },
  });

  // ─── Net à payer ─────────────────────────────────────────────────
  // @ts-expect-error lastAutoTable
  const yAfterRet = (doc.lastAutoTable?.finalY ?? yAfterGains) + 4;
  autoTable(doc, {
    startY: yAfterRet,
    body: [["NET À PAYER", formatMontant(b.net)]],
    theme: "grid",
    styles: { fontSize: 12, cellPadding: 3, fontStyle: "bold" },
    bodyStyles: { fillColor: [220, 245, 220], textColor: 0 },
    columnStyles: { 1: { halign: "right", cellWidth: 60 } },
    margin: { left: 14, right: 14 },
  });

  // ─── Charges patronales (info) ───────────────────────────────────
  // @ts-expect-error lastAutoTable
  const yAfterNet = (doc.lastAutoTable?.finalY ?? yAfterRet) + 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Charges patronales (information)", 14, yAfterNet);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    `${b.libelleCnssEmp} : ${formatMontant(b.cnssEmp)}  •  ${b.libelleAmuEmp} : ${formatMontant(
      b.amuEmp
    )}  •  Coût total employeur : ${formatMontant(b.coutEmployeur)}`,
    14,
    yAfterNet + 4
  );

  // ─── Pied de page légal ──────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setLineWidth(0.2);
  doc.line(14, pageH - 22, pageW - 14, pageH - 22);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  const mention = societe?.mention_facture?.trim();
  const legal1 = mention
    ? mention
    : "Bulletin établi conformément au Code du travail togolais et à la Convention collective interprofessionnelle.";
  const legal2 =
    "Comptabilité tenue selon le référentiel SYSCOHADA révisé (Acte uniforme OHADA relatif au droit comptable et à l'information financière).";
  doc.text(legal1, pageW / 2, pageH - 17, { align: "center", maxWidth: pageW - 28 });
  doc.text(legal2, pageW / 2, pageH - 13, { align: "center", maxWidth: pageW - 28 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(
    `Édité le ${new Date().toLocaleDateString("fr-FR")}`,
    pageW - 14,
    pageH - 8,
    { align: "right" }
  );

  const filename = `Bulletin_${(employe.nom || "employe").replace(/\s+/g, "_")}_${
    MOIS_NOMS[mois - 1]
  }_${annee}.pdf`;
  void enregistrerFichier(filename, doc.output("blob"), TYPE_PDF);
};
