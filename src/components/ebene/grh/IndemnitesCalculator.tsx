import { useMemo, useState } from "react";
import { Employe } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatMontant,
  calculerAnciennete,
  dureePreavis,
  indemnitePreavis,
  indemniteLicenciement,
  indemniteRetraite,
  indemniteConges,
} from "@/lib/ebene-utils";
import { Calculator, FileDown, FileText } from "lucide-react";
import { exportElementToPDF, exportElementToWord } from "@/lib/exportDocs";
import { useSocieteActive } from "@/hooks/useSocieteContext";

interface Props {
  employes: Employe[];
}

type Motif = "licenciement_simple" | "licenciement_grave" | "licenciement_lourde" | "demission" | "retraite" | "fin_cdd";

const MOTIF_LABELS: Record<Motif, string> = {
  licenciement_simple: "Licenciement pour faute simple / motif économique",
  licenciement_grave: "Licenciement pour faute grave",
  licenciement_lourde: "Licenciement pour faute lourde",
  demission: "Démission",
  retraite: "Départ à la retraite",
  fin_cdd: "Fin de CDD",
};

export const IndemnitesCalculator = ({ employes }: Props) => {
  const societe = useSocieteActive();
  const [employeId, setEmployeId] = useState("");
  const [motif, setMotif] = useState<Motif>("licenciement_simple");
  const [dateRupture, setDateRupture] = useState(new Date().toISOString().split("T")[0]);
  const [salaireMoyenInput, setSalaireMoyenInput] = useState("");
  const [soldeConges, setSoldeConges] = useState("");

  const employe = useMemo(
    () => employes.find((e) => e.id === parseInt(employeId, 10)) || null,
    [employes, employeId]
  );

  const calcul = useMemo(() => {
    if (!employe) return null;
    const anc = calculerAnciennete(employe.dateEmbauche, new Date(dateRupture));
    const salaireMoyen =
      parseFloat(salaireMoyenInput) ||
      (employe.salaire || 0) + (employe.sursalaire || 0);
    const solde = parseFloat(soldeConges) || employe.soldeConges || 0;

    const fauteLourde = motif === "licenciement_lourde";
    const fauteGrave = motif === "licenciement_grave";

    // Préavis : pas dû en cas de faute grave/lourde
    const droitPreavis = !fauteLourde && !fauteGrave && motif !== "fin_cdd";
    const joursPreavis = droitPreavis ? dureePreavis(employe.categorie, anc) : 0;
    const montantPreavis = droitPreavis ? indemnitePreavis(employe, anc) : 0;

    // Indemnité de licenciement : seulement licenciement (sauf faute lourde)
    let indLic = 0;
    if (motif === "licenciement_simple" || motif === "licenciement_grave") {
      indLic = indemniteLicenciement(salaireMoyen, anc, fauteLourde);
    }

    // Indemnité de retraite : 75% de l'indemnité de licenciement (sans faute)
    const indRet = motif === "retraite" ? indemniteRetraite(salaireMoyen, anc) : 0;

    // Congés payés toujours dûs
    const indConges = indemniteConges(employe, solde);

    // Gratification de fin de CDD (5% du total brut, pratique courante TG)
    const gratifCDD = motif === "fin_cdd" ? salaireMoyen * 12 * anc * 0.05 : 0;

    const total = montantPreavis + indLic + indRet + indConges + gratifCDD;

    return {
      anciennete: anc,
      salaireMoyen,
      solde,
      droitPreavis,
      joursPreavis,
      montantPreavis,
      indLic,
      indRet,
      indConges,
      gratifCDD,
      fauteLourde,
      fauteGrave,
      total,
    };
  }, [employe, motif, dateRupture, salaireMoyenInput, soldeConges]);

  const exportPDF = async () => {
    const el = document.getElementById("indemnites-print");
    if (!el || !employe) return;
    await exportElementToPDF(el, `Indemnites_${employe.nom.replace(/\s+/g, "_")}_${dateRupture}`);
  };
  const exportWord = async () => {
    const el = document.getElementById("indemnites-print");
    if (!el || !employe) return;
    await exportElementToWord(el, `Indemnites_${employe.nom.replace(/\s+/g, "_")}_${dateRupture}`);
  };

  return (
    <div className="space-y-4">
      <div className="card-elevated p-4 bg-info/5 border-l-4 border-l-info">
        <p className="text-sm flex items-start gap-2">
          <Calculator className="size-4 text-info shrink-0 mt-0.5" />
          <span>
            Calcul conforme au <strong>Code du travail togolais</strong> et à la
            <strong> Convention interprofessionnelle</strong> : préavis selon catégorie/ancienneté,
            indemnité de licenciement (35% jusqu'à 5 ans, 40% de 6 à 10 ans, 45% au-delà), retraite
            = 75% de l'indemnité de licenciement.
          </span>
        </p>
      </div>

      <div className="card-elevated p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Employé *</Label>
            <Select value={employeId} onValueChange={setEmployeId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un employé" />
              </SelectTrigger>
              <SelectContent>
                {employes.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.nom} {e.matricule ? `(${e.matricule})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Motif de rupture *</Label>
            <Select value={motif} onValueChange={(v) => setMotif(v as Motif)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MOTIF_LABELS).map(([k, lbl]) => (
                  <SelectItem key={k} value={k}>
                    {lbl}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date de rupture *</Label>
            <Input
              type="date"
              value={dateRupture}
              onChange={(e) => setDateRupture(e.target.value)}
            />
          </div>
          <div>
            <Label>Salaire moyen mensuel (FCFA)</Label>
            <Input
              type="number"
              placeholder={
                employe
                  ? String((employe.salaire || 0) + (employe.sursalaire || 0))
                  : "Auto = base + sursalaire"
              }
              value={salaireMoyenInput}
              onChange={(e) => setSalaireMoyenInput(e.target.value)}
            />
          </div>
          <div>
            <Label>Solde congés non pris (jours)</Label>
            <Input
              type="number"
              step="0.5"
              placeholder={employe ? String(employe.soldeConges || 0) : "0"}
              value={soldeConges}
              onChange={(e) => setSoldeConges(e.target.value)}
            />
          </div>
        </div>
      </div>

      {employe && calcul && (
        <>
          <div className="flex flex-wrap gap-2 justify-end no-print">
            <Button size="sm" variant="outline" onClick={exportPDF} className="gap-1.5">
              <FileDown className="size-4" /> PDF
            </Button>
            <Button size="sm" variant="outline" onClick={exportWord} className="gap-1.5">
              <FileText className="size-4" /> Word
            </Button>
          </div>

          <div id="indemnites-print" className="card-elevated p-6 bg-card">
            <div className="text-center border-b-2 border-foreground pb-3 mb-4">
              {societe?.logoUrl && (
                <img src={societe.logoUrl} alt={societe.nom} className="h-12 mx-auto mb-2 object-contain" />
              )}
              <p className="font-bold text-lg">{societe?.nom || "EBENE SERVICES"}</p>
              <h3 className="text-base font-bold mt-2">
                DÉCOMPTE FINAL — {employe.nom}
              </h3>
              <p className="text-xs text-muted-foreground">
                Motif : {MOTIF_LABELS[motif]} • Date rupture : {dateRupture}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <p><strong>Matricule :</strong> {employe.matricule || "-"}</p>
              <p><strong>Poste :</strong> {employe.poste}</p>
              <p><strong>Date embauche :</strong> {employe.dateEmbauche || "-"}</p>
              <p><strong>Ancienneté :</strong> {calcul.anciennete.toFixed(2)} ans</p>
              <p><strong>Catégorie :</strong> {employe.categorie || "-"}</p>
              <p><strong>Salaire moyen :</strong> {formatMontant(calcul.salaireMoyen)}</p>
            </div>

            <table className="w-full text-sm border-collapse mb-4">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left p-2 border border-border">Indemnité</th>
                  <th className="text-left p-2 border border-border">Détail</th>
                  <th className="text-right p-2 border border-border w-32">Montant</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2 border border-border">Préavis</td>
                  <td className="p-2 border border-border text-xs">
                    {calcul.droitPreavis
                      ? `${calcul.joursPreavis} jours`
                      : calcul.fauteLourde || calcul.fauteGrave
                      ? "Non dû (faute grave/lourde)"
                      : "Non applicable"}
                  </td>
                  <td className="p-2 border border-border text-right amount">
                    {formatMontant(calcul.montantPreavis)}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 border border-border">Indemnité de licenciement</td>
                  <td className="p-2 border border-border text-xs">
                    {calcul.indLic > 0
                      ? "35%/40%/45% selon barème conv. interprof."
                      : calcul.fauteLourde
                      ? "Non due (faute lourde)"
                      : "Non applicable"}
                  </td>
                  <td className="p-2 border border-border text-right amount">
                    {formatMontant(calcul.indLic)}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 border border-border">Indemnité de départ retraite</td>
                  <td className="p-2 border border-border text-xs">
                    {motif === "retraite" ? "75% de l'indemnité de licenciement" : "Non applicable"}
                  </td>
                  <td className="p-2 border border-border text-right amount">
                    {formatMontant(calcul.indRet)}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 border border-border">Indemnité compensatrice de congés payés</td>
                  <td className="p-2 border border-border text-xs">
                    {calcul.solde} jours × salaire journalier
                  </td>
                  <td className="p-2 border border-border text-right amount">
                    {formatMontant(calcul.indConges)}
                  </td>
                </tr>
                {calcul.gratifCDD > 0 && (
                  <tr>
                    <td className="p-2 border border-border">Gratification fin CDD</td>
                    <td className="p-2 border border-border text-xs">5% du brut total</td>
                    <td className="p-2 border border-border text-right amount">
                      {formatMontant(calcul.gratifCDD)}
                    </td>
                  </tr>
                )}
                <tr className="font-bold text-base bg-success/15">
                  <td className="p-2 border border-border" colSpan={2}>
                    TOTAL DÛ
                  </td>
                  <td className="p-2 border border-border text-right amount">
                    {formatMontant(calcul.total)}
                  </td>
                </tr>
              </tbody>
            </table>

            <p className="text-xs italic text-muted-foreground border-t border-border pt-3">
              Décompte établi conformément au Code du travail togolais et à la Convention
              collective interprofessionnelle. Document à valeur indicative — à valider par les
              services compétents.
            </p>
          </div>
        </>
      )}
    </div>
  );
};
