import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Check, AlertCircle, ChevronLeft, Loader2,
  ShoppingCart, ShoppingBag, Landmark, Receipt, MoreHorizontal,
} from "lucide-react";
import {
  type EcritureComptable,
  type CodeJournal,
  type TypeOperationGuide,
  TYPE_OPERATION_LABELS,
  type LigneEcriture,
} from "@/types/ebene";
import {
  genererLignesEcriture,
  genererNumeroPiece,
  isEcritureEquilibree,
} from "@/lib/planComptable";
import { todayISO } from "@/lib/ebene-utils";

interface Props {
  annee: number;
  mois: number;
  /** Nombre d'écritures existantes ce mois — sert à la numérotation automatique. */
  sequenceEcritures: number;
  onSave: (ecriture: Omit<EcritureComptable, "id">) => void;
  onCancel: () => void;
  tauxTVA?: number;
}

/** Mapping type d'opération → journal comptable SYSCOHADA. */
const JOURNAL_PAR_TYPE: Record<TypeOperationGuide, CodeJournal> = {
  vente_marchandises:     "VE",
  vente_services:         "VE",
  achat_marchandises:     "AC",
  achat_fournitures:      "AC",
  achat_service:          "AC",
  encaissement_client:    "BQ",
  paiement_fournisseur:   "BQ",
  charge_loyer:           "BQ",
  charge_telephone:       "BQ",
  charge_electricite:     "BQ",
  charge_salaires:        "OD",
  tva_a_decaisser:        "OD",
  dotation_amortissement: "OD",
  autre:                  "OD",
};

/** Opérations pour lesquelles le toggle TVA n'a pas de sens. */
const OPS_SANS_TVA: TypeOperationGuide[] = [
  "encaissement_client",
  "paiement_fournisseur",
  "charge_salaires",
  "tva_a_decaisser",
  "dotation_amortissement",
  "autre",
];

interface OperationCard {
  type: TypeOperationGuide;
  icon: React.ReactNode;
  description: string;
  color: string;
}

// F1 — Groupes de cartes visuelles
const OPERATION_GROUPS: { label: string; icon: React.ReactNode; cards: OperationCard[] }[] = [
  {
    label: "Ventes",
    icon: <ShoppingCart className="size-3.5" />,
    cards: [
      {
        type: "vente_marchandises",
        icon: <ShoppingCart className="size-5" />,
        description: "Marchandises vendues à un client",
        color: "text-emerald-600 bg-emerald-500/10 border-emerald-200 hover:border-emerald-400",
      },
      {
        type: "vente_services",
        icon: <ShoppingCart className="size-5" />,
        description: "Prestation de service ou facturation",
        color: "text-emerald-600 bg-emerald-500/10 border-emerald-200 hover:border-emerald-400",
      },
    ],
  },
  {
    label: "Achats",
    icon: <ShoppingBag className="size-3.5" />,
    cards: [
      {
        type: "achat_marchandises",
        icon: <ShoppingBag className="size-5" />,
        description: "Achat de stock pour revente",
        color: "text-orange-600 bg-orange-500/10 border-orange-200 hover:border-orange-400",
      },
      {
        type: "achat_fournitures",
        icon: <ShoppingBag className="size-5" />,
        description: "Fournitures ou matières premières",
        color: "text-orange-600 bg-orange-500/10 border-orange-200 hover:border-orange-400",
      },
      {
        type: "achat_service",
        icon: <ShoppingBag className="size-5" />,
        description: "Sous-traitance ou service externe",
        color: "text-orange-600 bg-orange-500/10 border-orange-200 hover:border-orange-400",
      },
    ],
  },
  {
    label: "Trésorerie",
    icon: <Landmark className="size-3.5" />,
    cards: [
      {
        type: "encaissement_client",
        icon: <Landmark className="size-5" />,
        description: "Paiement reçu d'un client (banque)",
        color: "text-blue-600 bg-blue-500/10 border-blue-200 hover:border-blue-400",
      },
      {
        type: "paiement_fournisseur",
        icon: <Landmark className="size-5" />,
        description: "Règlement d'un fournisseur (banque)",
        color: "text-blue-600 bg-blue-500/10 border-blue-200 hover:border-blue-400",
      },
    ],
  },
  {
    label: "Charges",
    icon: <Receipt className="size-3.5" />,
    cards: [
      {
        type: "charge_loyer",
        icon: <Receipt className="size-5" />,
        description: "Loyer mensuel du local",
        color: "text-purple-600 bg-purple-500/10 border-purple-200 hover:border-purple-400",
      },
      {
        type: "charge_telephone",
        icon: <Receipt className="size-5" />,
        description: "Téléphone, internet, abonnements",
        color: "text-purple-600 bg-purple-500/10 border-purple-200 hover:border-purple-400",
      },
      {
        type: "charge_electricite",
        icon: <Receipt className="size-5" />,
        description: "Électricité, eau, énergie",
        color: "text-purple-600 bg-purple-500/10 border-purple-200 hover:border-purple-400",
      },
      {
        type: "charge_salaires",
        icon: <Receipt className="size-5" />,
        description: "Salaires et charges sociales",
        color: "text-purple-600 bg-purple-500/10 border-purple-200 hover:border-purple-400",
      },
    ],
  },
  {
    label: "Autres",
    icon: <MoreHorizontal className="size-3.5" />,
    cards: [
      {
        type: "tva_a_decaisser",
        icon: <MoreHorizontal className="size-5" />,
        description: "Règlement TVA à l'administration",
        color: "text-gray-600 bg-gray-500/10 border-gray-200 hover:border-gray-400",
      },
      {
        type: "dotation_amortissement",
        icon: <MoreHorizontal className="size-5" />,
        description: "Dotation aux amortissements",
        color: "text-gray-600 bg-gray-500/10 border-gray-200 hover:border-gray-400",
      },
      {
        type: "autre",
        icon: <MoreHorizontal className="size-5" />,
        description: "Opération diverse (OD)",
        color: "text-gray-600 bg-gray-500/10 border-gray-200 hover:border-gray-400",
      },
    ],
  },
];

export const SaisieGuidee = ({
  annee,
  mois,
  sequenceEcritures,
  onSave,
  onCancel,
  tauxTVA = 0.18,
}: Props) => {
  const [step, setStep]           = useState<"type" | "details">("type");
  const [typeOp, setTypeOp]       = useState<TypeOperationGuide>("vente_services");
  const [montantHT, setMontantHT] = useState("");
  const [avecTva, setAvecTva]     = useState(true);
  const [tiers, setTiers]         = useState("");
  const [libelle, setLibelle]     = useState("");
  const [date, setDate]           = useState(todayISO());
  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [saving, setSaving]       = useState(false);

  const montant = parseFloat(montantHT) || 0;
  const journal = JOURNAL_PAR_TYPE[typeOp];

  // F2 — Aperçu temps réel des lignes SYSCOHADA
  const lignesPreview: LigneEcriture[] =
    montant > 0
      ? genererLignesEcriture(typeOp, { montantHT: montant, tva: tauxTVA, avecTva, tiers })
      : [];

  const totalDebit  = lignesPreview.reduce((s, l) => s + l.debit,  0);
  const totalCredit = lignesPreview.reduce((s, l) => s + l.credit, 0);
  const equilibre   = isEcritureEquilibree(lignesPreview);

  const handleSelectType = (t: TypeOperationGuide) => {
    setTypeOp(t);
    setStep("details");
    setErrors({});
  };

  // F6 — Validation avec erreurs granulaires
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!date)                       errs.date    = "Date obligatoire";
    if (!montant || montant <= 0)    errs.montant = "Montant obligatoire et positif";
    if (lignesPreview.length === 0)  errs.global  = "Aucune ligne générée — type invalide";
    else if (!equilibre)             errs.global  = "Écriture déséquilibrée — vérifiez les montants";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // F7 — Spinner + async save
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 300));
    setSaving(false);
    onSave({
      date,
      journal,
      numeroPiece: genererNumeroPiece(journal, annee, sequenceEcritures + 1),
      libelle:     libelle.trim() || TYPE_OPERATION_LABELS[typeOp],
      lignes:      lignesPreview,
      statut:      "brouillon",
      annee,
      mois,
    });
  };

  // ── Étape 1 : Sélection visuelle du type d'opération ────────────────────────
  if (step === "type") {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold">Quel type d'opération souhaitez-vous saisir ?</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sélectionnez l'opération — les écritures SYSCOHADA seront générées automatiquement.
          </p>
        </div>

        {OPERATION_GROUPS.map((group) => (
          <div key={group.label} className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {group.icon} {group.label}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {group.cards.map((card) => (
                <button
                  key={card.type}
                  type="button"
                  onClick={() => handleSelectType(card.type)}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all hover:scale-[1.01] hover:shadow-md ${card.color}`}
                >
                  <div className="shrink-0 mt-0.5">{card.icon}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">{TYPE_OPERATION_LABELS[card.type]}</p>
                    <p className="text-xs opacity-75 mt-0.5">{card.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="pt-1">
          <Button variant="outline" onClick={onCancel}>Annuler</Button>
        </div>
      </div>
    );
  }

  // ── Étape 2 : Saisie des détails ─────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Fil d'Ariane + retour à l'étape 1 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 h-7 text-xs"
          onClick={() => setStep("type")}
        >
          <ChevronLeft className="size-3.5" /> Changer le type
        </Button>
        <span className="text-xs text-muted-foreground">→</span>
        <span className="text-xs font-semibold">{TYPE_OPERATION_LABELS[typeOp]}</span>
        <Badge variant="outline" className="text-[10px] ml-auto">{journal}</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Date */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Date *</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setErrors((p) => ({ ...p, date: "" })); }}
            className={errors.date ? "border-destructive" : ""}
          />
          {errors.date && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="size-3" /> {errors.date}
            </p>
          )}
        </div>
        {/* Montant HT */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Montant HT (FCFA) *</Label>
          <Input
            type="number"
            min="0"
            value={montantHT}
            onChange={(e) => { setMontantHT(e.target.value); setErrors((p) => ({ ...p, montant: "" })); }}
            placeholder="0"
            className={errors.montant ? "border-destructive" : ""}
          />
          {errors.montant && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="size-3" /> {errors.montant}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Client / Fournisseur</Label>
          <Input value={tiers} onChange={(e) => setTiers(e.target.value)} placeholder="Nom (facultatif)" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Libellé (optionnel)</Label>
          <Input
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder={TYPE_OPERATION_LABELS[typeOp]}
          />
        </div>
      </div>

      {/* Toggle TVA — masqué pour les opérations sans TVA */}
      {!OPS_SANS_TVA.includes(typeOp) && (
        <div className="flex items-center gap-3">
          <Switch checked={avecTva} onCheckedChange={setAvecTva} />
          <Label className="text-sm cursor-pointer">
            Avec TVA {tauxTVA * 100}%
            {montant > 0 && avecTva && (
              <span className="text-muted-foreground ml-2">
                (TVA = {Math.round(montant * tauxTVA).toLocaleString("fr-FR")} FCFA ·{" "}
                TTC = {Math.round(montant * (1 + tauxTVA)).toLocaleString("fr-FR")} FCFA)
              </span>
            )}
          </Label>
        </div>
      )}

      {/* F2 — Aperçu SYSCOHADA en temps réel avec débit bleu / crédit vert */}
      {lignesPreview.length > 0 && (
        <div className="bg-muted/40 rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-bold uppercase text-muted-foreground">
              Écritures SYSCOHADA — Journal {journal}
            </p>
            <div className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
              equilibre
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200"
                : "bg-destructive/15 text-destructive border-destructive/30"
            }`}>
              {equilibre
                ? <><Check className="size-3" /> Équilibrée</>
                : "⚠ Déséquilibrée"
              }
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[360px]">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-3 font-semibold">Compte</th>
                  <th className="text-left py-1 pr-3 font-semibold">Intitulé</th>
                  <th className="text-right py-1 pr-3 font-semibold text-blue-700 dark:text-blue-400">Débit</th>
                  <th className="text-right py-1 font-semibold text-emerald-700 dark:text-emerald-400">Crédit</th>
                </tr>
              </thead>
              <tbody>
                {lignesPreview.map((l, i) => (
                  <tr
                    key={l.id}
                    className={`border-b border-border/50 ${i % 2 === 0 ? "bg-background" : "bg-muted/10"}`}
                  >
                    <td className="py-1 pr-3 font-mono font-bold text-primary">{l.compte}</td>
                    <td className="py-1 pr-3 text-muted-foreground">
                      {l.intitule}{l.tiers ? ` — ${l.tiers}` : ""}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums font-mono text-blue-700 dark:text-blue-400">
                      {l.debit > 0 ? l.debit.toLocaleString("fr-FR") : ""}
                    </td>
                    <td className="py-1 text-right tabular-nums font-mono text-emerald-700 dark:text-emerald-400">
                      {l.credit > 0 ? l.credit.toLocaleString("fr-FR") : ""}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold bg-muted/60 border-t-2 border-border">
                  <td colSpan={2} className="py-1 pr-3 text-xs uppercase tracking-wide">TOTAUX</td>
                  <td className="py-1 pr-3 text-right tabular-nums font-mono text-blue-700 dark:text-blue-400">
                    {totalDebit.toLocaleString("fr-FR")}
                  </td>
                  <td className="py-1 text-right tabular-nums font-mono text-emerald-700 dark:text-emerald-400">
                    {totalCredit.toLocaleString("fr-FR")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground italic">
            Ces écritures seront enregistrées en partie double dans le journal {journal}.
            Elles peuvent être modifiées en mode Expert.
          </p>
        </div>
      )}

      {/* F6 — Erreur globale inline */}
      {errors.global && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="size-4 shrink-0" /> {errors.global}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        {/* F7 — Bouton avec spinner */}
        <Button
          onClick={handleSave}
          disabled={saving || (lignesPreview.length > 0 && !equilibre)}
        >
          {saving ? (
            <><Loader2 className="size-4 mr-1.5 animate-spin" /> Enregistrement…</>
          ) : (
            <><Check className="size-4 mr-1.5" /> Enregistrer</>
          )}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Annuler
        </Button>
      </div>
    </div>
  );
};
