import { useEffect, useMemo, useState } from "react";
import { ActiviteType, DonneesMensuelles, Facture, MoisData, StatutValidation } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, X, Check, RefreshCw, Eye, Printer, XCircle, Camera, AlertTriangle, Pencil } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMontant, todayISO } from "@/lib/ebene-utils";
import { DevisSection } from "./DevisSection";
import type { Devis } from "@/types/ebene";
import { OCRFacture, type OCRDraft } from "./OCRFacture";
import { detectAnomalies, type Anomalie } from "@/lib/anomalies";

interface Props {
  annee: number;
  donneesMensuelles: DonneesMensuelles;
  data: MoisData;
  onAdd: (f: Omit<Facture, "id">) => number;
  onRemove: (id: number) => void;
  onMarquerPayee: (id: number) => void;
  onConvertir: (id: number, num: string) => void;
  onPreview: (f: Facture) => void;
  /** Si true, affiche les boutons Valider / Rejeter (chef compta). */
  isChefCompta?: boolean;
  onValider?: (id: number) => void;
  onRejeter?: (id: number, motif: string) => void;
  /** Mise à jour partielle d'une facture non encore validée. */
  onUpdateFacture?: (id: number, patch: Partial<Facture>) => void;
  // Devis (optionnels)
  onAddDevis?: (d: Omit<Devis, "id">) => number;
  onRemoveDevis?: (id: number) => void;
  onConvertirDevis?: (id: number, numeroFacture: string) => void;
  onUpdateDevis?: (id: number, patch: Partial<Devis>) => void;
}

const STATUT_VALIDATION_BADGES: Record<StatutValidation, { cls: string; label: string }> = {
  brouillon: { cls: "bg-muted text-muted-foreground", label: "Brouillon" },
  en_validation: { cls: "bg-warning/15 text-warning", label: "En validation" },
  valide: { cls: "bg-success/15 text-success", label: "✓ Validé" },
  rejete: { cls: "bg-destructive/15 text-destructive", label: "✗ Rejeté" },
};

const prochainNumero = (
  estProforma: boolean,
  annee: number,
  donneesMensuelles: DonneesMensuelles
) => {
  const prefix = estProforma ? "PRO" : "F";
  let max = 0;
  Object.values(donneesMensuelles).forEach((m) => {
    (m.factures || []).forEach((f) => {
      const parts = f.numero.split("-");
      const n = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(n)) max = Math.max(max, n);
    });
  });
  return `${prefix}-${annee}-${String(max + 1).padStart(3, "0")}`;
};

export const Factures = ({
  annee,
  donneesMensuelles,
  data,
  onAdd,
  onRemove,
  onMarquerPayee,
  onConvertir,
  onPreview,
  isChefCompta,
  onValider,
  onRejeter,
  onUpdateFacture,
  onAddDevis,
  onRemoveDevis,
  onConvertirDevis,
  onUpdateDevis,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [client, setClient] = useState("");
  const [date, setDate] = useState(todayISO());
  const [reduction, setReduction] = useState("0");
  const [avecTva, setAvecTva] = useState(true);
  const [proforma, setProforma] = useState(false);
  const [activite, setActivite] = useState<ActiviteType>("service");
  const [lignes, setLignes] = useState<{ description: string; montant: string }[]>([
    { description: "", montant: "" },
  ]);
  const [ocrOpen, setOcrOpen] = useState(false);

  // Anomalies (calculées sur l'année entière, mémorisées)
  const anomaliesMap = useMemo(() => detectAnomalies(donneesMensuelles), [donneesMensuelles]);

  const reset = () => {
    setEditingId(null);
    setClient("");
    setDate(todayISO());
    setReduction("0");
    setAvecTva(true);
    setProforma(false);
    setActivite("service");
    setLignes([{ description: "", montant: "" }]);
  };

  // Pré-remplissage du formulaire à partir d'une extraction OCR
  const applyOCRDraft = (draft: OCRDraft | null) => {
    setOpen(true);
    if (!draft) return; // formulaire vide en cas d'échec
    if (draft.fournisseur) setClient(draft.fournisseur);
    if (draft.date) setDate(draft.date);
    setAvecTva(!!draft.tva && draft.tva > 0);
    const montant = draft.montantHT ?? draft.montantTTC ?? null;
    if (montant != null && montant > 0) {
      setLignes([{ description: "Facture importée (OCR)", montant: String(montant) }]);
    }
  };

  const submit = () => {
    if (!client.trim()) return alert("Le nom du client est obligatoire.");
    if (!date) return alert("Date obligatoire.");
    const lignesNet = lignes
      .map((l) => ({ description: l.description.trim(), montant: parseFloat(l.montant) || 0 }))
      .filter((l) => l.description && l.montant > 0);
    if (lignesNet.length === 0) return alert("Au moins une prestation valide.");
    const red = Math.max(0, parseFloat(reduction) || 0);
    const sousTotal = lignesNet.reduce((a, l) => a + l.montant, 0);
    const totalHT = Math.max(0, sousTotal - red);
    const totalTva = avecTva ? totalHT * 0.18 : 0;
    const totalTtc = totalHT + totalTva;

    if (editingId != null && onUpdateFacture) {
      onUpdateFacture(editingId, {
        client: client.trim(),
        date,
        lignes: lignesNet,
        reduction: red,
        avecTva,
        statut: proforma ? "proforma" : "en_attente",
        totalHT,
        totalTva,
        totalTtc,
        activite,
      });
      reset();
      setOpen(false);
      return;
    }

    onAdd({
      numero: prochainNumero(proforma, annee, donneesMensuelles),
      client: client.trim(),
      date,
      lignes: lignesNet,
      reduction: red,
      avecTva,
      statut: proforma ? "proforma" : "en_attente",
      transactionId: null,
      totalHT,
      totalTva,
      totalTtc,
      activite,
    });
    reset();
    setOpen(false);
  };

  const startEdit = (f: Facture) => {
    setEditingId(f.id);
    setClient(f.client);
    setDate(f.date);
    setReduction(String(f.reduction || 0));
    setAvecTva(!!f.avecTva);
    setProforma(f.statut === "proforma");
    setActivite(f.activite || "service");
    setLignes(
      (f.lignes && f.lignes.length > 0
        ? f.lignes
        : [{ description: "", montant: 0 }]
      ).map((l) => ({ description: l.description, montant: String(l.montant) }))
    );
    setOpen(true);
  };

  const sorted = useMemo(
    () => [...data.factures].sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [data.factures]
  );

  return (
    <div className="space-y-5">
      {onAddDevis && onRemoveDevis && onConvertirDevis && (
        <DevisSection
          annee={annee}
          donneesMensuelles={donneesMensuelles}
          data={data}
          onAdd={onAddDevis}
          onRemove={onRemoveDevis}
          onConvertir={onConvertirDevis}
        />
      )}

      <div className="bg-info/10 border-l-4 border-info rounded-md p-3 text-sm">
        💡 Quand une facture passe à <b>Payée</b>, son montant est automatiquement ajouté aux
        recettes. Supprimer la transaction restaure le statut.
      </div>

      {!open ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="size-4" /> Nouvelle Facture / Proforma
          </Button>
          <Button variant="outline" onClick={() => setOcrOpen(true)} className="gap-1.5">
            <Camera className="size-4" /> 📷 Importer par photo
          </Button>
        </div>
      ) : (
        <div className="bg-muted/40 border-2 border-border rounded-xl p-5 space-y-4">
          <h3 className="font-bold text-lg">Nouvelle Facture</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Client *
              </Label>
              <Input value={client} onChange={(e) => setClient(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Date *
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1 block">
              Prestations *
            </Label>
            <div className="space-y-2">
              {lignes.map((l, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    placeholder="Description"
                    value={l.description}
                    onChange={(e) => {
                      const next = [...lignes];
                      next[idx] = { ...next[idx], description: e.target.value };
                      setLignes(next);
                    }}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="Montant"
                    value={l.montant}
                    onChange={(e) => {
                      const next = [...lignes];
                      next[idx] = { ...next[idx], montant: e.target.value };
                      setLignes(next);
                    }}
                    className="w-32"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive shrink-0"
                    onClick={() => setLignes(lignes.filter((_, i) => i !== idx))}
                    disabled={lignes.length === 1}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 gap-1.5"
              onClick={() => setLignes([...lignes, { description: "", montant: "" }])}
            >
              <Plus className="size-3.5" /> Ajouter ligne
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Type d'activité *
              </Label>
              <Select value={activite} onValueChange={(v) => setActivite(v as ActiviteType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Prestation de service (patente 0,75 %)</SelectItem>
                  <SelectItem value="commerce">Commerce (patente 0,55 %)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Détermine le taux de patente appliqué lors du règlement.
              </p>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Réduction (FCFA)
              </Label>
              <Input
                type="number"
                value={reduction}
                onChange={(e) => setReduction(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={avecTva} onCheckedChange={(v) => setAvecTva(!!v)} />
              <span className="text-sm font-medium">TVA 18%</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={proforma} onCheckedChange={(v) => setProforma(!!v)} />
              <span className="text-sm font-medium">📋 Proforma</span>
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={submit} className="bg-success text-success-foreground hover:bg-success/90">
              ✓ Créer
            </Button>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }} className="gap-1.5">
              <X className="size-4" /> Annuler
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 italic">
            Aucune facture pour ce mois
          </p>
        ) : (
          sorted.map((f) => {
            const borderClass =
              f.statut === "payee"
                ? "border-l-4 border-l-success"
                : f.statut === "proforma"
                ? "border-l-4 border-l-warning"
                : "border-l-4 border-l-info";
            const badge =
              f.statut === "payee"
                ? { cls: "bg-success/15 text-success", label: "✓ Payée" }
                : f.statut === "proforma"
                ? { cls: "bg-warning/15 text-warning", label: "📋 Proforma" }
                : { cls: "bg-info/15 text-info", label: "⏳ En attente" };
            const sv = f.statutValidation;
            const dim = sv === "brouillon" ? "opacity-50" : "";
            const anomalies: Anomalie[] = anomaliesMap.factures.get(f.id) || [];
            return (
              <div key={f.id} className={`list-item ${borderClass} ${dim}`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm font-mono">{f.numero}</p>
                      <span className={`badge-soft ${badge.cls}`}>{badge.label}</span>
                      {anomalies.length > 0 && (
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="badge-soft cursor-help bg-warning/15 text-warning flex items-center gap-1">
                                <AlertTriangle className="size-3" />
                                {anomalies.length > 1 ? `${anomalies.length} anomalies` : "Anomalie"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <ul className="text-xs max-w-xs list-disc pl-4 space-y-0.5">
                                {anomalies.map((a, i) => (
                                  <li key={i}>{a.message}</li>
                                ))}
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {sv && (
                        sv === "rejete" && f.motifRejet ? (
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`badge-soft cursor-help ${STATUT_VALIDATION_BADGES[sv].cls}`}>
                                  {STATUT_VALIDATION_BADGES[sv].label}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs max-w-xs">Motif : {f.motifRejet}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className={`badge-soft ${STATUT_VALIDATION_BADGES[sv].cls}`}>
                            {STATUT_VALIDATION_BADGES[sv].label}
                          </span>
                        )
                      )}
                    </div>
                    <p className="font-semibold mt-0.5 truncate">{f.client}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.date} • {f.lignes.length} ligne{f.lignes.length > 1 ? "s" : ""}
                      {f.avecTva && " • TVA 18%"}
                      {f.activite && ` • ${f.activite === "service" ? "Service" : "Commerce"}`}
                    </p>
                    {sv === "rejete" && f.motifRejet && (
                      <p className="text-xs text-destructive mt-1 italic">
                        Motif du rejet : {f.motifRejet}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <span className="amount text-base text-foreground">
                      {formatMontant(f.totalTtc)}
                    </span>
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => onPreview(f)}>
                      <Eye className="size-4" />
                    </Button>
                    {isChefCompta && sv !== "valide" && onValider && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-success hover:text-success hover:bg-success/10"
                        onClick={() => onValider(f.id)}
                        title="Valider"
                      >
                        <Check className="size-4" />
                      </Button>
                    )}
                    {isChefCompta && sv !== "rejete" && onRejeter && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-warning hover:text-warning hover:bg-warning/10"
                        onClick={() => {
                          const motif = window.prompt("Motif du rejet :", "");
                          if (motif && motif.trim()) onRejeter(f.id, motif.trim());
                        }}
                        title="Rejeter"
                      >
                        <XCircle className="size-4" />
                      </Button>
                    )}
                    {f.statut === "proforma" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-info border-info/30 hover:bg-info/10"
                        onClick={() => {
                          if (confirm("Convertir cette proforma en facture définitive ?")) {
                            onConvertir(f.id, prochainNumero(false, annee, donneesMensuelles));
                          }
                        }}
                      >
                        <RefreshCw className="size-3.5" /> Convertir
                      </Button>
                    )}
                    {f.statut === "en_attente" && (
                      <Button
                        size="sm"
                        className="gap-1 bg-success text-success-foreground hover:bg-success/90"
                        onClick={() => onMarquerPayee(f.id)}
                      >
                        <Check className="size-3.5" /> Marquer payée
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm("Supprimer définitivement cette facture ?")) {
                          onRemove(f.id);
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <OCRFacture open={ocrOpen} onOpenChange={setOcrOpen} onExtracted={applyOCRDraft} />
    </div>
  );
};