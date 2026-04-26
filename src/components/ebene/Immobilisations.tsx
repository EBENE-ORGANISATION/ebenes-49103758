import { useMemo, useState } from "react";
import {
  Immobilisation,
  CategorieImmo,
  CATEGORIE_IMMO_LABELS,
  COMPTES_IMMO_DEFAUT,
  MethodeAmortissement,
} from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, FileSpreadsheet, Building2 } from "lucide-react";
import { formatMontant, todayISO } from "@/lib/ebene-utils";
import { toast } from "sonner";
import { StatCard } from "./StatCard";
import {
  amortissementsAnnee,
  planAmortissement,
} from "@/lib/amortissements";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

interface Props {
  annee: number;
  immobilisations: Immobilisation[];
  onAdd: (i: Omit<Immobilisation, "id">) => void;
  onRemove: (id: number) => void;
  canEdit: boolean;
}

const METHODES: { v: MethodeAmortissement; label: string }[] = [
  { v: "lineaire", label: "Linéaire" },
  { v: "degressif", label: "Dégressif" },
];

export const Immobilisations = ({
  annee,
  immobilisations,
  onAdd,
  onRemove,
  canEdit,
}: Props) => {
  const [showForm, setShowForm] = useState(false);
  const [libelle, setLibelle] = useState("");
  const [categorie, setCategorie] = useState<CategorieImmo>("materiel_bureau");
  const [dateAcq, setDateAcq] = useState(todayISO());
  const [valeur, setValeur] = useState("");
  const [duree, setDuree] = useState("5");
  const [methode, setMethode] = useState<MethodeAmortissement>("lineaire");

  const lignes = useMemo(
    () => amortissementsAnnee(immobilisations, annee),
    [immobilisations, annee]
  );

  const totals = useMemo(
    () =>
      lignes.reduce(
        (a, l) => ({
          base: a.base + l.immobilisation.valeurOrigine,
          dotation: a.dotation + l.dotation,
          cumul: a.cumul + l.cumul,
          vnc: a.vnc + l.vnc,
        }),
        { base: 0, dotation: 0, cumul: 0, vnc: 0 }
      ),
    [lignes]
  );

  const reset = () => {
    setLibelle(""); setValeur(""); setDuree("5");
    setCategorie("materiel_bureau"); setMethode("lineaire");
    setDateAcq(todayISO()); setShowForm(false);
  };

  const submit = () => {
    if (!libelle.trim()) return toast.error("Libellé requis");
    const v = Number(valeur);
    const d = Number(duree);
    if (!v || v <= 0) return toast.error("Valeur d'origine invalide");
    if (!d || d <= 0) return toast.error("Durée d'amortissement invalide");
    onAdd({
      libelle: libelle.trim(),
      categorie,
      dateAcquisition: dateAcq,
      valeurOrigine: v,
      dureeAmortissement: d,
      methode: categorie === "terrain" ? "lineaire" : methode,
      comptesSYSCOHADA: COMPTES_IMMO_DEFAUT[categorie],
    });
    toast.success("Immobilisation ajoutée");
    reset();
  };

  const exportPlan = () => {
    if (immobilisations.length === 0) {
      return toast.error("Aucune immobilisation à exporter");
    }
    const wb = XLSX.utils.book_new();

    // Feuille 1 : récap année
    const recap: (string | number)[][] = [
      ["Libellé", "Catégorie", "Date acq.", "Méthode", "Durée",
       "Valeur origine", `Dotation ${annee}`, `Cumul ${annee}`, `VNC ${annee}`,
       "Cpte actif", "Cpte amort.", "Cpte dotation"],
    ];
    lignes.forEach((l) => {
      const i = l.immobilisation;
      recap.push([
        i.libelle,
        i.categorie ? CATEGORIE_IMMO_LABELS[i.categorie] : "—",
        i.dateAcquisition,
        i.methode === "lineaire" ? "Linéaire" : "Dégressif",
        i.dureeAmortissement,
        i.valeurOrigine,
        l.dotation,
        l.cumul,
        l.vnc,
        i.comptesSYSCOHADA?.actif || "",
        i.comptesSYSCOHADA?.amortissementCumule || "",
        i.comptesSYSCOHADA?.dotation || "",
      ]);
    });
    recap.push(["", "", "", "", "TOTAUX", totals.base, totals.dotation, totals.cumul, totals.vnc, "", "", ""]);
    const ws1 = XLSX.utils.aoa_to_sheet(recap);
    ws1["!cols"] = [{wch:30},{wch:25},{wch:12},{wch:12},{wch:8},{wch:14},{wch:14},{wch:14},{wch:14},{wch:12},{wch:12},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws1, `Amort ${annee}`);

    // Feuille 2 : plans détaillés
    const detail: (string | number)[][] = [["Libellé", "Année", "Dotation", "Cumul", "VNC"]];
    immobilisations.forEach((i) => {
      const plan = planAmortissement(i);
      plan.lignes.forEach((l) => {
        detail.push([i.libelle, l.annee, l.dotation, l.cumul, l.vnc]);
      });
      detail.push(["", "", "", "", ""]);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(detail);
    ws2["!cols"] = [{wch:30},{wch:8},{wch:14},{wch:14},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws2, "Plans détaillés");

    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(blob, `EBENE_Immobilisations_${annee}.xlsx`);
    toast.success(`Plan d'amortissement ${annee} exporté`);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <StatCard
          label="Immobilisations"
          value={String(immobilisations.length)}
          tone="info"
          icon={<Building2 className="size-5" />}
        />
        <StatCard label="Valeur d'origine" value={formatMontant(totals.base)} tone="purple" />
        <StatCard label={`Dotation ${annee}`} value={formatMontant(totals.dotation)} tone="warning" />
        <StatCard label={`VNC fin ${annee}`} value={formatMontant(totals.vnc)} tone="success" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <Button onClick={() => setShowForm((v) => !v)} size="sm" className="gap-1.5">
            <Plus className="size-4" /> {showForm ? "Annuler" : "Nouvelle immobilisation"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={exportPlan} className="gap-1.5">
          <FileSpreadsheet className="size-4" />
          Exporter le plan {annee}
        </Button>
        <span className="text-xs text-muted-foreground">
          Conforme SYSCOHADA Révisé. Inclus dans l'export comptable annuel.
        </span>
      </div>

      {showForm && canEdit && (
        <div className="rounded-md border p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-muted/30">
          <div className="sm:col-span-2">
            <Label>Libellé</Label>
            <Input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Ex: Ordinateur portable Dell" />
          </div>
          <div>
            <Label>Catégorie</Label>
            <Select value={categorie} onValueChange={(v) => setCategorie(v as CategorieImmo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORIE_IMMO_LABELS) as CategorieImmo[]).map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORIE_IMMO_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date d'acquisition</Label>
            <Input type="date" value={dateAcq} onChange={(e) => setDateAcq(e.target.value)} />
          </div>
          <div>
            <Label>Valeur d'origine (FCFA)</Label>
            <Input type="number" min="0" value={valeur} onChange={(e) => setValeur(e.target.value)} />
          </div>
          <div>
            <Label>Durée (années)</Label>
            <Input type="number" min="1" value={duree} onChange={(e) => setDuree(e.target.value)} />
          </div>
          <div>
            <Label>Méthode</Label>
            <Select
              value={methode}
              onValueChange={(v) => setMethode(v as MethodeAmortissement)}
              disabled={categorie === "terrain"}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODES.map((m) => (
                  <SelectItem key={m.v} value={m.v}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={reset}>Annuler</Button>
            <Button size="sm" onClick={submit}>Enregistrer</Button>
          </div>
        </div>
      )}

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Libellé</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead>Acquisition</TableHead>
              <TableHead>Méthode</TableHead>
              <TableHead className="text-right">Valeur origine</TableHead>
              <TableHead className="text-right">Dotation {annee}</TableHead>
              <TableHead className="text-right">Cumul {annee}</TableHead>
              <TableHead className="text-right">VNC {annee}</TableHead>
              {canEdit && <TableHead className="w-12"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignes.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEdit ? 9 : 8} className="text-center text-muted-foreground py-8">
                  Aucune immobilisation enregistrée.
                </TableCell>
              </TableRow>
            )}
            {lignes.map((l) => {
              const i = l.immobilisation;
              return (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.libelle}</TableCell>
                  <TableCell className="text-xs">
                    {i.categorie ? CATEGORIE_IMMO_LABELS[i.categorie] : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{i.dateAcquisition}</TableCell>
                  <TableCell className="text-xs">
                    {i.methode === "lineaire" ? "Linéaire" : "Dégressif"} · {i.dureeAmortissement} ans
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMontant(i.valeurOrigine)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMontant(l.dotation)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMontant(l.cumul)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{formatMontant(l.vnc)}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Supprimer "${i.libelle}" ? Le plan d'amortissement sera perdu.`)) {
                            onRemove(i.id);
                          }
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {lignes.length > 0 && (
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={4}>TOTAUX</TableCell>
                <TableCell className="text-right tabular-nums">{formatMontant(totals.base)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMontant(totals.dotation)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMontant(totals.cumul)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMontant(totals.vnc)}</TableCell>
                {canEdit && <TableCell></TableCell>}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
