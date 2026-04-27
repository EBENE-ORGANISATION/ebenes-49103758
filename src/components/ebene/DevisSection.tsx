import { useEffect, useMemo, useState } from "react";
import {
  ActiviteType,
  Devis,
  DonneesMensuelles,
  MoisData,
  StatutDevis,
} from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, X, RefreshCw, FileText, Pencil } from "lucide-react";
import { formatMontant, todayISO } from "@/lib/ebene-utils";
import { useTenant } from "@/hooks/useTenant";
import {
  genererNumeroDevis,
  genererNumeroFacture as genererNumeroFactureFmt,
  incrementerCompteur,
} from "@/lib/numerotation";

interface Props {
  annee: number;
  donneesMensuelles: DonneesMensuelles;
  data: MoisData;
  onAdd: (d: Omit<Devis, "id">) => number;
  onRemove: (id: number) => void;
  onConvertir: (id: number, numeroFacture: string) => void;
  /** Mise à jour d'un devis non encore converti / refusé. */
  onUpdate?: (id: number, patch: Partial<Devis>) => void;
}

const STATUT_BADGES: Record<StatutDevis, { cls: string; label: string }> = {
  brouillon: { cls: "bg-muted text-muted-foreground", label: "Brouillon" },
  envoye: { cls: "bg-info/15 text-info", label: "📤 Envoyé" },
  accepte: { cls: "bg-success/15 text-success", label: "✓ Accepté" },
  refuse: { cls: "bg-destructive/15 text-destructive", label: "✗ Refusé" },
  converti: { cls: "bg-primary/15 text-primary", label: "→ Facturé" },
};

const prochainNumeroDevisFallback = (annee: number, dm: DonneesMensuelles): string => {
  let max = 0;
  Object.values(dm).forEach((m) => {
    (m?.devis || []).forEach((d) => {
      const parts = d.numero.split("-");
      const n = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(n)) max = Math.max(max, n);
    });
  });
  return `D-${annee}-${String(max + 1).padStart(3, "0")}`;
};

const prochainNumeroFactureFallback = (annee: number, dm: DonneesMensuelles): string => {
  let max = 0;
  Object.values(dm).forEach((m) => {
    (m?.factures || []).forEach((f) => {
      const parts = f.numero.split("-");
      const n = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(n)) max = Math.max(max, n);
    });
  });
  return `F-${annee}-${String(max + 1).padStart(3, "0")}`;
};

export const DevisSection = ({
  annee,
  donneesMensuelles,
  data,
  onAdd,
  onRemove,
  onConvertir,
  onUpdate,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [client, setClient] = useState("");
  const [date, setDate] = useState(todayISO());
  const [validite, setValidite] = useState("");
  const [reduction, setReduction] = useState("0");
  const [avecTva, setAvecTva] = useState(true);
  const [activite, setActivite] = useState<ActiviteType>("service");
  const [lignes, setLignes] = useState<{ description: string; montant: string }[]>([
    { description: "", montant: "" },
  ]);
  const [numero, setNumero] = useState("");
  const [numeroEdited, setNumeroEdited] = useState(false);

  const { currentSociete, societeConfig, refresh: refreshTenant } = useTenant();

  const numeroAuto = useMemo(() => {
    if (societeConfig) return genererNumeroDevis(societeConfig, annee);
    return prochainNumeroDevisFallback(annee, donneesMensuelles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societeConfig?.format_devis, societeConfig?.compteur_devis, annee, donneesMensuelles]);

  useEffect(() => {
    if (!open || editingId != null) return;
    if (!numeroEdited) setNumero(numeroAuto);
  }, [open, editingId, numeroAuto, numeroEdited]);

  const reset = () => {
    setEditingId(null);
    setClient("");
    setDate(todayISO());
    setValidite("");
    setReduction("0");
    setAvecTva(true);
    setActivite("service");
    setLignes([{ description: "", montant: "" }]);
    setNumero("");
    setNumeroEdited(false);
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

    if (editingId != null && onUpdate) {
      onUpdate(editingId, {
        client: client.trim(),
        date,
        dateValidite: validite || undefined,
        lignes: lignesNet,
        reduction: red,
        avecTva,
        totalHT,
        totalTva,
        totalTtc,
        activite,
      });
      reset();
      setOpen(false);
      return;
    }

    const numeroFinal = numero.trim() || numeroAuto;
    onAdd({
      numero: numeroFinal,
      client: client.trim(),
      date,
      dateValidite: validite || undefined,
      lignes: lignesNet,
      reduction: red,
      avecTva,
      statut: "envoye",
      totalHT,
      totalTva,
      totalTtc,
      activite,
    });
    if (currentSociete?.id && societeConfig && numeroFinal === numeroAuto) {
      void incrementerCompteur(
        currentSociete.id,
        "devis",
        Number(societeConfig.compteur_devis ?? 1),
      ).then((ok) => { if (ok) void refreshTenant(); });
    }
    reset();
    setOpen(false);
  };

  const sorted = useMemo(
    () => [...(data.devis || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [data.devis]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="size-5 text-primary" />
        <h3 className="font-bold text-lg">📝 Devis</h3>
        <span className="text-xs text-muted-foreground">
          ({sorted.length} ce mois — n'impactent la comptabilité qu'après conversion en facture)
        </span>
      </div>

      {!open ? (
        <Button onClick={() => setOpen(true)} variant="outline" className="gap-1.5">
          <Plus className="size-4" /> Nouveau devis
        </Button>
      ) : (
        <div className="bg-muted/40 border-2 border-border rounded-xl p-5 space-y-4">
          <h4 className="font-bold">{editingId != null ? "Modifier le devis" : "Nouveau devis"}</h4>
          {editingId == null && (
            <div>
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Numéro
              </Label>
              <div className="flex gap-2 mt-1 items-center">
                <Input
                  value={numero}
                  onChange={(e) => { setNumero(e.target.value); setNumeroEdited(true); }}
                  className="font-mono w-56"
                  placeholder={numeroAuto}
                />
                {numeroEdited && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setNumero(numeroAuto); setNumeroEdited(false); }}
                    className="gap-1"
                  >
                    <RefreshCw className="size-3.5" /> Auto
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Aperçu auto : <span className="font-mono">{numeroAuto}</span>
                {societeConfig && (
                  <> &middot; format : <span className="font-mono">{societeConfig.format_devis}</span></>
                )}
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <div>
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Validité
              </Label>
              <Input
                type="date"
                value={validite}
                onChange={(e) => setValidite(e.target.value)}
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
                Type d'activité
              </Label>
              <Select value={activite} onValueChange={(v) => setActivite(v as ActiviteType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Prestation de service</SelectItem>
                  <SelectItem value="commerce">Commerce</SelectItem>
                </SelectContent>
              </Select>
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

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={avecTva} onCheckedChange={(v) => setAvecTva(!!v)} />
            <span className="text-sm font-medium">TVA 18%</span>
          </label>

          <div className="flex gap-2 pt-1">
            <Button onClick={submit} className="bg-success text-success-foreground hover:bg-success/90">
              {editingId != null ? "✓ Enregistrer" : "✓ Créer"}
            </Button>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }} className="gap-1.5">
              <X className="size-4" /> Annuler
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 italic text-sm">
            Aucun devis pour ce mois
          </p>
        ) : (
          sorted.map((d) => {
            const badge = STATUT_BADGES[d.statut];
            const dim = d.statut === "refuse" || d.statut === "converti" ? "opacity-70" : "";
            return (
              <div key={d.id} className={`list-item border-l-4 border-l-primary ${dim}`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm font-mono">{d.numero}</p>
                      <span className={`badge-soft ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <p className="font-semibold mt-0.5 truncate">{d.client}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.date}
                      {d.dateValidite && ` • valide jusqu'au ${d.dateValidite}`}
                      {" • "}
                      {d.lignes.length} ligne{d.lignes.length > 1 ? "s" : ""}
                      {d.avecTva && " • TVA 18%"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <span className="amount text-base text-foreground">
                      {formatMontant(d.totalTtc)}
                    </span>
                    {onUpdate && d.statut !== "converti" && d.statut !== "refuse" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        title="Modifier (uniquement si non converti)"
                        onClick={() => {
                          setEditingId(d.id);
                          setClient(d.client);
                          setDate(d.date);
                          setValidite(d.dateValidite || "");
                          setReduction(String(d.reduction || 0));
                          setAvecTva(!!d.avecTva);
                          setActivite(d.activite || "service");
                          setLignes(
                            (d.lignes && d.lignes.length > 0
                              ? d.lignes
                              : [{ description: "", montant: 0 }]
                            ).map((l) => ({ description: l.description, montant: String(l.montant) }))
                          );
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {d.statut !== "converti" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-success border-success/30 hover:bg-success/10"
                        onClick={() => {
                          if (confirm("Convertir ce devis en facture définitive ?")) {
                            const num = societeConfig
                              ? genererNumeroFactureFmt(societeConfig, annee)
                              : prochainNumeroFactureFallback(annee, donneesMensuelles);
                            onConvertir(d.id, num);
                            if (currentSociete?.id && societeConfig) {
                              void incrementerCompteur(
                                currentSociete.id,
                                "facture",
                                Number(societeConfig.compteur_facture ?? 1),
                              ).then((ok) => { if (ok) void refreshTenant(); });
                            }
                          }
                        }}
                      >
                        <RefreshCw className="size-3.5" /> Convertir en facture
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm("Supprimer définitivement ce devis ?")) onRemove(d.id);
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

      <div className="border-t border-border my-2" />
    </div>
  );
};