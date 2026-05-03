import { useEffect, useState } from "react";
import { useBulletinsPaie } from "@/hooks/useBulletinsPaie";
import { useEbeneStoreRemote as useEbeneStore } from "@/hooks/useEbeneStoreRemote";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FileText, RefreshCw, CheckCircle, CreditCard, Trash2, Download, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { generateBulletin, type BulletinSocieteInfo } from "@/lib/bulletinPDF";
import { calculerPaie } from "@/components/ebene/grh/BulletinPaie";
import { formatMontant } from "@/lib/ebene-utils";
import { MOIS_NOMS, type Employe, type BulletinPaieRecord } from "@/types/ebene";

interface Props {
  employes: Employe[];
  annee: number;
  mois: number;
  isChefGrh: boolean;
  societeInfo: BulletinSocieteInfo | null;
}

const statutBadge = (s: BulletinPaieRecord["statut"]) => {
  switch (s) {
    case "valide":
      return <Badge className="bg-success/20 text-success border-success/30">Validé</Badge>;
    case "paye":
      return <Badge className="bg-primary/15 text-primary border-primary/30">Payé</Badge>;
    default:
      return <Badge variant="outline" className="text-muted-foreground">Brouillon</Badge>;
  }
};

export const BulletinsPaie = ({ employes, annee, mois, isChefGrh, societeInfo }: Props) => {
  const { currentSociete } = useTenant();
  const sid = currentSociete?.id ?? null;
  const store = useEbeneStore(sid);
  const {
    bulletins,
    loading,
    loadBulletins,
    genererBulletin,
    genererTousBulletins,
    validerBulletin,
    payerBulletin,
    supprimerBulletin,
  } = useBulletinsPaie(sid);

  const [generating, setGenerating] = useState<number | "all" | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  useEffect(() => {
    void loadBulletins(annee, mois);
  }, [annee, mois, loadBulletins]);

  const periode = `${MOIS_NOMS[mois - 1]} ${annee}`;

  // ─── Générer un seul bulletin ────────────────────────────────────────────
  const handleGenerer = async (emp: Employe) => {
    setGenerating(emp.id);
    const moisData = store.getMois(annee, mois);
    const ok = await genererBulletin(emp, moisData, annee, mois);
    if (ok) {
      toast.success(`Bulletin de ${emp.nom} généré`);
      await loadBulletins(annee, mois);
    } else {
      toast.error("Erreur lors de la génération");
    }
    setGenerating(null);
  };

  // ─── Générer tous les bulletins ──────────────────────────────────────────
  const handleGenererTous = async () => {
    setGenerating("all");
    const { ok, err } = await genererTousBulletins(
      employes,
      (a, m) => store.getMois(a, m),
      annee,
      mois
    );
    if (ok > 0) toast.success(`${ok} bulletin(s) généré(s)`);
    if (err > 0) toast.error(`${err} erreur(s)`);
    await loadBulletins(annee, mois);
    setGenerating(null);
  };

  // ─── Valider ─────────────────────────────────────────────────────────────
  const handleValider = async (id: string, nom: string) => {
    setActioning(id);
    const ok = await validerBulletin(id);
    if (ok) toast.success(`Bulletin de ${nom} validé`);
    else toast.error("Erreur lors de la validation");
    setActioning(null);
  };

  // ─── Payer ───────────────────────────────────────────────────────────────
  const handlePayer = async (id: string, nom: string) => {
    setActioning(id);
    const ok = await payerBulletin(id, store.addTransaction);
    if (ok) {
      toast.success(`Bulletin de ${nom} payé — écriture comptable créée`);
    } else {
      toast.error("Erreur lors du paiement");
    }
    setActioning(null);
  };

  // ─── Supprimer ───────────────────────────────────────────────────────────
  const handleSupprimer = async (id: string) => {
    await supprimerBulletin(id);
    toast.success("Bulletin supprimé");
  };

  // ─── Télécharger PDF ─────────────────────────────────────────────────────
  const handlePdf = (b: BulletinPaieRecord) => {
    const emp = employes.find((e) => e.id === b.employe_id);
    if (!emp) {
      toast.error("Fiche employé introuvable");
      return;
    }
    const moisData = store.getMois(b.annee, b.mois);
    try {
      generateBulletin(emp, moisData, b.annee, b.mois, societeInfo);
    } catch {
      toast.error("Impossible de générer le PDF");
    }
  };

  // ─── Employés sans bulletin pour ce mois ─────────────────────────────────
  const existingIds = new Set(bulletins.map((b) => b.employe_id));
  const sansBulletin = employes.filter(
    (e) => (!e.statutValidation || e.statutValidation === "valide") && !existingIds.has(e.id)
  );

  // ─── Totaux ──────────────────────────────────────────────────────────────
  const totaux = bulletins.reduce(
    (acc, b) => ({
      brut: acc.brut + b.brut,
      net: acc.net + b.net_a_payer,
      cout: acc.cout + b.cout_employeur,
    }),
    { brut: 0, net: 0, cout: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Barre d'actions */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {isChefGrh && sansBulletin.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={generating === "all"}
              onClick={handleGenererTous}
            >
              {generating === "all" ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Users className="size-4" />
              )}
              Générer tous ({sansBulletin.length} manquant{sansBulletin.length > 1 ? "s" : ""})
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={() => loadBulletins(annee, mois)}
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Période : <strong>{periode}</strong> — {bulletins.length} bulletin{bulletins.length > 1 ? "s" : ""}
        </p>
      </div>

      {/* Récap totaux */}
      {bulletins.length > 0 && (
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Masse brute</p>
            <p className="font-bold text-base">{formatMontant(totaux.brut)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Net total à payer</p>
            <p className="font-bold text-base text-success">{formatMontant(totaux.net)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Coût employeur total</p>
            <p className="font-bold text-base text-warning">{formatMontant(totaux.cout)}</p>
          </Card>
        </div>
      )}

      {/* Table bulletins existants */}
      {bulletins.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="size-4" /> Bulletins {periode}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employé</TableHead>
                  <TableHead className="text-right">Brut</TableHead>
                  <TableHead className="text-right">CNSS+AMU+IRPP</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Coût emp.</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bulletins.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.employe_nom}</TableCell>
                    <TableCell className="text-right text-xs">{formatMontant(b.brut)}</TableCell>
                    <TableCell className="text-right text-xs text-destructive">
                      {formatMontant(b.cnss_sal + b.amu_sal + b.irpp + b.retenues_diverses)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold text-success">
                      {formatMontant(b.net_a_payer)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-warning">
                      {formatMontant(b.cout_employeur)}
                    </TableCell>
                    <TableCell>{statutBadge(b.statut)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {/* Télécharger PDF */}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          title="Télécharger PDF"
                          onClick={() => handlePdf(b)}
                        >
                          <Download className="size-3.5" />
                        </Button>

                        {/* Valider (brouillon → validé) */}
                        {isChefGrh && b.statut === "brouillon" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 text-success border-success/30 hover:bg-success/10"
                            disabled={actioning === b.id}
                            onClick={() => handleValider(b.id, b.employe_nom)}
                          >
                            <CheckCircle className="size-3" /> Valider
                          </Button>
                        )}

                        {/* Payer (validé → payé) */}
                        {isChefGrh && b.statut === "valide" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/10"
                                disabled={actioning === b.id}
                              >
                                <CreditCard className="size-3" /> Payer
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmer le paiement</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Vous êtes sur le point de marquer le bulletin de{" "}
                                  <strong>{b.employe_nom}</strong> comme payé.
                                  <br />
                                  Cela créera une écriture comptable de{" "}
                                  <strong>{formatMontant(b.cout_employeur)}</strong> dans les charges
                                  du mois ({periode}).
                                  <br />
                                  Cette action est irréversible.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handlePayer(b.id, b.employe_nom)}
                                >
                                  Confirmer le paiement
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}

                        {/* Supprimer (brouillon uniquement) */}
                        {isChefGrh && b.statut === "brouillon" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-destructive hover:bg-destructive/10"
                            title="Supprimer"
                            onClick={() => {
                              if (confirm(`Supprimer le bulletin de ${b.employe_nom} ?`))
                                void handleSupprimer(b.id);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Employés sans bulletin */}
      {sansBulletin.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Plus className="size-4" /> Employés sans bulletin — {periode}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employé</TableHead>
                  <TableHead>Poste</TableHead>
                  <TableHead className="text-right">Net estimé</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sansBulletin.map((e) => {
                  const c = calculerPaie(e, store.getMois(annee, mois));
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.nom}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.poste}</TableCell>
                      <TableCell className="text-right text-xs">
                        {formatMontant(c.net)}
                      </TableCell>
                      <TableCell className="text-right">
                        {isChefGrh && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            disabled={generating === e.id}
                            onClick={() => handleGenerer(e)}
                          >
                            {generating === e.id ? (
                              <RefreshCw className="size-3 animate-spin" />
                            ) : (
                              <FileText className="size-3" />
                            )}
                            Générer
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {bulletins.length === 0 && sansBulletin.length === 0 && !loading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aucun employé actif pour {periode}.
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BulletinsPaie;
