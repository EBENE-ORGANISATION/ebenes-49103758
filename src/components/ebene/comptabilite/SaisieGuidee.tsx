import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Check, AlertCircle } from "lucide-react";
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
  tauxTVA?: number; // 0.18 par défaut
}

/** Mapping type d'opération → journal comptable SYSCOHADA. */
const JOURNAL_PAR_TYPE: Record<TypeOperationGuide, CodeJournal> = {
  vente_marchandises:    "VE",
  vente_services:        "VE",
  achat_marchandises:    "AC",
  achat_fournitures:     "AC",
  achat_service:         "AC",
  encaissement_client:   "BQ",
  paiement_fournisseur:  "BQ",
  charge_loyer:          "BQ",
  charge_telephone:      "BQ",
  charge_electricite:    "BQ",
  charge_salaires:       "OD",
  tva_a_decaisser:       "OD",
  dotation_amortissement:"OD",
  autre:                 "OD",
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

export const SaisieGuidee = ({
  annee,
  mois,
  sequenceEcritures,
  onSave,
  onCancel,
  tauxTVA = 0.18,
}: Props) => {
  const [typeOp, setTypeOp]       = useState<TypeOperationGuide>("vente_services");
  const [montantHT, setMontantHT] = useState("");
  const [avecTva, setAvecTva]     = useState(true);
  const [tiers, setTiers]         = useState("");
  const [libelle, setLibelle]     = useState("");
  const [date, setDate]           = useState(todayISO());
  const [error, setError]         = useState("");

  const montant = parseFloat(montantHT) || 0;
  const journal = JOURNAL_PAR_TYPE[typeOp];

  // Aperçu des lignes générées en temps réel
  const lignesPreview: LigneEcriture[] =
    montant > 0
      ? genererLignesEcriture(typeOp, {
          montantHT: montant,
          tva: tauxTVA,
          avecTva,
          tiers,
        })
      : [];

  const totalDebit  = lignesPreview.reduce((s, l) => s + l.debit,  0);
  const totalCredit = lignesPreview.reduce((s, l) => s + l.credit, 0);
  const equilibre   = isEcritureEquilibree(lignesPreview);

  const handleSave = () => {
    setError("");
    if (!montant || montant <= 0)    { setError("Montant obligatoire");                          return; }
    if (!date)                        { setError("Date obligatoire");                              return; }
    if (lignesPreview.length === 0)  { setError("Type d'opération invalide — aucune ligne générée"); return; }
    if (!equilibre)                  { setError("Écriture déséquilibrée — vérifiez les montants"); return; }

    const seq = sequenceEcritures + 1;
    onSave({
      date,
      journal,
      numeroPiece: genererNumeroPiece(journal, annee, seq),
      libelle:     libelle.trim() || TYPE_OPERATION_LABELS[typeOp],
      lignes:      lignesPreview,
      statut:      "brouillon",
      annee,
      mois,
    });
  };

  return (
    <div className="space-y-4">
      {/* Type d'opération */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Type d'opération *
        </Label>
        <Select value={typeOp} onValueChange={(v) => setTypeOp(v as TypeOperationGuide)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <div className="px-2 py-1 text-xs font-bold text-muted-foreground uppercase">Ventes</div>
            {(["vente_marchandises", "vente_services"] as TypeOperationGuide[]).map((k) => (
              <SelectItem key={k} value={k}>{TYPE_OPERATION_LABELS[k]}</SelectItem>
            ))}
            <div className="px-2 py-1 text-xs font-bold text-muted-foreground uppercase mt-1">Achats</div>
            {(["achat_marchandises", "achat_fournitures", "achat_service"] as TypeOperationGuide[]).map((k) => (
              <SelectItem key={k} value={k}>{TYPE_OPERATION_LABELS[k]}</SelectItem>
            ))}
            <div className="px-2 py-1 text-xs font-bold text-muted-foreground uppercase mt-1">Trésorerie</div>
            {(["encaissement_client", "paiement_fournisseur"] as TypeOperationGuide[]).map((k) => (
              <SelectItem key={k} value={k}>{TYPE_OPERATION_LABELS[k]}</SelectItem>
            ))}
            <div className="px-2 py-1 text-xs font-bold text-muted-foreground uppercase mt-1">Charges</div>
            {(["charge_loyer", "charge_telephone", "charge_electricite", "charge_salaires"] as TypeOperationGuide[]).map((k) => (
              <SelectItem key={k} value={k}>{TYPE_OPERATION_LABELS[k]}</SelectItem>
            ))}
            <div className="px-2 py-1 text-xs font-bold text-muted-foreground uppercase mt-1">Autres</div>
            {(["tva_a_decaisser", "dotation_amortissement", "autre"] as TypeOperationGuide[]).map((k) => (
              <SelectItem key={k} value={k}>{TYPE_OPERATION_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Date *</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Montant HT (FCFA) *
          </Label>
          <Input
            type="number"
            min="0"
            value={montantHT}
            onChange={(e) => setMontantHT(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Client / Fournisseur
          </Label>
          <Input
            value={tiers}
            onChange={(e) => setTiers(e.target.value)}
            placeholder="Nom (facultatif)"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Libellé (optionnel)
          </Label>
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
                (TVA = {Math.round(montant * tauxTVA).toLocaleString("fr-FR")} FCFA •{" "}
                TTC = {Math.round(montant * (1 + tauxTVA)).toLocaleString("fr-FR")} FCFA)
              </span>
            )}
          </Label>
        </div>
      )}

      {/* Aperçu des écritures SYSCOHADA générées */}
      {lignesPreview.length > 0 && (
        <div className="bg-muted/40 rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase text-muted-foreground">
              Écritures SYSCOHADA générées — Journal {journal}
            </p>
            <Badge variant={equilibre ? "default" : "destructive"} className="text-xs">
              {equilibre ? "✓ Équilibrée" : "⚠ Déséquilibrée"}
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-3 font-semibold">Compte</th>
                  <th className="text-left py-1 pr-3 font-semibold">Intitulé</th>
                  <th className="text-right py-1 pr-3 font-semibold">Débit</th>
                  <th className="text-right py-1 font-semibold">Crédit</th>
                </tr>
              </thead>
              <tbody>
                {lignesPreview.map((l) => (
                  <tr key={l.id} className="border-b border-border/50">
                    <td className="py-1 pr-3 font-mono font-bold text-primary">{l.compte}</td>
                    <td className="py-1 pr-3 text-muted-foreground">
                      {l.intitule}{l.tiers ? ` — ${l.tiers}` : ""}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {l.debit > 0 ? l.debit.toLocaleString("fr-FR") : ""}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {l.credit > 0 ? l.credit.toLocaleString("fr-FR") : ""}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold bg-muted/60">
                  <td colSpan={2} className="py-1 pr-3 text-xs">TOTAUX</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{totalDebit.toLocaleString("fr-FR")}</td>
                  <td className="py-1 text-right tabular-nums">{totalCredit.toLocaleString("fr-FR")}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground italic">
            Ces écritures seront enregistrées en partie double dans le journal {journal}.
            Elles peuvent être modifiées en mode Expert.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          onClick={handleSave}
          disabled={lignesPreview.length > 0 && !equilibre}
        >
          <Check className="size-4 mr-1.5" /> Enregistrer
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </div>
  );
};
