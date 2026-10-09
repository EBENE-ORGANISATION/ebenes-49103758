// Informations fiscales d'un exercice : passage du résultat comptable au
// résultat fiscal (P58 à P60), engagements hors bilan (note 1), actifs et
// passifs éventuels (note 16C).
import { useMemo, useState } from "react";
import { Loader2, Plus, Scale, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DonneesMensuelles } from "@/types/ebene";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { useInformationsFiscales } from "@/hooks/data/useInformationsFiscales";
import { formatSolde, messageErreur } from "@/lib/ebene-utils";
import { compteResultatLiasse, soldesCloture } from "@/lib/liasse/etatsLiasse";
import {
  calculResultatFiscal, DEDUCTIONS, ENGAGEMENTS, REINTEGRATIONS,
  type CodeDeduction, type CodeReintegration, type InformationsFiscales, type LigneEngagement, type LigneLibre,
} from "@/lib/liasse/resultatFiscal";

interface Props {
  /** Données de toute la société. */
  donneesMensuelles: DonneesMensuelles;
  annee: number;
}

const nombre = (v: string) => (v === "" ? undefined : Number(v) || 0);

const ChampMontant = ({ label, valeur, placeholder, onChange }: {
  label: string; valeur?: number; placeholder?: string; onChange: (v: number | undefined) => void;
}) => (
  <div className="flex items-center gap-2">
    <Label className="flex-1 text-xs font-normal">{label}</Label>
    <Input className="h-8 w-36 text-xs text-right" type="number" placeholder={placeholder} value={valeur ?? ""} onChange={(e) => onChange(nombre(e.target.value))} />
  </div>
);

const LignesLibres = ({ lignes = [], onChange, avecN1 = false }: { lignes?: LigneLibre[]; onChange: (l: LigneLibre[]) => void; avecN1?: boolean }) => (
  <div className="space-y-1.5">
    {lignes.map((l, i) => {
      const maj = (p: Partial<LigneLibre>) => onChange(lignes.map((x, j) => (j === i ? { ...x, ...p } : x)));
      return (
        <div key={i} className="flex gap-2 items-center">
          <Input className="h-8 flex-1 text-xs" placeholder="Libellé" value={l.libelle} onChange={(e) => maj({ libelle: e.target.value })} />
          <Input className="h-8 w-32 text-xs text-right" type="number" placeholder="Montant" value={l.montant || ""} onChange={(e) => maj({ montant: Number(e.target.value) || 0 })} />
          {avecN1 && <Input className="h-8 w-28 text-xs text-right" type="number" placeholder="N-1" value={l.montantN1 || ""} onChange={(e) => maj({ montantN1: Number(e.target.value) || 0 })} />}
          <Button size="icon" variant="ghost" className="size-8" onClick={() => onChange(lignes.filter((_, j) => j !== i))}><X className="size-4" /></Button>
        </div>
      );
    })}
    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => onChange([...lignes, { libelle: "", montant: 0 }])}>
      <Plus className="size-3" /> Ajouter
    </Button>
  </div>
);

export const InformationsFiscalesExercice = ({ donneesMensuelles, annee }: Props) => {
  const { currentSociete } = useTenant();
  const { isAdmin, isSuperAdmin, inServiceCompta } = useAuth();
  const sid = currentSociete?.id ?? null;
  const { informations, enregistrer, enregistrement } = useInformationsFiscales(sid, annee);
  const [edition, setEdition] = useState<InformationsFiscales | null>(null);
  const peutSaisir = isAdmin || isSuperAdmin || inServiceCompta;

  const { resultatNet, impot } = useMemo(() => {
    const cr = compteResultatLiasse(soldesCloture(donneesMensuelles, annee).gestion);
    return { resultatNet: cr.XI, impot: -cr.RS };
  }, [donneesMensuelles, annee]);

  if (!sid) return null;
  const actuel = calculResultatFiscal(resultatNet, informations, impot);
  const apercu = edition ? calculResultatFiscal(resultatNet, edition, impot) : actuel;

  const sauver = async () => {
    if (!edition) return;
    try {
      await enregistrer(edition);
      toast.success(`Informations fiscales ${annee} enregistrées.`);
      setEdition(null);
    } catch (e) {
      toast.error(messageErreur(e, "Erreur lors de l'enregistrement"));
    }
  };

  const maj = (p: Partial<InformationsFiscales>) => setEdition((x) => (x ? { ...x, ...p } : x));

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Scale className="size-4 text-primary" />
        <h3 className="font-bold text-sm">Résultat fiscal et hors bilan {annee}</h3>
        <span className="text-xs text-muted-foreground">
          Résultat comptable {formatSolde(resultatNet)} → résultat fiscal {formatSolde(actuel.definitif)}
        </span>
        {peutSaisir && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setEdition(structuredClone(informations))}>
            Renseigner
          </Button>
        )}
      </div>

      <Dialog open={!!edition} onOpenChange={(v) => !v && setEdition(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Résultat fiscal et hors bilan — exercice {annee}</DialogTitle></DialogHeader>
          {edition && (
            <Tabs defaultValue="reintegrations">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="reintegrations">Réintégrations</TabsTrigger>
                <TabsTrigger value="deductions">Déductions</TabsTrigger>
                <TabsTrigger value="horsbilan">Engagements</TabsTrigger>
                <TabsTrigger value="eventuels">Éventualités</TabsTrigger>
              </TabsList>

              <TabsContent value="reintegrations" className="space-y-1.5">
                {(Object.keys(REINTEGRATIONS) as CodeReintegration[]).map((code) => (
                  <ChampMontant
                    key={code}
                    label={`${code} — ${REINTEGRATIONS[code]}`}
                    valeur={edition.reintegrations?.[code]}
                    placeholder={code === "15" ? `${Math.round(impot)} (comptabilisé)` : undefined}
                    onChange={(v) => maj({ reintegrations: { ...edition.reintegrations, [code]: v } })}
                  />
                ))}
                <p className="text-xs font-medium pt-2">Autres réintégrations (détail P59)</p>
                <LignesLibres lignes={edition.autresReintegrations} onChange={(l) => maj({ autresReintegrations: l })} />
              </TabsContent>

              <TabsContent value="deductions" className="space-y-1.5">
                {(Object.keys(DEDUCTIONS) as CodeDeduction[]).map((code) => (
                  <ChampMontant key={code} label={`${code} — ${DEDUCTIONS[code]}`} valeur={edition.deductions?.[code]}
                    onChange={(v) => maj({ deductions: { ...edition.deductions, [code]: v } })} />
                ))}
                <p className="text-xs font-medium pt-2">Autres déductions (détail P60)</p>
                <LignesLibres lignes={edition.autresDeductions} onChange={(l) => maj({ autresDeductions: l })} />
                <p className="text-xs font-medium pt-2">Imputations</p>
                <ChampMontant label="150 — Déficits antérieurs imputés" valeur={edition.deficitsAnterieurs} onChange={(v) => maj({ deficitsAnterieurs: v })} />
                <ChampMontant label="155 — Amortissements réputés différés antérieurs" valeur={edition.amortDifferesAnterieurs} onChange={(v) => maj({ amortDifferesAnterieurs: v })} />
                <ChampMontant label="165 — Quote-part du bénéfice exonéré" valeur={edition.quotePartExoneree} onChange={(v) => maj({ quotePartExoneree: v })} />
              </TabsContent>

              <TabsContent value="horsbilan" className="space-y-1.5">
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span className="flex-1" /><span className="w-32 text-right">Donnés</span><span className="w-32 text-right">Reçus</span>
                </div>
                {(Object.keys(ENGAGEMENTS) as LigneEngagement[]).map((l) => {
                  const e = edition.engagements?.[l] ?? {};
                  const majE = (p: { donnes?: number; recus?: number }) => maj({ engagements: { ...edition.engagements, [l]: { ...e, ...p } } });
                  return (
                    <div key={l} className="flex gap-2 items-center">
                      <Label className="flex-1 text-xs font-normal">{ENGAGEMENTS[l]}</Label>
                      <Input className="h-8 w-32 text-xs text-right" type="number" value={e.donnes ?? ""}
                        placeholder={l === "39" ? "Auto : emprunts" : undefined}
                        onChange={(ev) => majE({ donnes: nombre(ev.target.value) })} />
                      <Input className="h-8 w-32 text-xs text-right" type="number" value={e.recus ?? ""} onChange={(ev) => majE({ recus: nombre(ev.target.value) })} />
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  Laissé vide, la ligne « Hypothèques, nantissements, gages » reprend les sûretés déclarées sur les emprunts.
                </p>
              </TabsContent>

              <TabsContent value="eventuels" className="space-y-2">
                <p className="text-xs font-medium">Actifs éventuels (montants N et N-1)</p>
                <LignesLibres avecN1 lignes={edition.actifsEventuels} onChange={(l) => maj({ actifsEventuels: l })} />
                <p className="text-xs font-medium pt-2">Passifs éventuels (litiges, garanties…)</p>
                <LignesLibres avecN1 lignes={edition.passifsEventuels} onChange={(l) => maj({ passifsEventuels: l })} />
              </TabsContent>
            </Tabs>
          )}
          <p className="text-xs border-t pt-2">
            Réintégrations {formatSolde(apercu.totalReintegrations)} • Déductions {formatSolde(apercu.totalDeductions)} •
            Résultat fiscal <strong>{formatSolde(apercu.definitif)}</strong>
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdition(null)}>Annuler</Button>
            <Button onClick={sauver} disabled={enregistrement}>{enregistrement && <Loader2 className="size-4 animate-spin" />} Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
