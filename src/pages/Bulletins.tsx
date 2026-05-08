import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, FileText, Download, History } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { useEbeneStoreRemote as useEbeneStore } from "@/hooks/useEbeneStoreRemote";
import { useBulletinsPaie } from "@/hooks/useBulletinsPaie";
import { BulletinsPaie } from "@/components/ebene/BulletinsPaie";
import { formatMontant } from "@/lib/ebene-utils";
import { generateBulletin } from "@/lib/bulletinPDF";
import {
  MOIS_NOMS,
  type BulletinPaieRecord,
  type Employe,
} from "@/types/ebene";

const statutLabel = (s: BulletinPaieRecord["statut"]) =>
  s === "paye" ? "Payé" : s === "valide" ? "Validé" : "Brouillon";

const statutClass = (s: BulletinPaieRecord["statut"]) =>
  s === "paye"
    ? "bg-primary/15 text-primary border-primary/30"
    : s === "valide"
      ? "bg-success/20 text-success border-success/30"
      : "";

const Bulletins = () => {
  const navigate = useNavigate();
  const now = new Date();
  const [annee, setAnnee] = useState<number>(now.getFullYear());
  const [mois, setMois] = useState<number>(now.getMonth() + 1);
  const [employeId, setEmployeId] = useState<string>("all");

  const { currentSociete, societeConfig } = useTenant();
  const { isChefGrh } = useAuth();
  const sid = currentSociete?.id ?? null;
  const store = useEbeneStore(sid);
  const { loadBulletinsEmploye } = useBulletinsPaie(sid);
  const [history, setHistory] = useState<BulletinPaieRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const societeInfo = useMemo(
    () => (currentSociete && societeConfig ? { ...societeConfig, nom: currentSociete.nom } : null),
    [currentSociete, societeConfig]
  );

  const employes: Employe[] = store.employes ?? [];
  const selectedEmploye = employes.find((e) => String(e.id) === employeId) ?? null;

  const filteredEmployes = selectedEmploye ? [selectedEmploye] : employes;

  // Charger l'historique d'un employé sélectionné
  useEffect(() => {
    if (!selectedEmploye?.userId) {
      setHistory([]);
      return;
    }
    setLoadingHistory(true);
    void loadBulletinsEmploye(selectedEmploye.userId)
      .then((rows) => setHistory(rows))
      .finally(() => setLoadingHistory(false));
  }, [selectedEmploye, loadBulletinsEmploye]);

  const annees = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, []);

  const handlePdfHistory = (b: BulletinPaieRecord) => {
    const emp = employes.find((e) => e.id === b.employe_id);
    if (!emp) return;
    const moisData = store.getMois(b.annee, b.mois);
    try { generateBulletin(emp, moisData, b.annee, b.mois, societeInfo); } catch { /* noop */ }
  };

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5">
            <ArrowLeft className="size-4" /> Retour
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="size-6" /> Bulletins de paie
          </h1>
        </div>
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Année</label>
            <Select value={String(annee)} onValueChange={(v) => setAnnee(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {annees.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Mois</label>
            <Select value={String(mois)} onValueChange={(v) => setMois(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOIS_NOMS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Employé</label>
            <Select value={employeId} onValueChange={setEmployeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les employés</SelectItem>
                {employes.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!sid && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Sélectionnez une société pour gérer les bulletins.
        </CardContent></Card>
      )}

      {sid && (
        <BulletinsPaie
          employes={filteredEmployes}
          annee={annee}
          mois={mois}
          isChefGrh={isChefGrh}
          societeInfo={societeInfo}
        />
      )}

      {/* Historique employé */}
      {selectedEmploye && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="size-4" /> Historique — {selectedEmploye.nom}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingHistory ? (
              <p className="p-4 text-sm text-muted-foreground">Chargement…</p>
            ) : history.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Aucun bulletin enregistré pour cet employé.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Période</TableHead>
                    <TableHead className="text-right">Brut</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">
                        {MOIS_NOMS[b.mois - 1]} {b.annee}
                      </TableCell>
                      <TableCell className="text-right text-xs">{formatMontant(b.brut)}</TableCell>
                      <TableCell className="text-right text-xs font-semibold text-success">
                        {formatMontant(b.net_a_payer)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statutClass(b.statut)}>
                          {statutLabel(b.statut)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => handlePdfHistory(b)}>
                          <Download className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Bulletins;