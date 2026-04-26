import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Employe, MoisData, MOIS_NOMS } from "@/types/ebene";
import { formatMontant } from "@/lib/ebene-utils";
import { calculerPaie } from "@/components/ebene/grh/BulletinPaie";

/**
 * Génère et télécharge un bulletin de paie PDF pour un employé donné.
 *
 * Utilise la logique de calcul existante (`calculerPaie`) qui s'appuie
 * sur `calculerIRPP` (barème progressif togolais) défini dans
 * `src/lib/ebene-utils.ts` — la logique paie n'est PAS réécrite ici.
 *
 * NB: les taux CNSS/AMU effectivement appliqués proviennent du moteur
 * paie de l'application (CNSS salarié 4%, AMU salarié 5%).
 */
export const generateBulletin = (
  employe: Employe,
  moisData: MoisData,
  annee: number,
  mois: number
): void => {
  const c = calculerPaie(employe, moisData);
  const moisLabel = MOIS_NOMS[mois - 1] || String(mois);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;
  let y = 40;

  // En-tête
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("EBENE SERVICES", pageWidth / 2, y, { align: "center" });
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("NIF : 1 002 088 759", pageWidth / 2, y, { align: "center" });
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(
    `BULLETIN DE PAIE — ${moisLabel.toUpperCase()} ${annee}`,
    pageWidth / 2,
    y,
    { align: "center" }
  );
  y += 10;
  doc.setDrawColor(0);
  doc.setLineWidth(1);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 14;

  // Infos employé
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const colW = (pageWidth - marginX * 2) / 2;
  const left: Array<[string, string]> = [
    ["Nom", employe.nom],
    ["Matricule", employe.matricule || "-"],
    ["Poste", employe.poste],
    ["Catégorie", `${employe.categorie || "-"} - Échelon ${employe.echelon || 1}`],
  ];
  const right: Array<[string, string]> = [
    ["N° CNSS", employe.numCnss || "-"],
    ["Date embauche", employe.dateEmbauche || "-"],
    ["Ancienneté", `${c.anciennete.toFixed(1)} ans`],
    [
      "Situation",
      `${employe.situation === "marie" ? "Marié(e)" : "Célibataire"} - ${employe.enfants} enf.`,
    ],
  ];
  const startY = y;
  left.forEach(([k, v], i) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k} :`, marginX, startY + i * 13);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), marginX + 80, startY + i * 13);
  });
  right.forEach(([k, v], i) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k} :`, marginX + colW, startY + i * 13);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), marginX + colW + 90, startY + i * 13);
  });
  y = startY + Math.max(left.length, right.length) * 13 + 10;

  // GAINS
  const gains: Array<[string, string]> = [["Salaire de base", formatMontant(c.base)]];
  if (c.sursalaire > 0) gains.push(["Sursalaire", formatMontant(c.sursalaire)]);
  if (c.primeAnciennete > 0)
    gains.push([
      `Prime d'ancienneté (${(c.tauxAnc * 100).toFixed(0)}%)`,
      formatMontant(c.primeAnciennete),
    ]);
  if (c.hsMontant > 0) gains.push(["Heures supplémentaires", formatMontant(c.hsMontant)]);
  c.primes.forEach((p) =>
    gains.push([`Prime : ${p.libelle}`, formatMontant(p.montant)])
  );
  if ((employe.indemniteTransport || 0) > 0)
    gains.push(["Indemnité transport", formatMontant(employe.indemniteTransport!)]);
  if ((employe.indemniteLogement || 0) > 0)
    gains.push(["Indemnité logement", formatMontant(employe.indemniteLogement!)]);
  if ((employe.indemniteFonction || 0) > 0)
    gains.push(["Indemnité fonction", formatMontant(employe.indemniteFonction!)]);

  autoTable(doc, {
    startY: y,
    head: [["GAINS", "Montant"]],
    body: gains,
    foot: [["SALAIRE BRUT", formatMontant(c.brut)]],
    theme: "grid",
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [230, 230, 250], textColor: 0, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: marginX, right: marginX },
  });
  // @ts-expect-error jspdf-autotable enrichit doc.lastAutoTable
  y = doc.lastAutoTable.finalY + 10;

  // RETENUES
  const retenues: Array<[string, string]> = [
    ["CNSS salarié (4%)", formatMontant(c.cnssSal)],
    ["AMU salarié (5%)", formatMontant(c.amuSal)],
    ["IRPP (barème progressif Togo)", formatMontant(c.irpp)],
  ];
  if (c.deductionSansSolde > 0)
    retenues.push([
      `Congés sans solde (${c.joursSansSolde} j)`,
      formatMontant(c.deductionSansSolde),
    ]);
  if (c.retenuesDiverses > 0)
    retenues.push(["Retenues diverses", formatMontant(c.retenuesDiverses)]);

  autoTable(doc, {
    startY: y,
    head: [["RETENUES", "Montant"]],
    body: retenues,
    foot: [["TOTAL RETENUES", formatMontant(c.totalRetenues)]],
    theme: "grid",
    headStyles: { fillColor: [220, 53, 69], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [255, 230, 230], textColor: 0, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: marginX, right: marginX },
  });
  // @ts-expect-error jspdf-autotable enrichit doc.lastAutoTable
  y = doc.lastAutoTable.finalY + 10;

  // NET À PAYER
  autoTable(doc, {
    startY: y,
    body: [["NET À PAYER", formatMontant(c.net)]],
    theme: "grid",
    styles: {
      fontSize: 12,
      cellPadding: 8,
      fontStyle: "bold",
      fillColor: [212, 237, 218],
      textColor: [21, 87, 36],
    },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: marginX, right: marginX },
  });
  // @ts-expect-error jspdf-autotable enrichit doc.lastAutoTable
  y = doc.lastAutoTable.finalY + 12;

  // Charges patronales
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Charges patronales", marginX, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    `CNSS employeur (17,5%) : ${formatMontant(c.cnssEmp)}   •   AMU employeur (5%) : ${formatMontant(c.amuEmp)}`,
    marginX,
    y
  );
  y += 11;
  doc.setFont("helvetica", "bold");
  doc.text(`Coût total employeur : ${formatMontant(c.coutEmployeur)}`, marginX, y);
  y += 18;

  // Mentions légales / SYSCOHADA
  doc.setDrawColor(150);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 12;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  const footer = [
    "Bulletin établi conformément au Code du travail togolais et à la Convention collective interprofessionnelle.",
    "IRPP calculé selon le barème progressif togolais. CNSS et AMU prélevés selon les taux réglementaires en vigueur.",
    "Comptabilisation conforme au référentiel SYSCOHADA révisé (Acte uniforme OHADA relatif au droit comptable et à l'information financière).",
    "Document à conserver — pièce justificative comptable (compte 661 - Charges de personnel).",
  ];
  footer.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, pageWidth - marginX * 2);
    doc.text(wrapped, marginX, y);
    y += wrapped.length * 9;
  });

  const filename = `Bulletin_${employe.nom.replace(/\s+/g, "_")}_${moisLabel}_${annee}.pdf`;
  doc.save(filename);
};
