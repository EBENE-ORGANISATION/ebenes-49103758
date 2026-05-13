/**
 * MonPortail — onglet "Mon Portail" de l'application principale.
 *
 * Affiche selon les droits :
 *  - "Mon espace"      : espace self-service de l'employé connecté
 *                        (bulletins, absences, primes, messagerie)
 *  - "Gestion portail" : vue admin GRH (invitation + messagerie employés)
 *
 * ⚠️ Ce composant est une version EMBARQUÉE (pas de page full-screen,
 *    pas de vérification OTP). La vérification d'identité est déjà
 *    assurée par l'auth principale de l'application.
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { useEbeneStoreRemote as useEbeneStore } from "@/hooks/useEbeneStoreRemote";
import { useAuth } from "@/hooks/useAuth";
import { usePortailEmploye } from "@/hooks/usePortailEmploye";
import { useBulletinsPaie } from "@/hooks/useBulletinsPaie";
import { useTenant } from "@/hooks/useTenant";
import { PortailAdminView } from "@/components/employe/PortailAdminView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Download,
  Send,
  Calendar,
  FileText,
  Clock,
  Award,
  Gavel,
  MessageSquare,
  User,
  Phone,
  Mail,
  Hash,
  Briefcase,
  CreditCard,
  AlertCircle,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import {
  MOIS_NOMS,
  TypeAbsence,
  TYPE_ABSENCE_LABELS,
  StatutValidation,
  TYPE_SANCTION_LABELS,
} from "@/types/ebene";
import { useTranslation } from "react-i18next";
import { generateBulletin } from "@/lib/bulletinPDF";

// ─── Constantes ───────────────────────────────────────────────────────────────
const BASE_CONGES_ANNUEL = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const statutBadge = (s?: StatutValidation) => {
  switch (s) {
    case "valide":
      return <Badge className="bg-success/15 text-success border-success/30 text-xs">Validé</Badge>;
    case "rejete":
      return <Badge variant="destructive" className="text-xs">Rejeté</Badge>;
    case "brouillon":
      return <Badge variant="outline" className="text-xs">Brouillon</Badge>;
    default:
      return <Badge className="bg-warning/15 text-warning border-warning/30 text-xs">En attente</Badge>;
  }
};

const diffJours = (a: string, b: string) => {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.max(1, Math.round((db - da) / 86_400_000) + 1);
};

// ─── Section self-service employé ────────────────────────────────────────────
const MonEspace = ({ societeId }: { societeId: string }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentSociete, societeConfig } = useTenant();
  const store = useEbeneStore(societeId);
  const annee = new Date().getFullYear();

  // Fiche employé liée au compte
  const employe = useMemo(
    () => store.employes.find((e) => e.userId && user && e.userId === user.id),
    [store.employes, user],
  );

  // Infos société pour le PDF
  const societeInfo = useMemo(() => ({
    nom: currentSociete?.nom ?? null,
    adresse: societeConfig?.adresse ?? currentSociete?.adresse ?? null,
    telephone: societeConfig?.telephone ?? currentSociete?.telephone ?? null,
    email: societeConfig?.email ?? currentSociete?.email ?? null,
    nif: societeConfig?.nif ?? currentSociete?.nif ?? null,
    rccm: societeConfig?.rccm ?? currentSociete?.rccm ?? null,
    logo_url: societeConfig?.logo_url ?? currentSociete?.logo_url ?? null,
    mention_facture: societeConfig?.mention_facture ?? null,
  }), [currentSociete, societeConfig]);

  // Bulletins depuis Supabase
  const { loadBulletinsEmploye } = useBulletinsPaie(societeId);
  const [bulletins, setBulletins] = useState<import("@/types/ebene").BulletinPaieRecord[]>([]);
  useEffect(() => {
    if (user) loadBulletinsEmploye(user.id).then(setBulletins);
  }, [user, loadBulletinsEmploye]);

  // Absences de l'année courante
  const absences = useMemo(() => {
    if (!employe) return [];
    const result: Array<{ mois: number; abs: import("@/types/ebene").Absence }> = [];
    for (let m = 1; m <= 12; m++) {
      const d = store.getMois(annee, m);
      (d.absences || [])
        .filter((a) => a.employeId === employe.id)
        .forEach((abs) => result.push({ mois: m, abs }));
    }
    return result;
  }, [employe, store, annee]);

  // Solde de congés
  const soldeConges = useMemo(() => {
    if (!employe) return { restants: BASE_CONGES_ANNUEL, consommes: 0 };
    const consommes = absences
      .filter((x) => x.abs.type === "conges_payes" && x.abs.statutValidation === "valide")
      .reduce((s, x) => s + (x.abs.jours || 0), 0);
    return { restants: Math.max(0, BASE_CONGES_ANNUEL - consommes), consommes };
  }, [employe, absences]);

  // Primes & sanctions (12 derniers mois)
  const historique = useMemo(() => {
    if (!employe) return { primes: [] as Array<{ mois: number; annee: number; prime: import("@/types/ebene").Prime }>, sanctions: [] as import("@/types/ebene").Sanction[] };
    const debut = new Date();
    debut.setMonth(debut.getMonth() - 11);
    debut.setDate(1);
    const primes: Array<{ mois: number; annee: number; prime: import("@/types/ebene").Prime }> = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(debut.getFullYear(), debut.getMonth() + i, 1);
      const a = d.getFullYear();
      const m = d.getMonth() + 1;
      const data = store.getMois(a, m);
      (data.primes?.[employe.id] || []).forEach((p) =>
        primes.push({ mois: m, annee: a, prime: p as import("@/types/ebene").Prime }),
      );
    }
    const sanctions = (store.sanctions || []).filter(
      (s) => s.employeId === employe.id && new Date(s.date) >= debut,
    );
    return { primes, sanctions };
  }, [employe, store]);

  // Messagerie
  const { messages, loadingMessages, nonLus, envoyerMessage, marquerLus } =
    usePortailEmploye(societeId);
  const [msgTexte, setMsgTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleEnvoyerMsg = async () => {
    if (!msgTexte.trim() || envoi) return;
    setEnvoi(true);
    const ok = await envoyerMessage(msgTexte.trim());
    if (ok) {
      setMsgTexte("");
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } else {
      toast.error("Erreur lors de l'envoi");
    }
    setEnvoi(false);
  };

  // Formulaire demande de congé
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
    const moisD = new Date(demande.dateDebut).getMonth() + 1;
    const anneeD = new Date(demande.dateDebut).getFullYear();
    store.addAbsence(anneeD, moisD, {
      employeId: employe.id,
      type: demande.type,
      dateDebut: demande.dateDebut,
      dateFin: demande.dateFin,
      jours,
      motif: demande.motif,
      statutValidation: "en_validation",
    });
    toast.success("Demande envoyée — en attente de validation GRH");
    setDemande((d) => ({ ...d, motif: "" }));
  };

  // Aucun compte lié à une fiche
  if (!employe) {
    return (
      <Card>
        <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
          <AlertCircle className="size-8 text-warning" />
          <p className="font-semibold">Compte non lié à une fiche employé</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Votre compte n'est associé à aucune fiche dans le système GRH de cette société.
            Communiquez votre identifiant ci-dessous au service GRH.
          </p>
          <code className="text-xs bg-muted px-3 py-2 rounded border break-all">{user?.id}</code>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Profil ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="size-4" /> Mon profil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
            <InfoCell icon={<User />} label="Nom" value={employe.nom} />
            <InfoCell icon={<Briefcase />} label="Poste" value={employe.poste} />
            {employe.matricule && <InfoCell icon={<Hash />} label="Matricule" value={employe.matricule} />}
            {employe.email && <InfoCell icon={<Mail />} label="Email" value={employe.email} />}
            {employe.telephone && <InfoCell icon={<Phone />} label="Téléphone" value={employe.telephone} />}
            {employe.dateEmbauche && <InfoCell icon={<Calendar />} label="Embauche" value={employe.dateEmbauche} />}
            {employe.categorie && <InfoCell icon={<FileText />} label="Catégorie" value={employe.categorie} />}
            {!!employe.salaire && (
              <InfoCell
                icon={<CreditCard />}
                label="Salaire de base"
                value={`${employe.salaire.toLocaleString("fr-FR")} F CFA`}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── KPI ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-2">
              <Calendar className="size-3.5" /> Solde de congés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{soldeConges.restants}</p>
            <p className="text-xs text-muted-foreground">jours restants / {BASE_CONGES_ANNUEL}</p>
            <Progress value={(soldeConges.restants / BASE_CONGES_ANNUEL) * 100} className="mt-2 h-1.5" />
            <p className="text-[11px] text-muted-foreground mt-1">
              {soldeConges.consommes} consommé(s) cette année
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-2">
              <FileText className="size-3.5" /> Bulletins {annee}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{bulletins.length}</p>
            <p className="text-xs text-muted-foreground">disponibles</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-2">
              <Clock className="size-3.5" /> Absences {annee}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{absences.length}</p>
            <p className="text-xs text-muted-foreground">enregistrées</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Bulletins de paie ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="size-4" /> Mes bulletins de paie
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bulletins.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucun bulletin disponible pour le moment.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Période</TableHead>
                  <TableHead className="text-right">Net à payer</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bulletins
                  .slice()
                  .sort((a, b) => a.annee === b.annee ? b.mois - a.mois : b.annee - a.annee)
                  .map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">
                        {MOIS_NOMS[b.mois - 1]} {b.annee}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-success">
                        {b.net_a_payer.toLocaleString("fr-FR")} F CFA
                      </TableCell>
                      <TableCell>
                        {b.statut === "paye" ? (
                          <Badge className="bg-primary/15 text-primary border-primary/30 text-xs">Payé</Badge>
                        ) : b.statut === "valide" ? (
                          <Badge className="bg-success/15 text-success border-success/30 text-xs">Validé</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Brouillon</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {b.statut !== "brouillon" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 h-7 text-xs"
                            onClick={() => {
                              try {
                                generateBulletin(
                                  employe,
                                  store.getMois(b.annee, b.mois),
                                  b.annee,
                                  b.mois,
                                  societeInfo,
                                );
                              } catch {
                                toast.error("Impossible de générer le bulletin");
                              }
                            }}
                          >
                            <Download className="size-3" /> PDF
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Demande de congé / absence ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="size-4" /> Demander un congé ou une absence
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Type</Label>
              <Select
                value={demande.type}
                onValueChange={(v) => setDemande((d) => ({ ...d, type: v as TypeAbsence }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_ABSENCE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Du</Label>
                <Input
                  type="date"
                  value={demande.dateDebut}
                  onChange={(e) => setDemande((d) => ({ ...d, dateDebut: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Au</Label>
                <Input
                  type="date"
                  value={demande.dateFin}
                  onChange={(e) => setDemande((d) => ({ ...d, dateFin: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Motif <span className="font-normal normal-case">(optionnel)</span>
            </Label>
            <Textarea
              rows={2}
              value={demande.motif}
              onChange={(e) => setDemande((d) => ({ ...d, motif: e.target.value }))}
              placeholder="Précisez le motif si nécessaire…"
              className="resize-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Durée estimée :{" "}
              <strong>{diffJours(demande.dateDebut, demande.dateFin)}</strong> jour(s)
            </p>
            <Button onClick={envoyerDemande} className="gap-1.5">
              <Send className="size-4" /> Envoyer la demande
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Historique absences ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="size-4" /> Mes absences — {annee}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {absences.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Aucune absence cette année.</p>
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
                      <TableCell className="text-xs">
                        {TYPE_ABSENCE_LABELS[abs.type as TypeAbsence]?.label ?? abs.type}
                      </TableCell>
                      <TableCell className="text-xs">{abs.dateDebut}</TableCell>
                      <TableCell className="text-xs">{abs.dateFin}</TableCell>
                      <TableCell className="text-right text-xs">{abs.jours}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {abs.motif || "—"}
                      </TableCell>
                      <TableCell>{statutBadge(abs.statutValidation)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Primes — 12 derniers mois ── */}
      {historique.primes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Award className="size-4" /> Mes primes — 12 derniers mois
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                  .sort((a, b) => a.annee === b.annee ? b.mois - a.mois : b.annee - a.annee)
                  .map(({ mois, annee: an, prime }) => (
                    <TableRow key={`${an}-${mois}-${prime.id}`}>
                      <TableCell className="font-medium text-xs">
                        {MOIS_NOMS[mois - 1]} {an}
                      </TableCell>
                      <TableCell className="text-xs">{prime.libelle || "—"}</TableCell>
                      <TableCell className="text-right font-semibold text-xs">
                        {prime.montant.toLocaleString("fr-FR")}
                      </TableCell>
                      <TableCell>{statutBadge(prime.statutValidation)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Sanctions — 12 derniers mois ── */}
      {historique.sanctions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Gavel className="size-4" /> Mes sanctions — 12 derniers mois
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                      <TableCell className="text-xs">{s.date}</TableCell>
                      <TableCell className="text-xs">
                        {TYPE_SANCTION_LABELS[s.type as keyof typeof TYPE_SANCTION_LABELS] ?? s.type}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.motif || "—"}
                      </TableCell>
                      <TableCell>{statutBadge(s.statutValidation)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Messagerie avec l'administration ── */}
      <Card>
        <CardHeader>
          <CardTitle
            className="text-sm flex items-center gap-2 cursor-pointer select-none"
            onClick={() => marquerLus()}
          >
            <MessageSquare className="size-4" /> Messagerie
            {nonLus > 0 && (
              <Badge className="ml-1 bg-destructive text-destructive-foreground text-xs">
                {nonLus} non lu{nonLus > 1 ? "s" : ""}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            className="rounded border bg-muted/40 p-3 space-y-2 max-h-72 overflow-y-auto"
            onFocus={() => marquerLus()}
          >
            {loadingMessages ? (
              <p className="text-xs text-muted-foreground text-center py-4">Chargement…</p>
            ) : messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Aucun message — écrivez à votre administration.
              </p>
            ) : (
              messages.map((msg) => {
                const isAdmin = msg.auteur === "admin";
                return (
                  <div key={msg.id} className={`flex ${isAdmin ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                        isAdmin
                          ? "bg-card border text-foreground"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      <p>{msg.contenu}</p>
                      <p
                        className={`text-[10px] mt-1 ${
                          isAdmin ? "text-muted-foreground" : "text-primary-foreground/70"
                        }`}
                      >
                        {isAdmin ? "Administration" : "Vous"} ·{" "}
                        {new Date(msg.created_at).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="flex gap-2">
            <Textarea
              rows={1}
              placeholder="Votre message…"
              value={msgTexte}
              onChange={(e) => setMsgTexte(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleEnvoyerMsg();
                }
              }}
              className="resize-none"
            />
            <Button
              size="sm"
              disabled={!msgTexte.trim() || envoi}
              onClick={handleEnvoyerMsg}
              className="gap-1.5 self-end"
            >
              <Send className="size-4" />
              {envoi ? "…" : "Envoyer"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Petit helper d'affichage ─────────────────────────────────────────────────
const InfoCell = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}) => (
  <div className="flex items-start gap-2 min-w-0">
    <span className="size-4 text-muted-foreground mt-0.5 shrink-0">{icon}</span>
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">
        {label}
      </p>
      <p className="text-sm font-medium truncate">{value || "—"}</p>
    </div>
  </div>
);

// ─── Composant principal exporté ──────────────────────────────────────────────
export const MonPortail = () => {
  const { can } = useAuth();
  const { currentSociete } = useTenant();
  const sid = currentSociete?.id ?? null;

  const showGrh = can("grh", "read");

  if (!sid) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Sélectionnez une société pour accéder au portail.
        </CardContent>
      </Card>
    );
  }

  // Tous les utilisateurs ont accès à "Mon espace" personnel.
  // Les utilisateurs avec droits GRH voient en plus l'onglet "Gestion portail".
  if (!showGrh) {
    return <MonEspace societeId={sid} />;
  }

  // Les deux : sous-onglets
  return (
    <Tabs defaultValue="moi" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="moi" className="gap-1.5">
          <User className="size-3.5" /> Mon espace
        </TabsTrigger>
        <TabsTrigger value="gestion" className="gap-1.5">
          <UserCog className="size-3.5" /> Gestion portail
        </TabsTrigger>
      </TabsList>
      <TabsContent value="moi">
        <MonEspace societeId={sid} />
      </TabsContent>
      <TabsContent value="gestion">
        <PortailAdminView />
      </TabsContent>
    </Tabs>
  );
};
