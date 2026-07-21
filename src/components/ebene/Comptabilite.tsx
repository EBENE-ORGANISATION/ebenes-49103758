import { useMemo, useState, useRef, useEffect } from "react";
import {
  ActiviteType,
  DonneesMensuelles,
  Employe,
  EcritureComptable,
  MoisData,
  Transaction,
  TauxFiscaux,
  StatutValidation,
} from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, X, Paperclip, FileText, Eye, Check, XCircle, AlertTriangle, BookOpen } from "lucide-react";
import { StatCard } from "./StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMontant, formatMontantSigne, todayISO } from "@/lib/ebene-utils";
import { toast } from "sonner";
import { detectAnomalies, type Anomalie } from "@/lib/anomalies";
import { ActiviteSelect } from "./ActiviteSelect";
import { useActiviteFilter } from "@/hooks/useActiviteFilter";
import { SaisieGuidee } from "./comptabilite/SaisieGuidee";
import { SaisieExpert } from "./comptabilite/SaisieExpert";
import { JournalEcritures } from "./comptabilite/JournalEcritures";
import { GrandLivre } from "./comptabilite/GrandLivre";
import { Balance } from "./comptabilite/Balance";
import { BilanSYSCOHADA } from "./comptabilite/BilanSYSCOHADA";
import { CompteResultat } from "./comptabilite/CompteResultat";

interface Props {
  data: MoisData;
  annee: number;
  mois: number;
  employes: Employe[];
  taux: TauxFiscaux;
  onAdd: (t: Omit<Transaction, "id">) => void;
  onRemove: (id: number) => void;
  /** Si true, affiche les boutons Valider / Rejeter (chef compta). */
  isChefCompta?: boolean;
  onValider?: (id: number) => void;
  onRejeter?: (id: number, motif: string) => void;
  /** Toutes les données de l'année — sert au calcul d'anomalies et au Grand-Livre. */
  donneesMensuelles?: DonneesMensuelles;
  /** Écritures comptables SYSCOHADA */
  onAddEcriture?: (e: Omit<EcritureComptable, "id">) => void;
  onValiderEcriture?: (id: number) => void;
  onRejeterEcriture?: (id: number, motif: string) => void;
  onRemoveEcriture?: (id: number) => void;
  /** Indique que les données sont en cours de chargement depuis Supabase */
  isLoading?: boolean;
}

const STATUT_BADGES: Record<StatutValidation, { cls: string; label: string }> = {
  brouillon:     { cls: "bg-muted text-muted-foreground",          label: "Brouillon" },
  en_validation: { cls: "bg-warning/15 text-warning",              label: "En validation" },
  valide:        { cls: "bg-success/15 text-success",              label: "✓ Validé" },
  rejete:        { cls: "bg-destructive/15 text-destructive",      label: "✗ Rejeté" },
};

export const Comptabilite = ({
  data,
  annee,
  mois,
  onAdd,
  onRemove,
  isChefCompta,
  onValider,
  onRejeter,
  donneesMensuelles,
  taux,
  onAddEcriture,
  onValiderEcriture,
  onRejeterEcriture,
  onRemoveEcriture,
  isLoading = false,
}: Props) => {
  // ── États onglet Trésorerie (existants — inchangés) ─────────────────────────
  const [open, setOpen]             = useState(false);
  const [date, setDate]             = useState(todayISO());
  const [type, setType]             = useState<"r" | "d">("r");
  const [activite, setActivite]     = useState<ActiviteType>("service");
  const { currentActiviteId } = useActiviteFilter();
  const [activiteId, setActiviteId] = useState<string | null>(currentActiviteId);
  // Garde le compartiment du formulaire aligné sur l'activité sélectionnée
  // dans l'en-tête, tout en autorisant un choix par saisie.
  useEffect(() => { setActiviteId(currentActiviteId); }, [currentActiviteId]);
  const [desc, setDesc]             = useState("");
  const [montant, setMontant]       = useState("");
  const [fournisseur, setFournisseur] = useState("");
  const [piece, setPiece]           = useState<{ nom: string; type: string; data: string } | null>(null);
  const [previewPiece, setPreviewPiece] = useState<typeof piece>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── États onglet Saisie SYSCOHADA (nouveaux) ────────────────────────────────
  const [modeGuide, setModeGuide]   = useState(true);
  const [showSaisie, setShowSaisie] = useState(false);

  // ── Écritures SYSCOHADA du mois ─────────────────────────────────────────────
  const ecritures: EcritureComptable[] = data.ecritures || [];

  // ── Calculs Trésorerie (existants — inchangés) ──────────────────────────────
  // Les charges salariales n'apparaissent en dépenses que lorsqu'un bulletin
  // est marqué comme PAYÉ (payerBulletin ajoute alors une transaction
  // source="salaires"). Aucune ligne auto n'est plus injectée ici.
  const totals = useMemo(() => {
    const rec = data.transactions.filter((t) => t.type === "r").reduce((a, t) => a + t.m, 0);
    const recFact = data.transactions
      .filter((t) => t.type === "r" && t.source === "facture")
      .reduce((a, t) => a + t.m, 0);
    const dep = Math.abs(
      data.transactions.filter((t) => t.type === "d").reduce((a, t) => a + t.m, 0)
    );
    const depSalaires = Math.abs(
      data.transactions
        .filter((t) => t.type === "d" && t.source === "salaires")
        .reduce((a, t) => a + t.m, 0)
    );

    // Consolidation SYSCOHADA : comptes 52x (Banque) / 57x (Caisse), écritures validées,
    // hors écritures liées à une facture (déjà comptées via transactions).
    const lignesEcr = ecritures
      .filter((e) => e.statut !== "brouillon" && !e.factureId)
      .flatMap((e) => (Array.isArray(e.lignes) ? e.lignes : []))
      .filter((l) => l.compte.startsWith("52") || l.compte.startsWith("57"));
    const recEcritures = lignesEcr.reduce((s, l) => s + l.debit,  0);
    const depEcritures = lignesEcr.reduce((s, l) => s + l.credit, 0);
    const hasEcritures = ecritures.some((e) => e.statut !== "brouillon");

    return {
      rec: rec + recEcritures,
      recFact,
      dep: dep + depEcritures,
      depSalaires,
      solde: (rec + recEcritures) - (dep + depEcritures),
      hasEcritures,
      recEcritures,
      depEcritures,
    };
  }, [data.transactions, ecritures]);

  const sorted = useMemo(
    () => [...data.transactions].sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [data.transactions]
  );

  // Anomalies sur l'année entière (si fournie). Sinon, on tombe sur le mois courant.
  const anomaliesMap = useMemo(
    () =>
      detectAnomalies(
        donneesMensuelles ?? ({ [`${annee}-${mois}`]: data } as DonneesMensuelles)
      ),
    [donneesMensuelles, data, annee, mois]
  );

  // ── Handlers Trésorerie (existants — inchangés) ──────────────────────────────
  const handleFile = (file: File) => {
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Fichier trop volumineux (max 3 Mo)");
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      setPiece({ nom: file.name, type: file.type, data: String(r.result || "") });
      toast.success("Pièce jointe ajoutée");
    };
    r.readAsDataURL(file);
  };

  const reset = () => {
    setDesc("");
    setMontant("");
    setFournisseur("");
    setPiece(null);
    setActivite("service");
    setActiviteId(currentActiviteId);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = () => {
    const m = parseFloat(montant);
    if (!desc.trim()) return toast.error("La description est obligatoire.");
    if (isNaN(m) || m <= 0) return toast.error("Montant invalide.");
    if (!date) return toast.error("Date obligatoire.");
    onAdd({
      date,
      desc: desc.trim(),
      type,
      m: type === "d" ? -m : m,
      source: type === "d" && piece ? "fournisseur" : "manuelle",
      fournisseur: fournisseur.trim() || null,
      activite: type === "r" ? activite : undefined,
      activiteId,
      pieceJointe: piece?.data || null,
      pieceJointeNom: piece?.nom || null,
      pieceJointeType: piece?.type || null,
    });
    reset();
    setOpen(false);
  };

  // ── Handler Saisie SYSCOHADA ─────────────────────────────────────────────────
  const handleSaveEcriture = (ecriture: Omit<EcritureComptable, "id">) => {
    if (onAddEcriture) {
      onAddEcriture(ecriture);
      toast.success(`Écriture ${ecriture.numeroPiece} enregistrée — Journal ${ecriture.journal}`);
    } else {
      toast.error("Droits insuffisants pour enregistrer une écriture.");
    }
    setShowSaisie(false);
  };

  // ── Rendu ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* E1 — Skeleton loading pendant chargement Supabase */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="border rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && (
        <>
      <Tabs defaultValue="tresorerie" className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-7 w-full mb-4 h-auto">
          <TabsTrigger value="saisie" className="py-2 text-xs sm:text-sm">
            📒 Saisie
          </TabsTrigger>
          <TabsTrigger value="tresorerie" className="py-2 text-xs sm:text-sm">
            💰 Trésorerie
          </TabsTrigger>
          <TabsTrigger value="journal" className="py-2 text-xs sm:text-sm">
            📋 Journal ({ecritures.length})
          </TabsTrigger>
          <TabsTrigger value="grandlivre" className="py-2 text-xs sm:text-sm">
            📖 Grand-Livre
          </TabsTrigger>
          <TabsTrigger value="balance" className="py-2 text-xs sm:text-sm">
            ⚖️ Balance
          </TabsTrigger>
          <TabsTrigger value="bilan" className="py-2 text-xs sm:text-sm">
            📊 Bilan
          </TabsTrigger>
          <TabsTrigger value="resultat" className="py-2 text-xs sm:text-sm">
            📈 Résultat
          </TabsTrigger>
        </TabsList>

        {/* ── Onglet Saisie SYSCOHADA ──────────────────────────────────────── */}
        <TabsContent value="saisie" className="space-y-4">
          {!showSaisie ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => { setModeGuide(true); setShowSaisie(true); }}
                  className="gap-1.5"
                >
                  <Plus className="size-4" /> Saisie guidée
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setModeGuide(false); setShowSaisie(true); }}
                  className="gap-1.5"
                >
                  <Plus className="size-4" /> Saisie expert
                </Button>
              </div>
              <div className="bg-muted/30 border rounded-lg p-4 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">
                  📒 Comptabilité en partie double — SYSCOHADA
                </p>
                <p>
                  La <strong>saisie guidée</strong> traduit automatiquement vos opérations en
                  écritures comptables correctes (comptes SYSCOHADA, TVA 18%, etc.).
                </p>
                <p className="mt-1">
                  La <strong>saisie expert</strong> permet une saisie directe débit/crédit avec
                  autocomplétion du plan comptable (130+ comptes Classes 1→8).
                </p>
              </div>
              {ecritures.length === 0 && !showSaisie && (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 border-2 border-dashed border-border rounded-xl">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <BookOpen className="size-7 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Aucune écriture ce mois</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Commencez par la saisie guidée pour générer automatiquement les écritures SYSCOHADA.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => { setModeGuide(true); setShowSaisie(true); }}
                    className="gap-1.5 mt-1"
                  >
                    <Plus className="size-4" /> Nouvelle saisie guidée
                  </Button>
                </div>
              )}
            </div>
          ) : modeGuide ? (
            <SaisieGuidee
              annee={annee}
              mois={mois}
              sequenceEcritures={ecritures.length}
              onSave={handleSaveEcriture}
              onCancel={() => setShowSaisie(false)}
              tauxTVA={taux?.tva ?? 0.18}
            />
          ) : (
            <SaisieExpert
              annee={annee}
              mois={mois}
              sequenceEcritures={ecritures.length}
              onSave={handleSaveEcriture}
              onCancel={() => setShowSaisie(false)}
            />
          )}
        </TabsContent>

        {/* ── Onglet Trésorerie — code existant intact ─────────────────────── */}
        <TabsContent value="tresorerie">
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard
                label="Recettes (Mois)"
                value={formatMontant(totals.rec)}
                tone="success"
                hint={
                  totals.hasEcritures && totals.recEcritures > 0
                    ? `Dont factures : ${formatMontant(totals.recFact)} · SYSCOHADA : ${formatMontant(totals.recEcritures)}`
                    : `Dont factures : ${formatMontant(totals.recFact)}`
                }
              />
              <StatCard
                label="Dépenses (Mois)"
                value={formatMontant(totals.dep)}
                tone="destructive"
                hint={
                  totals.hasEcritures && totals.depEcritures > 0
                    ? `SYSCOHADA : ${formatMontant(totals.depEcritures)}${totals.depSalaires > 0 ? ` · Salaires : ${formatMontant(totals.depSalaires)}` : ""}`
                    : totals.depSalaires > 0
                    ? `Dont salaires payés : ${formatMontant(totals.depSalaires)}`
                    : undefined
                }
              />
              <StatCard
                label="Solde (Mois)"
                value={formatMontantSigne(totals.solde)}
                tone={totals.solde >= 0 ? "info" : "destructive"}
                hint={totals.hasEcritures ? "Transactions + écritures SYSCOHADA" : undefined}
              />
            </div>

            {!open ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setOpen(true)} className="gap-1.5">
                  <Plus className="size-4" /> Ajouter Transaction
                </Button>
                <span className="text-xs text-muted-foreground">
                  <Paperclip className="size-3 inline mr-1" />
                  Pour importer une <strong>facture fournisseur</strong> (PDF / image), choisissez le type
                  <em> Dépense</em> puis cliquez sur <em>Joindre facture</em>.
                </span>
              </div>
            ) : (
              <div className="bg-muted/40 border-2 border-border rounded-xl p-5 space-y-4">
                <h3 className="font-bold text-lg">Nouvelle Transaction</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Date *</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Type *</Label>
                    <Select value={type} onValueChange={(v) => setType(v as "r" | "d")}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="r">💚 Recette</SelectItem>
                        <SelectItem value="d">❤️ Dépense</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Description *</Label>
                  <Input value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-1" />
                </div>

                <ActiviteSelect value={activiteId} onChange={setActiviteId} allowNone={false} />

                {type === "r" && (
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Activité (impacte la patente) *
                    </Label>
                    <Select value={activite} onValueChange={(v) => setActivite(v as ActiviteType)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="service">🛠️ Prestation de service (0,75%)</SelectItem>
                        <SelectItem value="commerce">🛒 Commerce (0,55%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Montant (FCFA) *</Label>
                    <Input type="number" value={montant} onChange={(e) => setMontant(e.target.value)} className="mt-1" />
                  </div>
                  {type === "d" && (
                    <div>
                      <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Fournisseur</Label>
                      <Input value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} className="mt-1" placeholder="(facultatif)" />
                    </div>
                  )}
                </div>

                {type === "d" && (
                  <div className="border-2 border-dashed border-border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Paperclip className="size-4 text-muted-foreground" />
                        {piece ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate font-medium">{piece.nom}</span>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setPreviewPiece(piece)}>
                              <Eye className="size-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => { setPiece(null); if (fileRef.current) fileRef.current.value = ""; }}>
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Aucune pièce jointe</span>
                        )}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                        {piece ? "Remplacer" : "Joindre facture"}
                      </Button>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      PDF ou image (max 3 Mo). La pièce sera attachée à la dépense.
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button onClick={submit} className="bg-success text-success-foreground hover:bg-success/90">✓ Enregistrer</Button>
                  <Button variant="outline" onClick={() => { setOpen(false); reset(); }} className="gap-1.5">
                    <X className="size-4" /> Annuler
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {sorted.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 italic">Aucune transaction pour ce mois</p>
              ) : (
                sorted.map((t) => {
                  const anomalies: Anomalie[] = anomaliesMap.transactions.get(t.id) || [];
                  return (
                    <div
                      key={t.id}
                      className={`list-item flex items-center justify-between gap-3 ${
                        t.source === "facture"    ? "border-l-4 border-l-info"    :
                        t.source === "fournisseur" ? "border-l-4 border-l-warning" : ""
                      } ${t.statut === "brouillon" ? "opacity-50" : ""}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold truncate">{t.desc}</p>
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
                          {t.statut && (
                            t.statut === "rejete" && t.motifRejet ? (
                              <TooltipProvider delayDuration={150}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className={`badge-soft cursor-help ${STATUT_BADGES[t.statut].cls}`}>
                                      {STATUT_BADGES[t.statut].label}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs max-w-xs">Motif : {t.motifRejet}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className={`badge-soft ${STATUT_BADGES[t.statut].cls}`}>
                                {STATUT_BADGES[t.statut].label}
                              </span>
                            )
                          )}
                          {t.source === "facture"    && <span className="badge-soft bg-info/15 text-info">Facture</span>}
                          {t.source === "fournisseur" && <span className="badge-soft bg-warning/15 text-warning">Fournisseur</span>}
                          {t.pieceJointe && (
                            <button
                              className="badge-soft bg-muted text-foreground flex items-center gap-1 hover:bg-muted/70"
                              onClick={() => setPreviewPiece({ nom: t.pieceJointeNom || "pièce", type: t.pieceJointeType || "", data: t.pieceJointe || "" })}
                            >
                              <Paperclip className="size-3" /> Pièce
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t.date} • {t.type === "r" ? "Recette" : "Dépense"}
                          {t.fournisseur && ` • ${t.fournisseur}`}
                        </p>
                        {t.statut === "rejete" && t.motifRejet && (
                          <p className="text-xs text-destructive mt-1 italic">
                            Motif du rejet : {t.motifRejet}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`amount text-sm sm:text-base ${t.m >= 0 ? "text-success" : "text-destructive"}`}>
                          {t.m >= 0 ? "+" : "-"} {Math.abs(t.m).toLocaleString("fr-FR")} F
                        </span>
                        {isChefCompta && t.statut !== "valide" && onValider && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-success hover:text-success hover:bg-success/10"
                            onClick={() => onValider(t.id)}
                            title="Valider"
                          >
                            <Check className="size-4" />
                          </Button>
                        )}
                        {isChefCompta && t.statut !== "rejete" && onRejeter && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-warning hover:text-warning hover:bg-warning/10"
                            onClick={() => {
                              const motif = window.prompt("Motif du rejet :", "");
                              if (motif && motif.trim()) onRejeter(t.id, motif.trim());
                            }}
                            title="Rejeter"
                          >
                            <XCircle className="size-4" />
                          </Button>
                        )}
                        {isChefCompta && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (
                                t.source === "facture" && t.factureId
                                  ? confirm("Cette transaction est liée à une facture payée. La supprimer remettra la facture en attente. Confirmer ?")
                                  : confirm("Supprimer cette transaction ?")
                              ) {
                                onRemove(t.id);
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Onglet Journal des écritures SYSCOHADA ───────────────────────── */}
        <TabsContent value="journal">
          <JournalEcritures
            ecritures={ecritures}
            isChefCompta={isChefCompta}
            onValider={
              onValiderEcriture
                ? (id) => {
                    onValiderEcriture(id);
                    toast.success("Écriture validée");
                  }
                : undefined
            }
            onRejeter={
              onRejeterEcriture
                ? (id, motif) => {
                    onRejeterEcriture(id, motif);
                    toast.warning(`Écriture rejetée : ${motif}`);
                  }
                : undefined
            }
            onSupprimer={
              onRemoveEcriture
                ? (id) => {
                    onRemoveEcriture(id);
                    toast.success("Écriture supprimée");
                  }
                : undefined
            }
          />
        </TabsContent>

        {/* ── Onglet Grand-Livre ────────────────────────────────────────────── */}
        <TabsContent value="grandlivre">
          {donneesMensuelles ? (
            <GrandLivre donneesMensuelles={donneesMensuelles} annee={annee} />
          ) : (
            <p className="text-center text-muted-foreground py-10 italic">
              Données annuelles non disponibles.
            </p>
          )}
        </TabsContent>

        {/* ── Onglet Balance ───────────────────────────────────────────────── */}
        <TabsContent value="balance">
          {donneesMensuelles ? (
            <Balance donneesMensuelles={donneesMensuelles} annee={annee} />
          ) : (
            <p className="text-center text-muted-foreground py-10 italic">
              Données annuelles non disponibles.
            </p>
          )}
        </TabsContent>

        {/* ── Onglet Bilan SYSCOHADA ───────────────────────────────────────── */}
        <TabsContent value="bilan">
          <BilanSYSCOHADA
            donneesMensuelles={donneesMensuelles ?? {}}
            annee={annee}
          />
        </TabsContent>

        {/* ── Onglet Compte de Résultat ────────────────────────────────────── */}
        <TabsContent value="resultat">
          <CompteResultat
            donneesMensuelles={donneesMensuelles ?? {}}
            annee={annee}
          />
        </TabsContent>
      </Tabs>

      {/* Preview pièce jointe — partagé entre tous les onglets */}
      {previewPiece && (
        <div className="modal-overlay" onClick={() => setPreviewPiece(null)}>
          <div className="modal-box w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold flex items-center gap-2">
                <FileText className="size-4" /> {previewPiece.nom}
              </p>
              <Button size="sm" variant="ghost" onClick={() => setPreviewPiece(null)}>
                <X className="size-4" />
              </Button>
            </div>
            {previewPiece.type.startsWith("image/") ? (
              <img src={previewPiece.data} alt={previewPiece.nom} className="max-w-full mx-auto" />
            ) : previewPiece.type === "application/pdf" ? (
              <iframe src={previewPiece.data} className="w-full h-[70vh]" title={previewPiece.nom} />
            ) : (
              <a href={previewPiece.data} download={previewPiece.nom} className="text-primary underline">
                Télécharger {previewPiece.nom}
              </a>
            )}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
