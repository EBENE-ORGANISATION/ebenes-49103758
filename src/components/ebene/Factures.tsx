import { useEffect, useMemo, useState } from "react";
import { ActiviteType, Article, DonneesMensuelles, Facture, MoisData, StatutValidation } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, X, Check, RefreshCw, Eye, Printer, XCircle, Camera, AlertTriangle, Pencil, Wallet, Landmark, Ban } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMontant, todayISO, dateFr } from "@/lib/ebene-utils";
import { DevisSection } from "./DevisSection";
import type { Devis } from "@/types/ebene";
import { OCRFacture, type OCRDraft } from "./OCRFacture";
import { detectAnomalies, type Anomalie } from "@/lib/anomalies";
import { useTenant } from "@/hooks/useTenant";
import { useActiviteFilter } from "@/hooks/useActiviteFilter";
import { ActiviteSelect } from "./ActiviteSelect";
import { usePeutValider, MESSAGE_QUATRE_YEUX } from "@/hooks/usePeutValider";
import { useActiviteObligatoire, MESSAGE_ACTIVITE_OBLIGATOIRE } from "@/hooks/useActiviteObligatoire";
import {
  genererNumeroFacture,
  reserverNumero,
} from "@/lib/numerotation";

interface Props {
  annee: number;
  donneesMensuelles: DonneesMensuelles;
  data: MoisData;
  onAdd: (f: Omit<Facture, "id">) => number;
  onRemove: (id: number) => void;
  /** Articles du stock : une ligne peut vendre un article (sortie à la validation). */
  articles?: Article[];
  /** Annule une facture validée ou payée (contre-passation de ses écritures). */
  onAnnuler?: (id: number) => void;
  /** `compte` : 571 Caisse ou 521 Banque — compte d'encaissement du règlement. */
  onMarquerPayee: (id: number, compte: "521" | "571") => void;
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

/**
 * Fallback (sans config société) : ancien algorithme basé sur le scan des
 * numéros existants. Garde un comportement raisonnable hors-ligne.
 */
const prochainNumeroFallback = (
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
  articles = [],
  onAnnuler,
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
  const peutValider = usePeutValider();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [client, setClient] = useState("");
  const [date, setDate] = useState(todayISO());
  const [reduction, setReduction] = useState("0");
  const [avecTva, setAvecTva] = useState(true);
  const [proforma, setProforma] = useState(false);
  const [activite, setActivite] = useState<ActiviteType>("service");
  const { currentActiviteId } = useActiviteFilter();
  const [activiteId, setActiviteId] = useState<string | null>(currentActiviteId);
  useEffect(() => { setActiviteId(currentActiviteId); }, [currentActiviteId]);
  // Ligne en saisie ; articleId : article du stock vendu (montant = quantité × prix unitaire)
  type LigneSaisie = { description: string; montant: string; articleId?: number | null; quantite?: string; prixUnitaire?: string };
  const [lignes, setLignes] = useState<LigneSaisie[]>([
    { description: "", montant: "" },
  ]);
  const majLigne = (idx: number, patch: Partial<LigneSaisie>) =>
    setLignes((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const n = { ...l, ...patch };
      if (n.articleId) n.montant = String((parseFloat(n.quantite || "0") || 0) * (parseFloat(n.prixUnitaire || "0") || 0));
      return n;
    }));
  const choisirArticle = (idx: number, articleId: number | null) => {
    const a = articles.find((x) => x.id === articleId);
    if (!a) return majLigne(idx, { articleId: null, quantite: undefined, prixUnitaire: undefined });
    majLigne(idx, { articleId: a.id, description: a.designation, quantite: lignes[idx]?.quantite || "1", prixUnitaire: String(a.prixVente || 0) });
  };
  const [ocrOpen, setOcrOpen] = useState(false);
  const [numero, setNumero] = useState("");
  const [numeroEdited, setNumeroEdited] = useState(false);
  const [paiementFacture, setPaiementFacture] = useState<Facture | null>(null);

  const { currentSociete, societeConfig, refresh: refreshTenant } = useTenant();

  // Numéro auto-généré selon la config de la société (aperçu)
  const numeroAuto = useMemo(() => {
    if (societeConfig) return genererNumeroFacture(societeConfig, annee);
    return prochainNumeroFallback(proforma, annee, donneesMensuelles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societeConfig?.format_facture, societeConfig?.compteur_facture, annee, proforma, donneesMensuelles]);

  // Pré-remplit le numéro à l'ouverture du formulaire (création) tant que
  // l'utilisateur ne l'a pas modifié manuellement.
  useEffect(() => {
    if (!open || editingId != null) return;
    if (!numeroEdited) setNumero(numeroAuto);
  }, [open, editingId, numeroAuto, numeroEdited]);

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
    setActiviteId(currentActiviteId);
    setLignes([{ description: "", montant: "" }]);
    setNumero("");
    setNumeroEdited(false);
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

  /**
   * Numéro définitif : si l'utilisateur garde le numéro proposé, on le réserve
   * en base (le compteur avance atomiquement) ; sinon on respecte son choix
   * manuel sans avancer la séquence.
   */
  const numeroDefinitif = async (apercu: string, saisi: string): Promise<string> => {
    if (saisi && saisi !== apercu) return saisi;
    if (!currentSociete?.id || !societeConfig) return apercu;
    const reserve = await reserverNumero(currentSociete.id, "facture", annee);
    if (!reserve) return apercu;
    void refreshTenant();
    return reserve;
  };

  const activiteObligatoire = useActiviteObligatoire();
  const submit = async () => {
    if (activiteObligatoire && !activiteId) return alert(MESSAGE_ACTIVITE_OBLIGATOIRE);
    if (!client.trim()) return alert("Le nom du client est obligatoire.");
    if (!date) return alert("Date obligatoire.");
    const lignesNet = lignes
      .map((l) => ({
        description: l.description.trim(),
        montant: parseFloat(l.montant) || 0,
        ...(l.articleId
          ? { articleId: l.articleId, quantite: parseFloat(l.quantite || "0") || 0, prixUnitaire: parseFloat(l.prixUnitaire || "0") || 0 }
          : {}),
      }))
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
        activiteId,
      });
      reset();
      setOpen(false);
      return;
    }

    const numeroFinal = await numeroDefinitif(numeroAuto, numero.trim());
    onAdd({
      numero: numeroFinal,
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
      activiteId,
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
    setActiviteId(f.activiteId ?? null);
    setLignes(
      (f.lignes && f.lignes.length > 0
        ? f.lignes
        : [{ description: "", montant: 0 }]
      ).map((l) => ({
        description: l.description,
        montant: String(l.montant),
        articleId: l.articleId ?? null,
        quantite: l.quantite != null ? String(l.quantite) : undefined,
        prixUnitaire: l.prixUnitaire != null ? String(l.prixUnitaire) : undefined,
      }))
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
          onUpdate={onUpdateDevis}
        />
      )}

      <div className="bg-info/10 border-l-4 border-info rounded-md p-3 text-sm space-y-1">
        <p>💡 Quand une facture passe à <b>Payée</b> :</p>
        <ul className="list-disc pl-4 space-y-0.5 text-xs text-muted-foreground">
          <li>Son montant TTC est ajouté aux <b>recettes</b> (Trésorerie)</li>
          <li>Une <b>écriture SYSCOHADA</b> est générée automatiquement dans le journal VE
              (4111 Clients / 706 Ventes / 4431 TVA)</li>
          <li>L'écriture est visible dans <b>Comptabilité → Journal</b> et impacte le
              <b>Grand-Livre</b>, la <b>Balance</b> et la <b>TVA</b></li>
        </ul>
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
          <h3 className="font-bold text-lg">
            {editingId != null ? "Modifier la facture" : "Nouvelle Facture"}
          </h3>

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
                  <> &middot; format : <span className="font-mono">{societeConfig.format_facture}</span></>
                )}
              </p>
            </div>
          )}

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
              {lignes.map((l, idx) => {
                const article = articles.find((a) => a.id === l.articleId);
                const manque = !!article && (parseFloat(l.quantite || "0") || 0) > article.stock;
                return (
                <div key={idx} className="space-y-1.5">
                {articles.length > 0 && (
                  <select
                    aria-label="Article du stock"
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    value={l.articleId ?? ""}
                    onChange={(e) => choisirArticle(idx, e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Prestation (hors stock)</option>
                    {articles.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.reference} — {a.designation} (stock : {a.stock} {a.unite})
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                  <Input
                    placeholder="Description"
                    value={l.description}
                    onChange={(e) => majLigne(idx, { description: e.target.value })}
                    className="flex-1 min-w-[10rem]"
                  />
                  {l.articleId && (
                    <>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        aria-label="Quantité"
                        placeholder="Qté"
                        value={l.quantite ?? ""}
                        onChange={(e) => majLigne(idx, { quantite: e.target.value })}
                        className={`w-20 ${manque ? "border-destructive" : ""}`}
                      />
                      <Input
                        type="number"
                        min="0"
                        aria-label="Prix unitaire"
                        placeholder="P.U."
                        value={l.prixUnitaire ?? ""}
                        onChange={(e) => majLigne(idx, { prixUnitaire: e.target.value })}
                        className="w-28"
                      />
                    </>
                  )}
                  <Input
                    type="number"
                    placeholder="Montant"
                    value={l.montant}
                    readOnly={!!l.articleId}
                    onChange={(e) => majLigne(idx, { montant: e.target.value })}
                    className={`w-32 ${l.articleId ? "bg-muted" : ""}`}
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
                {manque && article && (
                  <p className="text-xs text-destructive">
                    Stock disponible : {article.stock} {article.unite}. La facture ne pourra être validée qu&apos;après une entrée en stock.
                  </p>
                )}
                </div>
                );
              })}
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

          <ActiviteSelect value={activiteId} onChange={setActiviteId} allowNone={false} label="Compartiment d'activité" />

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
          <p className="text-center text-muted-foreground py-8 italic">
            Aucune facture pour ce mois
          </p>
        ) : (
          sorted.map((f) => {
            const borderClass =
              f.statut === "payee"
                ? "border-l-4 border-l-success"
                : f.statut === "annulee"
                ? "border-l-4 border-l-muted-foreground"
                : f.statut === "proforma"
                ? "border-l-4 border-l-warning"
                : "border-l-4 border-l-info";
            const badge =
              f.statut === "payee"
                ? { cls: "bg-success/15 text-success", label: "✓ Payée" }
                : f.statut === "annulee"
                ? { cls: "bg-muted text-muted-foreground", label: "⊘ Annulée" }
                : f.statut === "proforma"
                ? { cls: "bg-warning/15 text-warning", label: "📋 Proforma" }
                : { cls: "bg-info/15 text-info", label: "⏳ En attente" };
            const sv = f.statutValidation;
            const annulee = f.statut === "annulee";
            const dim = sv === "brouillon" || annulee ? "opacity-50" : "";
            // Validée, payée ou annulée : la facture est engagée, on ne la supprime plus
            const engagee = sv === "valide" || f.statut === "payee" || annulee;
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
                      {dateFr(f.date)} • {f.lignes.length} ligne{f.lignes.length > 1 ? "s" : ""}
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
                    {onUpdateFacture && !engagee && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => startEdit(f)}
                        title="Modifier (uniquement si non validée)"
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {isChefCompta && sv !== "valide" && !annulee && onValider && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-success hover:text-success hover:bg-success/10"
                        onClick={() => onValider(f.id)}
                        disabled={!peutValider(f.creePar)}
                        title={peutValider(f.creePar) ? "Valider" : MESSAGE_QUATRE_YEUX}
                      >
                        <Check className="size-4" />
                      </Button>
                    )}
                    {isChefCompta && sv !== "rejete" && !engagee && onRejeter && (
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
                        onClick={async () => {
                          if (confirm("Convertir cette proforma en facture définitive ?")) {
                            const apercu = societeConfig
                              ? genererNumeroFacture(societeConfig, annee)
                              : prochainNumeroFallback(false, annee, donneesMensuelles);
                            onConvertir(f.id, await numeroDefinitif(apercu, ""));
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
                        onClick={() => setPaiementFacture(f)}
                        // Encaissement possible seulement après validation par le chef comptable
                        disabled={sv !== undefined && sv !== "valide"}
                        title={sv !== undefined && sv !== "valide" ? "La facture doit d'abord être validée par le chef comptable" : undefined}
                      >
                        <Check className="size-3.5" /> Marquer payée
                      </Button>
                    )}
                    {engagee ? (
                      !annulee && onAnnuler && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm(
                              `Annuler la facture ${f.numero} ?

Elle restera dans la liste, au statut « annulée ». ` +
                              "Ses écritures seront contre-passées à la date du jour" +
                              (f.statut === "payee" ? " et sa recette retirée de la trésorerie." : "."),
                            )) {
                              onAnnuler(f.id);
                            }
                          }}
                          title="Une facture validée ou payée ne se supprime pas : elle s'annule"
                        >
                          <Ban className="size-3.5" /> Annuler
                        </Button>
                      )
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          if (confirm("Supprimer cette facture ?")) {
                            onRemove(f.id);
                          }
                        }}
                        title="Supprimer (facture non validée)"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <OCRFacture open={ocrOpen} onOpenChange={setOcrOpen} onExtracted={applyOCRDraft} />

      {/* Choix du compte d'encaissement au règlement d'une facture */}
      <Dialog open={paiementFacture != null} onOpenChange={(o) => { if (!o) setPaiementFacture(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Règlement de la facture {paiementFacture?.numero}</DialogTitle>
            <DialogDescription>
              {paiementFacture && (
                <>
                  {formatMontant(paiementFacture.avecTva ? paiementFacture.totalTtc : paiementFacture.totalHT)} reçus
                  de {paiementFacture.client}. Où l'argent a-t-il été encaissé ?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {([
              ["571", "Caisse", "Espèces (compte 571)", Wallet],
              ["521", "Banque", "Virement, chèque, mobile money (compte 521)", Landmark],
            ] as const).map(([compte, titre, detail, Icone]) => (
              <Button
                key={compte}
                variant="outline"
                className="h-auto flex-col gap-1 py-4"
                onClick={() => {
                  if (paiementFacture) onMarquerPayee(paiementFacture.id, compte);
                  setPaiementFacture(null);
                }}
              >
                <Icone className="size-5" />
                <span className="font-semibold">{titre}</span>
                <span className="text-xs text-muted-foreground font-normal whitespace-normal text-center">{detail}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};