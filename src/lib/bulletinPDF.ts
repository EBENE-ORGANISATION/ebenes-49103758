// Génération du bulletin de paie PDF (jsPDF + jsPDF-AutoTable)
// Réutilise calculerPaie() et les utilitaires fiscaux ; ne réécrit aucune logique de paie.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Employe, MoisData, MOIS_NOMS } from "@/types/ebene";
import { formatMontant } from "@/lib/ebene-utils";
import { calculerPaie } from "@/components/ebene/grh/BulletinPaie";

/**
 * Génère et télécharge le bulletin de paie PDF d'un employé pour un mois donné.
 * - En-tête : société, période, infos employé
 * - Tableau gains : salaire brut, heures sup, primes, indemnités
 * - Tableau retenues : CNSS 4%, AMU 5%, IRPP (barème progressif togolais)
 * - Net à payer
 * - Mention légale SYSCOHADA
 */
export const generateBulletin = (
  employe: Employe,
  moisData: MoisData,
  annee: number,
  mois: number
): void => {
  const c = calculerPaie(employe, moisData);
  const periode = `${MOIS_NOMS[mois - 1]} ${annee}`;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // ─── En-tête société ─────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("EBENE SERVICES", pageW / 2, 15, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("NIF : 1 002 088 759", pageW / 2, 20, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`BULLETIN DE PAIE — ${periode.toUpperCase()}`, pageW / 2, 28, { align: "center" });
  doc.setLineWidth(0.4);
  doc.line(14, 31, pageW - 14, 31);

  // ─── Identité employé ────────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const colX1 = 14;
  const colX2 = pageW / 2 + 5;
  let y = 38;
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
  const gainsRows: Array<[string, string]> = [];
  gainsRows.push(["Salaire de base", formatMontant(c.base)]);
  if (c.sursalaire > 0) gainsRows.push(["Sursalaire", formatMontant(c.sursalaire)]);
  if (c.primeAnciennete > 0)
    gainsRows.push([
      `Prime d'ancienneté (${(c.tauxAnc * 100).toFixed(0)}%)`,
      formatMontant(c.primeAnciennete),
    ]);
  if (c.hsMontant > 0) gainsRows.push(["Heures supplémentaires", formatMontant(c.hsMontant)]);
  c.primes.forEach((p) =>
    gainsRows.push([`Prime : ${p.libelle}`, formatMontant(p.montant)])
  );
  if ((employe.indemniteTransport || 0) > 0)
    gainsRows.push(["Indemnité transport", formatMontant(employe.indemniteTransport!)]);
  if ((employe.indemniteLogement || 0) > 0)
    gainsRows.push(["Indemnité logement", formatMontant(employe.indemniteLogement!)]);
  if ((employe.indemniteFonction || 0) > 0)
    gainsRows.push(["Indemnité fonction", formatMontant(employe.indemniteFonction!)]);

  autoTable(doc, {
    startY: y,
    head: [["GAINS", "Montant"]],
    body: gainsRows,
    foot: [["SALAIRE BRUT", formatMontant(c.brut)]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 1.6 },
    headStyles: { fillColor: [76, 81, 191], textColor: 255, halign: "left" },
    footStyles: { fillColor: [230, 230, 240], textColor: 0, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 45 } },
    margin: { left: 14, right: 14 },
  });

  // ─── Tableau Retenues ────────────────────────────────────────────
  const retenuesRows: Array<[string, string]> = [
    ["CNSS salarié (4%)", formatMontant(c.cnssSal)],
    ["AMU salarié (5%)", formatMontant(c.amuSal)],
    ["IRPP (barème progressif Togo)", formatMontant(c.irpp)],
  ];
  if (c.deductionSansSolde > 0)
    retenuesRows.push([
      `Congés sans solde (${c.joursSansSolde} j)`,
      formatMontant(c.deductionSansSolde),
    ]);
  if (c.retenuesDiverses > 0)
    retenuesRows.push(["Retenues diverses", formatMontant(c.retenuesDiverses)]);

  // @ts-expect-error lastAutoTable est ajouté par jspdf-autotable
  const yAfterGains = (doc.lastAutoTable?.finalY ?? y) + 4;

  autoTable(doc, {
    startY: yAfterGains,
    head: [["RETENUES", "Montant"]],
    body: retenuesRows,
    foot: [["TOTAL RETENUES", formatMontant(c.totalRetenues)]],
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
    body: [["NET À PAYER", formatMontant(c.net)]],
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
    `CNSS employeur (17,5%) : ${formatMontant(c.cnssEmp)}  •  AMU employeur (5%) : ${formatMontant(
      c.amuEmp
    )}  •  Coût total employeur : ${formatMontant(c.coutEmployeur)}`,
    14,
    yAfterNet + 4
  );

  // ─── Pied de page légal ──────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setLineWidth(0.2);
  doc.line(14, pageH - 22, pageW - 14, pageH - 22);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  const legal1 =
    "Bulletin établi conformément au Code du travail togolais et à la Convention collective interprofessionnelle.";
  const legal2 =
    "Comptabilité tenue selon le référentiel SYSCOHADA révisé (Acte uniforme OHADA relatif au droit comptable et à l'information financière).";
  doc.text(legal1, pageW / 2, pageH - 17, { align: "center" });
  doc.text(legal2, pageW / 2, pageH - 13, { align: "center" });
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
  doc.save(filename);
};
