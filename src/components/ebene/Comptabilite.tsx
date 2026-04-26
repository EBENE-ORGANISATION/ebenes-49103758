import { useMemo, useState, useRef } from "react";
import { ActiviteType, DonneesMensuelles, Employe, MoisData, Transaction, TauxFiscaux, StatutValidation } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, X, Paperclip, FileText, Lock, Eye, Check, XCircle, AlertTriangle } from "lucide-react";
import { StatCard } from "./StatCard";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMontant, formatMontantSigne, todayISO } from "@/lib/ebene-utils";
import { calculerPaie } from "./grh/BulletinPaie";
import { toast } from "sonner";
import { detectAnomalies, type Anomalie } from "@/lib/anomalies";

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
  /** Toutes les données de l'année — sert au calcul d'anomalies. */
  donneesMensuelles?: DonneesMensuelles;
}

const STATUT_BADGES: Record<StatutValidation, { cls: string; label: string }> = {
  brouillon: { cls: "bg-muted text-muted-foreground", label: "Brouillon" },
  en_validation: { cls: "bg-warning/15 text-warning", label: "En validation" },
  valide: { cls: "bg-success/15 text-success", label: "✓ Validé" },
  rejete: { cls: "bg-destructive/15 text-destructive", label: "✗ Rejeté" },
};

export const Comptabilite = ({ data, annee, mois, employes, onAdd, onRemove, isChefCompta, onValider, onRejeter, donneesMensuelles }: Props) => {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState<"r" | "d">("r");
  const [activite, setActivite] = useState<ActiviteType>("service");
  const [desc, setDesc] = useState("");
  const [montant, setMontant] = useState("");
  const [fournisseur, setFournisseur] = useState("");
  const [piece, setPiece] = useState<{ nom: string; type: string; data: string } | null>(null);
  const [previewPiece, setPreviewPiece] = useState<typeof piece>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Calcul auto du total salaires (net + part patronale)
  const salairesAuto = useMemo(() => {
    if (employes.length === 0) return null;
    let net = 0;
    let patronal = 0;
    employes.forEach((e) => {
      const c = calculerPaie(e, data);
      net += c.net;
      patronal += c.totalPatronal;
    });
    const total = net + patronal;
    if (total <= 0) return null;
    return { net, patronal, total };
  }, [employes, data]);

  // Transactions "vraies" + ligne auto salaires affichée en tête
  const totals = useMemo(() => {
    const rec = data.transactions.filter((t) => t.type === "r").reduce((a, t) => a + t.m, 0);
    const recFact = data.transactions
      .filter((t) => t.type === "r" && t.source === "facture")
      .reduce((a, t) => a + t.m, 0);
    const depReelles = Math.abs(
      data.transactions.filter((t) => t.type === "d").reduce((a, t) => a + t.m, 0)
    );
    const depAvecSalaires = depReelles + (salairesAuto?.total || 0);
    return {
      rec,
      recFact,
      dep: depAvecSalaires,
      depReelles,
      solde: rec - depAvecSalaires,
    };
  }, [data.transactions, salairesAuto]);

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
      pieceJointe: piece?.data || null,
      pieceJointeNom: piece?.nom || null,
      pieceJointeType: piece?.type || null,
    });
    reset();
    setOpen(false);
  };

  const moisLabel = `${String(mois).padStart(2, "0")}/${annee}`;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Recettes (Mois)"
          value={formatMontant(totals.rec)}
          tone="success"
          hint={`Dont factures : ${formatMontant(totals.recFact)}`}
        />
        <StatCard
          label="Dépenses (Mois)"
          value={formatMontant(totals.dep)}
          tone="destructive"
          hint={salairesAuto ? `Dont salaires : ${formatMontant(salairesAuto.total)}` : undefined}
        />
        <StatCard
          label="Solde (Mois)"
          value={formatMontantSigne(totals.solde)}
          tone={totals.solde >= 0 ? "info" : "destructive"}
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
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }} className="gap-1.5"><X className="size-4" /> Annuler</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {/* Ligne auto salaires non éditable */}
        {salairesAuto && (
          <div className="list-item flex items-center justify-between gap-3 border-l-4 border-l-purple bg-purple/5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold truncate">Total salaires {moisLabel} (auto)</p>
                <span className="badge-soft bg-purple/15 text-purple flex items-center gap-1">
                  <Lock className="size-3" /> Auto
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Net : {formatMontant(salairesAuto.net)} • Part patronale : {formatMontant(salairesAuto.patronal)}
              </p>
            </div>
            <span className="amount text-sm sm:text-base text-destructive">
              - {salairesAuto.total.toLocaleString("fr-FR")} F
            </span>
          </div>
        )}

        {sorted.length === 0 && !salairesAuto ? (
          <p className="text-center text-muted-foreground py-8 italic">Aucune transaction pour ce mois</p>
        ) : (
          sorted.map((t) => {
            const anomalies: Anomalie[] = anomaliesMap.transactions.get(t.id) || [];
            return (
            <div
              key={t.id}
              className={`list-item flex items-center justify-between gap-3 ${
                t.source === "facture" ? "border-l-4 border-l-info" : t.source === "fournisseur" ? "border-l-4 border-l-warning" : ""
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
                  {t.source === "facture" && <span className="badge-soft bg-info/15 text-info">Facture</span>}
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
              </div>
            </div>
            );
          })
        )}
      </div>

      {/* Preview pièce jointe */}
      {previewPiece && (
        <div className="modal-overlay" onClick={() => setPreviewPiece(null)}>
          <div className="modal-box w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold flex items-center gap-2"><FileText className="size-4" /> {previewPiece.nom}</p>
              <Button size="sm" variant="ghost" onClick={() => setPreviewPiece(null)}><X className="size-4" /></Button>
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
    </div>
  );
};
