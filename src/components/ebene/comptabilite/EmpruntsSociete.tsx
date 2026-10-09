// Emprunts : création (écriture de déblocage), échéancier, comptabilisation
// des échéances (capital + intérêts) ; alimente les notes 1 et 16A.
import { useState } from "react";
import { Landmark, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DonneesMensuelles } from "@/types/ebene";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { useActivites } from "@/hooks/data/useActivites";
import { useEmprunts, QK_EMPRUNTS } from "@/hooks/data/useEmprunts";
import { QK_ECRITURES } from "@/hooks/data/useEcritures";
import { empruntsRepo } from "@/data/emprunts.repo";
import { ecritures as ecrituresRepo } from "@/data/ecritures.repo";
import { formatSolde, messageErreur, todayISO } from "@/lib/ebene-utils";
import {
  capitalRestantDu, echeancier, ecritureDeblocage, ecritureEcheance, LIBELLE_GARANTIE, piecesComptabilisees,
  type Emprunt, type Garantie, type Periodicite,
} from "@/lib/liasse/emprunts";

interface Props {
  /** Données de toute la société (pièces déjà comptabilisées). */
  donneesMensuelles: DonneesMensuelles;
}

type Brouillon = Omit<Emprunt, "id">;

const NOUVEAU: Brouillon = {
  preteur: "", objet: "", montant: 0, tauxAnnuel: 0, dureeMois: 12, periodicite: "mensuelle",
  dateDeblocage: todayISO(), compte: "162", tresorerie: "521", garantie: null, montantGaranti: null, activiteId: null,
};

const AUCUNE = "aucune";

export const EmpruntsSociete = ({ donneesMensuelles }: Props) => {
  const { currentSociete } = useTenant();
  const { isAdmin, isSuperAdmin, inServiceCompta } = useAuth();
  const sid = currentSociete?.id ?? null;
  const qc = useQueryClient();
  const { emprunts } = useEmprunts(sid);
  const { activitesActives } = useActivites(sid);
  const [nouveau, setNouveau] = useState<Brouillon | null>(null);
  const [detail, setDetail] = useState<Emprunt | null>(null);
  const [enCours, setEnCours] = useState(false);
  const peutSaisir = isAdmin || isSuperAdmin || inServiceCompta;

  if (!sid) return null;
  const aujourdhui = todayISO();

  const rafraichir = () => {
    void qc.invalidateQueries({ queryKey: QK_EMPRUNTS(sid) });
    void qc.invalidateQueries({ queryKey: QK_ECRITURES(sid) });
  };

  const creer = async () => {
    if (!nouveau) return;
    if (!nouveau.preteur.trim()) return toast.error("Indiquez le prêteur.");
    if (!(nouveau.montant > 0) || !(nouveau.dureeMois > 0)) return toast.error("Montant et durée doivent être positifs.");
    setEnCours(true);
    try {
      const e = await empruntsRepo.create(sid, { ...nouveau, preteur: nouveau.preteur.trim() });
      const d = ecritureDeblocage(e);
      await ecrituresRepo.create(d, d.annee!, d.mois!, sid);
      toast.success("Emprunt enregistré ; l'écriture de déblocage est à valider dans le journal.");
      setNouveau(null);
      rafraichir();
    } catch (err) {
      toast.error(messageErreur(err, "Erreur lors de l'enregistrement de l'emprunt"));
    } finally {
      setEnCours(false);
    }
  };

  const comptabiliser = async (e: Emprunt, numero: number) => {
    const x = echeancier(e).find((y) => y.numero === numero);
    if (!x) return;
    setEnCours(true);
    try {
      const r = ecritureEcheance(e, x);
      await ecrituresRepo.create(r, r.annee!, r.mois!, sid);
      toast.success(`Échéance ${numero} comptabilisée (à valider dans le journal).`);
      rafraichir();
    } catch (err) {
      toast.error(messageErreur(err, "Erreur lors de la comptabilisation de l'échéance"));
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = async (e: Emprunt) => {
    if (!confirm(`Retirer l'emprunt ${e.preteur} ? Les écritures déjà passées restent dans le journal.`)) return;
    try {
      await empruntsRepo.remove(e.id);
      rafraichir();
    } catch (err) {
      toast.error(messageErreur(err, "Erreur lors de la suppression"));
    }
  };

  const maj = (patch: Partial<Brouillon>) => setNouveau((n) => (n ? { ...n, ...patch } : n));
  const echeancesDetail = detail ? echeancier(detail) : [];
  const payeesDetail = detail ? piecesComptabilisees(donneesMensuelles, detail.id) : [];

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Landmark className="size-4 text-primary" />
        <h3 className="font-bold text-sm">Emprunts</h3>
        <span className="text-xs text-muted-foreground">
          Échéanciers et garanties repris dans les notes 1 et 16A des états financiers.
        </span>
        {peutSaisir && (
          <Button size="sm" variant="outline" className="gap-1.5 ml-auto" onClick={() => setNouveau({ ...NOUVEAU, dateDeblocage: todayISO() })}>
            <Plus className="size-3.5" /> Nouvel emprunt
          </Button>
        )}
      </div>

      {emprunts.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Aucun emprunt enregistré.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-1.5 pr-2">Prêteur</th>
                <th className="py-1.5 pr-2 text-right">Montant</th>
                <th className="py-1.5 pr-2">Conditions</th>
                <th className="py-1.5 pr-2 text-right">Restant dû</th>
                <th className="py-1.5 pr-2">Prochaine échéance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {emprunts.map((e) => {
                const passees = piecesComptabilisees(donneesMensuelles, e.id);
                const suivante = echeancier(e).find((x) => !passees.includes(x.numero));
                const echue = suivante && suivante.date <= aujourdhui;
                return (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">
                      <button className="font-medium hover:underline text-left" onClick={() => setDetail(e)}>{e.preteur}</button>
                      {e.garantie && <span className="block text-muted-foreground">{LIBELLE_GARANTIE[e.garantie]}</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-right">{formatSolde(e.montant)}</td>
                    <td className="py-1.5 pr-2">{e.tauxAnnuel} % • {e.dureeMois} mois • {e.periodicite}</td>
                    <td className="py-1.5 pr-2 text-right">{formatSolde(capitalRestantDu(e, aujourdhui))}</td>
                    <td className="py-1.5 pr-2">
                      {suivante ? (
                        <span className={echue ? "text-warning font-medium" : ""}>
                          n° {suivante.numero} le {suivante.date.split("-").reverse().join("/")} : {formatSolde(suivante.annuite)}
                        </span>
                      ) : "Remboursé"}
                      {!passees.includes(0) && <span className="block text-destructive">Déblocage non comptabilisé</span>}
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      {peutSaisir && suivante && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={enCours} onClick={() => comptabiliser(e, suivante.numero)}>
                          Comptabiliser n° {suivante.numero}
                        </Button>
                      )}
                      {peutSaisir && (
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => supprimer(e)} aria-label="Retirer l'emprunt">
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Création */}
      <Dialog open={!!nouveau} onOpenChange={(v) => !v && setNouveau(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Nouvel emprunt</DialogTitle></DialogHeader>
          {nouveau && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Prêteur (banque, organisme)</Label>
                <Input className="h-9" value={nouveau.preteur} onChange={(e) => maj({ preteur: e.target.value })} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Objet</Label>
                <Input className="h-9" value={nouveau.objet ?? ""} onChange={(e) => maj({ objet: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Montant emprunté</Label>
                <Input className="h-9" type="number" value={nouveau.montant || ""} onChange={(e) => maj({ montant: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Taux annuel (%)</Label>
                <Input className="h-9" type="number" step="0.01" value={nouveau.tauxAnnuel || ""} onChange={(e) => maj({ tauxAnnuel: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Durée (mois)</Label>
                <Input className="h-9" type="number" value={nouveau.dureeMois || ""} onChange={(e) => maj({ dureeMois: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Périodicité</Label>
                <Select value={nouveau.periodicite} onValueChange={(v) => maj({ periodicite: v as Periodicite })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensuelle">Mensuelle</SelectItem>
                    <SelectItem value="trimestrielle">Trimestrielle</SelectItem>
                    <SelectItem value="semestrielle">Semestrielle</SelectItem>
                    <SelectItem value="annuelle">Annuelle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date de déblocage</Label>
                <Input className="h-9" type="date" value={nouveau.dateDeblocage} onChange={(e) => maj({ dateDeblocage: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fonds versés sur</Label>
                <Select value={nouveau.tresorerie} onValueChange={(v) => maj({ tresorerie: v as "521" | "571" })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="521">Banque (521)</SelectItem>
                    <SelectItem value="571">Caisse (571)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Garantie donnée</Label>
                <Select value={nouveau.garantie ?? AUCUNE} onValueChange={(v) => maj({ garantie: v === AUCUNE ? null : (v as Garantie) })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUCUNE}>Aucune</SelectItem>
                    {(Object.keys(LIBELLE_GARANTIE) as Garantie[]).map((g) => <SelectItem key={g} value={g}>{LIBELLE_GARANTIE[g]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {nouveau.garantie && (
                <div className="space-y-1">
                  <Label className="text-xs">Montant garanti</Label>
                  <Input className="h-9" type="number" placeholder="Tout l'emprunt" value={nouveau.montantGaranti ?? ""} onChange={(e) => maj({ montantGaranti: e.target.value ? Number(e.target.value) : null })} />
                </div>
              )}
              {activitesActives.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Activité</Label>
                  <Select value={nouveau.activiteId ?? AUCUNE} onValueChange={(v) => maj({ activiteId: v === AUCUNE ? null : v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUCUNE}>Commune à la société</SelectItem>
                      {activitesActives.map((a) => <SelectItem key={a.id} value={a.id}>{a.nom}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {nouveau.montant > 0 && nouveau.dureeMois > 0 && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Échéance : {formatSolde(echeancier({ ...nouveau, id: 0 })[0]?.annuite ?? 0)} ({echeancier({ ...nouveau, id: 0 }).length} échéances).
                  Le déblocage est passé en écriture (trésorerie / 162), à valider dans le journal.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNouveau(null)}>Annuler</Button>
            <Button onClick={creer} disabled={enCours}>{enCours && <Loader2 className="size-4 animate-spin" />} Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Échéancier */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Échéancier — {detail?.preteur}</DialogTitle></DialogHeader>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-1">N°</th><th className="py-1">Date</th>
                <th className="py-1 text-right">Capital</th><th className="py-1 text-right">Intérêts</th>
                <th className="py-1 text-right">Échéance</th><th className="py-1 text-right">Restant dû</th><th className="py-1 pl-2">État</th>
              </tr>
            </thead>
            <tbody>
              {echeancesDetail.map((x) => (
                <tr key={x.numero} className="border-b last:border-0">
                  <td className="py-1">{x.numero}</td>
                  <td className="py-1">{x.date.split("-").reverse().join("/")}</td>
                  <td className="py-1 text-right">{formatSolde(x.capital)}</td>
                  <td className="py-1 text-right">{formatSolde(x.interets)}</td>
                  <td className="py-1 text-right">{formatSolde(x.annuite)}</td>
                  <td className="py-1 text-right">{formatSolde(x.restant)}</td>
                  <td className="py-1 pl-2">{payeesDetail.includes(x.numero) ? "Comptabilisée" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
