// Génération des états financiers complets dans le modèle officiel (liasse
// du système normal ou du SMT), à partir des données de toute la société.
import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DonneesMensuelles } from "@/types/ebene";
import { useTenant } from "@/hooks/useTenant";
import { saveFileViaElectron } from "@/lib/platform";
import { todayISO } from "@/lib/ebene-utils";
import { formatSolde } from "@/lib/ebene-utils";
import { genererLiasse, MODELES, systemeDuRegime, type SystemeLiasse } from "@/lib/liasse/genererLiasse";
import { SECTEUR_LABELS } from "@/types/fiscal";

interface Props {
  /** Données de toute la société (vue consolidée). */
  donneesMensuelles: DonneesMensuelles;
  annee: number;
}

const telecharger = async (nom: string, contenu: Uint8Array) => {
  const filtres = [{ name: "Classeur Excel", extensions: ["xlsx"] }];
  if (await saveFileViaElectron(nom, contenu, filtres)) return;
  const blob = new Blob([contenu], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export const GenerateurLiasse = ({ donneesMensuelles, annee: anneeCourante }: Props) => {
  const { currentSociete } = useTenant();
  const [annee, setAnnee] = useState(anneeCourante);
  const [systeme, setSysteme] = useState<SystemeLiasse>(systemeDuRegime(currentSociete?.regime_fiscal));
  const [enCours, setEnCours] = useState(false);

  if (!currentSociete) return null;

  const generer = async () => {
    setEnCours(true);
    try {
      const reponse = await fetch(`${import.meta.env.BASE_URL}${MODELES[systeme].fichier}`);
      if (!reponse.ok) throw new Error("Modèle introuvable");
      const modele = await reponse.arrayBuffer();
      const secteur = currentSociete.secteur_activite as keyof typeof SECTEUR_LABELS | null;
      const { fichier, etats } = await genererLiasse(systeme, modele, {
        donnees: donneesMensuelles,
        annee,
        dateArrete: todayISO(),
        societe: {
          nom: currentSociete.nom,
          adresse: currentSociete.adresse,
          nif: currentSociete.nif,
          rccm: currentSociete.rccm,
          telephone: currentSociete.telephone,
          email: currentSociete.email,
          representant: currentSociete.representant,
          fonctionRepresentant: currentSociete.fonction_representant,
          activite: secteur ? SECTEUR_LABELS[secteur] ?? secteur : null,
        },
      });
      const nom = `Etats_financiers_${annee}_${currentSociete.nom.replace(/[^\w-]+/g, "_")}_${systeme === "smt" ? "SMT" : "SN"}.xlsx`;
      await telecharger(nom, fichier);
      const equilibre = etats.n.actif.BZ.net === etats.n.passif.DZ;
      if (!equilibre) {
        toast.warning(`États générés, mais le bilan n'est pas équilibré (écart : ${formatSolde(etats.n.actif.BZ.net - etats.n.passif.DZ)}). Vérifiez les écritures.`);
      } else if (etats.ecartTresorerie !== 0) {
        toast.warning(`États générés. Le tableau des flux présente un écart de ${formatSolde(etats.ecartTresorerie)} avec la trésorerie du bilan.`);
      } else {
        toast.success("États financiers générés.");
      }
    } catch (e) {
      toast.error(`Échec de la génération : ${(e as Error).message}`);
    } finally {
      setEnCours(false);
    }
  };

  const annees = [anneeCourante - 2, anneeCourante - 1, anneeCourante];
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="size-4 text-primary" />
        <h3 className="font-bold text-sm">États financiers complets (liasse officielle)</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Bilan, compte de résultat, tableau des flux de trésorerie, fiches d'identification et notes
        annexes, inscrits dans le modèle officiel de l'OTR, pour toute la société (toutes activités).
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Exercice</Label>
          <Select value={String(annee)} onValueChange={(v) => setAnnee(Number(v))}>
            <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {annees.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Système</Label>
          <Select value={systeme} onValueChange={(v) => setSysteme(v as SystemeLiasse)}>
            <SelectTrigger className="h-9 w-72"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">{MODELES.normal.nom} (réel)</SelectItem>
              <SelectItem value="smt">{MODELES.smt.nom} (TPU)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={generer} disabled={enCours} className="gap-1.5">
          {enCours ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
          Générer les états financiers
        </Button>
      </div>
    </Card>
  );
};
