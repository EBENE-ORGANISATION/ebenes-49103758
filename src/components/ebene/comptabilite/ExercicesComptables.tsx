// Exercice comptable : bilan d'ouverture (à-nouveaux), clôture avec
// affectation du résultat, réouverture (administrateur).
import { useState } from "react";
import { CalendarCheck, Loader2, Lock, LockOpen, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DonneesMensuelles } from "@/types/ebene";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { exercicesRepo } from "@/data/exercices.repo";
import { QK_ECRITURES } from "@/hooks/data/useEcritures";
import { formatSolde, messageErreur } from "@/lib/ebene-utils";
import {
  ecritureANouveaux, ecritureOuverture, MODELE_OUVERTURE, resultatAAffecter, verifierOuverture,
  type Affectation, type LigneOuverture,
} from "@/lib/liasse/cloture";
import { estANouveaux } from "@/lib/liasse/etatsLiasse";

interface Props {
  /** Données de toute la société. */
  donneesMensuelles: DonneesMensuelles;
  annee: number;
}

export const ExercicesComptables = ({ donneesMensuelles, annee }: Props) => {
  const { currentSociete } = useTenant();
  const { isAdmin, isSuperAdmin } = useAuth();
  const sid = currentSociete?.id ?? null;
  const qc = useQueryClient();
  const { data: exercices = [] } = useQuery({
    queryKey: ["exercices", sid],
    queryFn: () => exercicesRepo.list(sid!),
    enabled: !!sid,
  });
  const [ouverture, setOuverture] = useState<LigneOuverture[] | null>(null);
  const [cloture, setCloture] = useState<Affectation | null>(null);
  const [enCours, setEnCours] = useState(false);

  if (!sid) return null;
  const exercice = exercices.find((e) => e.annee === annee);
  const cloture_ = exercice?.statut === "cloture";
  const aOuverture = Object.entries(donneesMensuelles).some(([k, m]) =>
    Number(k.split("-")[0]) === annee && (m?.ecritures ?? []).some((e) => estANouveaux(e, annee)));
  const aAnterieur = Object.keys(donneesMensuelles).some((k) => Number(k.split("-")[0]) < annee);
  const { resultat, reportImplicite, total } = resultatAAffecter(donneesMensuelles, annee);

  const rafraichir = () => {
    void qc.invalidateQueries({ queryKey: ["exercices", sid] });
    void qc.invalidateQueries({ queryKey: QK_ECRITURES(sid) });
  };

  const enregistrerOuverture = async () => {
    if (!ouverture) return;
    const erreur = verifierOuverture(ouverture);
    if (erreur) return toast.error(erreur);
    setEnCours(true);
    try {
      await exercicesRepo.remplacerANouveaux(sid, ecritureOuverture(ouverture, annee));
      toast.success(`Bilan d'ouverture ${annee} enregistré.`);
      setOuverture(null);
      rafraichir();
    } catch (e) {
      toast.error(messageErreur(e, "Erreur lors de l'enregistrement du bilan d'ouverture"));
    } finally {
      setEnCours(false);
    }
  };

  const cloturer = async () => {
    if (!cloture) return;
    setEnCours(true);
    try {
      // À-nouveaux de N+1 d'abord, puis verrouillage de N
      await exercicesRepo.remplacerANouveaux(sid, ecritureANouveaux(donneesMensuelles, annee, cloture));
      await exercicesRepo.definirStatut(sid, annee, "cloture", cloture);
      toast.success(`Exercice ${annee} clôturé ; à-nouveaux ${annee + 1} générés.`);
      setCloture(null);
      rafraichir();
    } catch (e) {
      toast.error(messageErreur(e, "Erreur lors de la clôture"));
    } finally {
      setEnCours(false);
    }
  };

  const rouvrir = async () => {
    if (!confirm(`Rouvrir l'exercice ${annee} ? Les saisies redeviennent possibles ; pensez à le clôturer de nouveau pour recalculer les à-nouveaux ${annee + 1}.`)) return;
    try {
      await exercicesRepo.definirStatut(sid, annee, "ouvert", exercice?.affectation);
      toast.success(`Exercice ${annee} rouvert.`);
      rafraichir();
    } catch (e) {
      toast.error(messageErreur(e, "Erreur lors de la réouverture"));
    }
  };

  const affecte = (cloture?.reserveLegale ?? 0) + (cloture?.reservesLibres ?? 0) + (cloture?.dividendes ?? 0);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <CalendarCheck className="size-4 text-primary" />
        <h3 className="font-bold text-sm">Exercice {annee}</h3>
        <Badge variant={cloture_ ? "default" : "secondary"}>{cloture_ ? "Clôturé" : "Ouvert"}</Badge>
        <span className="text-xs text-muted-foreground">
          Résultat {resultat >= 0 ? "bénéficiaire" : "déficitaire"} : {formatSolde(resultat)}
          {reportImplicite ? ` • résultats antérieurs non affectés : ${formatSolde(reportImplicite)}` : ""}
          {aOuverture ? " • bilan d'ouverture enregistré" : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {!cloture_ && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOuverture(
            MODELE_OUVERTURE.map((m) => ({ compte: m.compte, debit: 0, credit: 0 })),
          )}>
            {aOuverture ? "Modifier le bilan d'ouverture" : "Saisir le bilan d'ouverture"}
          </Button>
        )}
        {!cloture_ && (
          <Button size="sm" className="gap-1.5" onClick={() => setCloture({})}>
            <Lock className="size-3.5" /> Clôturer l'exercice {annee}
          </Button>
        )}
        {cloture_ && (isAdmin || isSuperAdmin) && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={rouvrir}>
            <LockOpen className="size-3.5" /> Rouvrir
          </Button>
        )}
      </div>
      {!aOuverture && !aAnterieur && (
        <p className="text-xs text-warning">
          Première année dans l'application : saisissez le bilan d'ouverture (capital, réserves, soldes de départ),
          sinon les capitaux propres et la colonne N-1 des états financiers seront incomplets.
        </p>
      )}

      {/* Bilan d'ouverture */}
      <Dialog open={!!ouverture} onOpenChange={(v) => !v && setOuverture(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Bilan d'ouverture au 01/01/{annee}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Soldes de départ des comptes de bilan (classes 1 à 5). Les débits doivent égaler les crédits.
          </p>
          <div className="space-y-1.5">
            {(ouverture ?? []).map((l, i) => {
              const modele = MODELE_OUVERTURE.find((m) => m.compte === l.compte);
              const maj = (patch: Partial<LigneOuverture>) => setOuverture((o) => o!.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="flex gap-2 items-center">
                  <Input className="h-8 w-20 shrink-0 text-xs" value={l.compte} onChange={(e) => maj({ compte: e.target.value.trim() })} aria-label="Compte" />
                  <span className="flex-1 min-w-0 text-xs truncate text-muted-foreground hidden sm:block">{modele?.libelle ?? ""}</span>
                  <Input className="h-8 w-28 min-w-0 flex-1 sm:flex-none text-xs text-right" type="number" placeholder="Débit" value={l.debit || ""} onChange={(e) => maj({ debit: Number(e.target.value) || 0 })} aria-label="Débit" />
                  <Input className="h-8 w-28 min-w-0 flex-1 sm:flex-none text-xs text-right" type="number" placeholder="Crédit" value={l.credit || ""} onChange={(e) => maj({ credit: Number(e.target.value) || 0 })} aria-label="Crédit" />
                  <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={() => setOuverture((o) => o!.filter((_, j) => j !== i))}><X className="size-4" /></Button>
                </div>
              );
            })}
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setOuverture((o) => [...(o ?? []), { compte: "", debit: 0, credit: 0 }])}>
              <Plus className="size-3.5" /> Ajouter un compte
            </Button>
            {ouverture && (
              <p className="text-xs text-right">
                Débits {formatSolde(ouverture.reduce((t, l) => t + l.debit, 0))} • Crédits {formatSolde(ouverture.reduce((t, l) => t + l.credit, 0))}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOuverture(null)}>Annuler</Button>
            <Button onClick={enregistrerOuverture} disabled={enCours}>{enCours && <Loader2 className="size-4 animate-spin" />} Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clôture et affectation */}
      <Dialog open={!!cloture} onOpenChange={(v) => !v && setCloture(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Clôturer l'exercice {annee}</DialogTitle></DialogHeader>
          <p className="text-sm">Résultat à affecter : <strong>{formatSolde(total)}</strong></p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([["reserveLegale", "Réserve légale (111)"], ["reservesLibres", "Réserves libres (118)"], ["dividendes", "Dividendes (465)"]] as const).map(([cle, label]) => (
              <div key={cle} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input type="number" className="h-9" value={cloture?.[cle] ?? ""} onChange={(e) => setCloture((c) => ({ ...c, [cle]: Number(e.target.value) || 0 }))} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Report à nouveau : {formatSolde(total - affecte)}. La clôture génère les à-nouveaux au 01/01/{annee + 1}{" "}
            et verrouille l'exercice {annee} (plus aucune saisie possible sans réouverture par un administrateur).
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloture(null)}>Annuler</Button>
            <Button onClick={cloturer} disabled={enCours}>{enCours && <Loader2 className="size-4 animate-spin" />} Clôturer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
