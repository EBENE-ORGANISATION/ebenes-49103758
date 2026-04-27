import { useMemo, useState } from "react";
import { useEbeneStore } from "@/hooks/useEbeneStore";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
import { LogOut, Download, Send, Calendar, FileText, Clock, AlertCircle, Award, Gavel } from "lucide-react";
import { toast } from "sonner";
import { MOIS_NOMS, TypeAbsence, TYPE_ABSENCE_LABELS, StatutValidation, TYPE_SANCTION_LABELS } from "@/types/ebene";
/** Base annuelle de congés payés selon le Code du Travail togolais. */
const BASE_CONGES_ANNUEL = 30;
import { generateBulletin } from "@/lib/bulletinPDF";
import { useTenant } from "@/hooks/useTenant";

/** Construit l'objet societeInfo passé aux générateurs PDF / en-têtes. */
const buildSocieteInfo = (
  societe: ReturnType<typeof useTenant>["currentSociete"],
  config: ReturnType<typeof useTenant>["societeConfig"],
) => ({
  nom: societe?.nom ?? null,
  adresse: config?.adresse ?? societe?.adresse ?? null,
  telephone: config?.telephone ?? societe?.telephone ?? null,
  email: config?.email ?? societe?.email ?? null,
  nif: config?.nif ?? societe?.nif ?? null,
  rccm: config?.rccm ?? societe?.rccm ?? null,
  logo_url: config?.logo_url ?? societe?.logo_url ?? null,
  mention_facture: config?.mention_facture ?? null,
});

const statutBadge = (s?: StatutValidation) => {
  switch (s) {
    case "valide":
      return <Badge className="bg-success text-success-foreground">Validé</Badge>;
    case "rejete":
      return <Badge variant="destructive">Rejeté</Badge>;
    case "brouillon":
      return <Badge variant="outline">Brouillon</Badge>;
    case "en_validation":
    default:
      return <Badge className="bg-warning text-warning-foreground">En attente</Badge>;
  }
};

const diffJours = (a: string, b: string) => {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.max(1, Math.round((db - da) / 86_400_000) + 1);
};

export const PortailEmploye = () => {
  const { user, signOut } = useAuth();
  const store = useEbeneStore();
  const annee = new Date().getFullYear();
  const { currentSociete, societeConfig } = useTenant();
  const societeInfo = useMemo(
    () => buildSocieteInfo(currentSociete, societeConfig),
    [currentSociete, societeConfig],
  );
  const brandLogo = societeInfo.logo_url || null;
  const brandNom = societeInfo.nom || "Portail employé";

  // ─── Recherche de la fiche employé liée au compte ──────────────────────
  const employe = useMemo(
    () => store.employes.find((e) => e.userId && user && e.userId === user.id),
    [store.employes, user]
  );

  // ─── Bulletins de l'année (tous les mois où l'employé existe) ──────────
  const bulletins = useMemo(() => {
    if (!employe) return [] as Array<{ mois: number }>;
    const result: Array<{ mois: number }> = [];
    for (let m = 1; m <= 12; m++) {
      const data = store.getMois(annee, m);
      // On considère qu'un bulletin existe dès qu'il y a un employé actif ce mois-là.
      // (La fiche employé est mensuelle ; on liste tous les mois passés ou en cours.)
      const moisDate = new Date(annee, m - 1, 1);
      if (moisDate <= new Date()) {
        result.push({ mois: m });
      }
      void data;
    }
    return result;
  }, [employe, store, annee]);

  // ─── Absences de l'année ───────────────────────────────────────────────
  const absences = useMemo(() => {
    if (!employe) return [];
    const all: Array<{ mois: number; abs: ReturnType<typeof Object> }> = [];
    for (let m = 1; m <= 12; m++) {
      const data = store.getMois(annee, m);
      (data.absences || [])
        .filter((a) => a.employeId === employe.id)
        .forEach((abs) => all.push({ mois: m, abs: abs as never }));
    }
    return all as Array<{
      mois: number;
      abs: import("@/types/ebene").Absence;
    }>;
  }, [employe, store, annee]);

  // ─── Solde de congés (champ employé + absences validées de type congés payés) ──
  const soldeConges = useMemo(() => {
    if (!employe) return { restants: 0, consommes: 0, base: BASE_CONGES_ANNUEL };
    const consommes = absences
      .filter((x) => x.abs.type === "conges_payes" && x.abs.statutValidation === "valide")
      .reduce((s, x) => s + (x.abs.jours || 0), 0);
    const restants = Math.max(0, BASE_CONGES_ANNUEL - consommes);
    return { restants, consommes, base: BASE_CONGES_ANNUEL };
  }, [employe, absences]);

  // ─── Historique 12 derniers mois : primes & sanctions ──────────────────
  const historique = useMemo(() => {
    if (!employe) return { primes: [] as Array<{ mois: number; annee: number; prime: import("@/types/ebene").Prime }>, sanctions: [] as Array<import("@/types/ebene").Sanction> };
    const now = new Date();
    const debut = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const primes: Array<{ mois: number; annee: number; prime: import("@/types/ebene").Prime }> = [];
    const sanctions: Array<import("@/types/ebene").Sanction> = [];
    for (let offset = 0; offset < 12; offset++) {
      const d = new Date(debut.getFullYear(), debut.getMonth() + offset, 1);
      const a = d.getFullYear();
      const m = d.getMonth() + 1;
      const data = store.getMois(a, m);
      const empPrimes = (data.primes?.[employe.id] || []) as import("@/types/ebene").Prime[];
      empPrimes.forEach((p) => primes.push({ mois: m, annee: a, prime: p }));
    }
    // Sanctions (non liées au mois)
    const limite = debut.getTime();
    (store.sanctions || [])
      .filter((s) => s.employeId === employe.id && new Date(s.date).getTime() >= limite)
      .forEach((s) => sanctions.push(s));
    return { primes, sanctions };
  }, [employe, store, annee]);

  // ─── Form demande de congé ─────────────────────────────────────────────
  const [demande, setDemande] = useState({
    type: "conges_payes" as TypeAbsence,
    dateDebut: new Date().toISOString().split("T")[0],
    dateFin: new Date().toISOString().split("T")[0],
    motif: "",
  });

  const envoyerDemande = () => {
    if (!employe) return;
    if (!demande.dateDebut || !demande.dateFin) {
      toast.error("Renseignez les dates");
      return;
    }
    const jours = diffJours(demande.dateDebut, demande.dateFin);
    if (jours <= 0) {
      toast.error("Dates invalides");
      return;
    }
    const moisDemande = new Date(demande.dateDebut).getMonth() + 1;
    const anneeDemande = new Date(demande.dateDebut).getFullYear();
    store.addAbsence(anneeDemande, moisDemande, {
      employeId: employe.id,
      type: demande.type,
      dateDebut: demande.dateDebut,
      dateFin: demande.dateFin,
      jours,
      motif: demande.motif,
      statutValidation: "en_validation",
    });
    toast.success("Demande envoyée — en attente de validation par le chef GRH");
    setDemande((d) => ({ ...d, motif: "" }));
  };

  // ─── Cas : compte non lié à un employé ─────────────────────────────────
  if (!employe) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {brandLogo && <img src={brandLogo} alt={brandNom} className="h-9 w-9 object-contain" />}
            <div>
              <h1 className="font-bold leading-tight">{brandNom} — Portail Employé</h1>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => signOut()} className="gap-1.5">
            <LogOut className="size-4" /> Déconnexion
          </Button>
        </header>
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="size-5 text-warning" /> Compte non lié
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Votre compte n'est associé à aucune fiche employé dans le système GRH.
              </p>
              <p className="text-muted-foreground">
                Communiquez l'identifiant ci-dessous au service GRH pour qu'il l'ajoute
                à votre fiche :
              </p>
              <div className="font-mono text-xs bg-muted p-3 rounded border break-all">
                {user?.id}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {brandLogo && <img src={brandLogo} alt={brandNom} className="h-9 w-9 object-contain" />}
          <div>
            <h1 className="font-bold leading-tight">{brandNom} — Portail Employé</h1>
            <p className="text-xs text-muted-foreground">
              {employe.nom} • {employe.poste}
              {employe.matricule ? ` • Mat. ${employe.matricule}` : ""}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => signOut()} className="gap-1.5">
          <LogOut className="size-4" /> Déconnexion
        </Button>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* KPI rapides */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="size-4" /> Solde de congés
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{soldeConges.restants}</div>
              <p className="text-xs text-muted-foreground">
                jours restants / {soldeConges.base}
              </p>
              <Progress
                value={(soldeConges.restants / soldeConges.base) * 100}
                className="mt-2 h-2"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {soldeConges.consommes} jour(s) consommé(s) cette année
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText className="size-4" /> Bulletins {annee}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{bulletins.length}</div>
              <p className="text-xs text-muted-foreground">disponibles</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="size-4" /> Absences {annee}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{absences.length}</div>
              <p className="text-xs text-muted-foreground">enregistrées</p>
            </CardContent>
          </Card>
        </div>

        {/* Bulletins de paie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="size-4" /> Mes bulletins de paie {annee}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bulletins.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun bulletin pour cette année.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Période</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulletins.map(({ mois }) => (
                    <TableRow key={mois}>
                      <TableCell className="font-medium">
                        {MOIS_NOMS[mois - 1]} {annee}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => {
                            try {
                              generateBulletin(employe, store.getMois(annee, mois), annee, mois, societeInfo);
                            } catch (err) {
                              console.error(err);
                              toast.error("Impossible de générer le bulletin");
                            }
                          }}
                        >
                          <Download className="size-4" /> PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Demande de congé */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="size-4" /> Demander un congé
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold uppercase text-muted-foreground">Type</Label>
                <Select
                  value={demande.type}
                  onValueChange={(v) => setDemande((d) => ({ ...d, type: v as TypeAbsence }))}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_ABSENCE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Du</Label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={demande.dateDebut}
                    onChange={(e) => setDemande((d) => ({ ...d, dateDebut: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Au</Label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={demande.dateFin}
                    onChange={(e) => setDemande((d) => ({ ...d, dateFin: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase text-muted-foreground">Motif (optionnel)</Label>
              <Textarea
                rows={2}
                className="mt-1"
                value={demande.motif}
                onChange={(e) => setDemande((d) => ({ ...d, motif: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Durée : <strong>{diffJours(demande.dateDebut, demande.dateFin)}</strong> jour(s)
              </p>
              <Button onClick={envoyerDemande} className="gap-1.5">
                <Send className="size-4" /> Envoyer la demande
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Historique absences */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="size-4" /> Mon historique d'absences {annee}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {absences.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune absence cette année.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Du</TableHead>
                    <TableHead>Au</TableHead>
                    <TableHead className="text-right">Jours</TableHead>
                    <TableHead>Motif</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {absences
                    .slice()
                    .sort((a, b) => (a.abs.dateDebut < b.abs.dateDebut ? 1 : -1))
                    .map(({ abs }) => (
                      <TableRow key={abs.id}>
                        <TableCell>{TYPE_ABSENCE_LABELS[abs.type].label}</TableCell>
                        <TableCell>{abs.dateDebut}</TableCell>
                        <TableCell>{abs.dateFin}</TableCell>
                        <TableCell className="text-right">{abs.jours}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {abs.motif || "-"}
                        </TableCell>
                        <TableCell>{statutBadge(abs.statutValidation)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Historique primes — 12 derniers mois */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="size-4" /> Mes primes — 12 derniers mois
            </CardTitle>
          </CardHeader>
          <CardContent>
            {historique.primes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune prime sur la période.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Période</TableHead>
                    <TableHead>Libellé</TableHead>
                    <TableHead className="text-right">Montant (F CFA)</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historique.primes
                    .slice()
                    .sort((a, b) =>
                      a.annee === b.annee ? b.mois - a.mois : b.annee - a.annee,
                    )
                    .map(({ mois, annee: an, prime }) => (
                      <TableRow key={`${an}-${mois}-${prime.id}`}>
                        <TableCell className="font-medium">
                          {MOIS_NOMS[mois - 1]} {an}
                        </TableCell>
                        <TableCell>{prime.libelle || "-"}</TableCell>
                        <TableCell className="text-right">
                          {prime.montant.toLocaleString("fr-FR")}
                        </TableCell>
                        <TableCell>{statutBadge(prime.statutValidation)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Historique sanctions — 12 derniers mois */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gavel className="size-4" /> Mes sanctions — 12 derniers mois
            </CardTitle>
          </CardHeader>
          <CardContent>
            {historique.sanctions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune sanction sur la période.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Motif</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historique.sanctions
                    .slice()
                    .sort((a, b) => (a.date < b.date ? 1 : -1))
                    .map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.date}</TableCell>
                        <TableCell>{TYPE_SANCTION_LABELS[s.type]}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {s.motif || "-"}
                        </TableCell>
                        <TableCell>{statutBadge(s.statutValidation)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <footer className="text-center text-xs text-muted-foreground py-4">
          Portail self-service — vos données sont strictement personnelles.
        </footer>
      </main>
    </div>
  );
};

export default PortailEmploye;