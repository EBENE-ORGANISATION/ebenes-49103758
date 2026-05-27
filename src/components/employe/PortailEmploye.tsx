import { useEffect, useMemo, useRef, useState } from "react";
import { useEbeneStoreRemote as useEbeneStore } from "@/hooks/useEbeneStoreRemote";
import { useAuth } from "@/hooks/useAuth";
import { usePortailEmploye } from "@/hooks/usePortailEmploye";
import { useBulletinsPaie } from "@/hooks/useBulletinsPaie";
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
import { LogOut, Download, Send, Calendar, FileText, Clock, AlertCircle, Award, Gavel, MessageSquare, User, Phone, Mail, Hash, Briefcase, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { MOIS_NOMS, TypeAbsence, TYPE_ABSENCE_LABELS, StatutValidation, TYPE_SANCTION_LABELS } from "@/types/ebene";
import { useTranslation } from "react-i18next";
/** Base annuelle de congés payés selon le Code du Travail togolais. */
const BASE_CONGES_ANNUEL = 30;
import { generateBulletin } from "@/lib/bulletinPDF";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/lib/supabase";

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

// ─── Empreinte d'appareil légère (navigateur + résolution + fuseau) ────────
const deviceFingerprint = (): string => {
  const parts = [
    navigator.userAgent.slice(0, 80),
    screen.width,
    screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  return btoa(parts.join("|")).slice(0, 32);
};

const TRUSTED_PREFIX = "ebene_trusted_device_";

export const PortailEmploye = () => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { currentSociete, societeConfig } = useTenant();
  const store = useEbeneStore(currentSociete?.id ?? null);
  const annee = new Date().getFullYear();

  // ─── Vérification appareil ─────────────────────────────────────────────
  const [deviceVerified, setDeviceVerified] = useState<boolean | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState("");

  useEffect(() => {
    if (!user) return;
    const fp = deviceFingerprint();
    const stored = localStorage.getItem(`${TRUSTED_PREFIX}${user.id}`);

    // stored = "{fingerprint}:{sessionId}" ou ancien format "{fingerprint}"
    // On exige que le fingerprint ET la session courante soient reconnus.
    const currentSession = user.id; // remplacé par l'access_token hash ci-dessous
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token ?? "";
      // Clé de session = 8 premiers chars du token (stable pour la session)
      const sessionKey = token.slice(0, 8);
      const expectedValue = `${fp}:${sessionKey}`;

      console.log("[OTP] device check", {
        stored,
        expectedValue,
        fp,
        sessionKey,
        isTrusted: stored === expectedValue,
      });

      setDeviceVerified(stored === expectedValue);
    });
  }, [user]);

  const sendOtp = async () => {
    if (!user?.email) return;
    setOtpSending(true);
    setOtpError("");
    const fp = deviceFingerprint();
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "send_device_otp", email: user.email, device_fp: fp },
    });
    if (error || data?.error) {
      setOtpError(data?.error ?? "Impossible d'envoyer le code. Réessayez.");
    } else {
      setOtpSent(true);
    }
    setOtpSending(false);
  };

  const verifyOtp = async () => {
    if (!user || !otpCode.trim()) return;
    setOtpVerifying(true);
    setOtpError("");
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "verify_device_otp", otp_code: otpCode.trim() },
    });
    if (error || !data?.ok) {
      setOtpError(data?.error ?? "Code incorrect ou expiré.");
    } else {
      // Stocke "{fingerprint}:{sessionKey}" pour lier la confiance à la session courante
      const fp = deviceFingerprint();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      const sessionKey = token.slice(0, 8);
      localStorage.setItem(`${TRUSTED_PREFIX}${user.id}`, `${fp}:${sessionKey}`);
      setDeviceVerified(true);
    }
    setOtpVerifying(false);
  };
  const { messages, loadingMessages, nonLus, envoyerMessage, marquerLus } =
    usePortailEmploye(currentSociete?.id ?? null);
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

  // ─── Bulletins depuis Supabase (table bulletins_paie) ─────────────────
  const { loadBulletinsEmploye } = useBulletinsPaie(currentSociete?.id ?? null);
  const [bulletinsSupabase, setBulletinsSupabase] = useState<
    import("@/types/ebene").BulletinPaieRecord[]
  >([]);

  useEffect(() => {
    if (user) {
      loadBulletinsEmploye(user.id).then(setBulletinsSupabase);
    }
  }, [user, loadBulletinsEmploye]);

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

  // ─── Messagerie ────────────────────────────────────────────────────────
  const [msgTexte, setMsgTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleEnvoyerMsg = async () => {
    if (!msgTexte.trim() || envoi) return;
    setEnvoi(true);
    const ok = await envoyerMessage(msgTexte);
    if (ok) {
      setMsgTexte("");
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      toast.error("Erreur lors de l'envoi du message");
    }
    setEnvoi(false);
  };

  // ─── Form demande de congé ─────────────────────────────────────────────
  const [demande, setDemande] = useState({
    type: "conges_payes" as TypeAbsence,
    dateDebut: new Date().toISOString().split("T")[0],
    dateFin: new Date().toISOString().split("T")[0],
    motif: "",
  });
  const [editId, setEditId] = useState<number | null>(null);
  const demandeRef = useRef<HTMLDivElement>(null);

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
    if (editId != null) {
      store.removeAbsence(anneeDemande, moisDemande, editId);
    }
    store.addAbsence(anneeDemande, moisDemande, {
      employeId: employe.id,
      type: demande.type,
      dateDebut: demande.dateDebut,
      dateFin: demande.dateFin,
      jours,
      motif: demande.motif,
      statutValidation: "en_validation",
    });
    toast.success(
      editId != null
        ? "Demande modifiée et renvoyée — en attente de validation"
        : "Demande envoyée — en attente de validation par le chef GRH",
    );
    setEditId(null);
    setDemande((d) => ({ ...d, motif: "" }));
  };

  const modifierDemande = (abs: import("@/types/ebene").Absence) => {
    setEditId(abs.id);
    setDemande({
      type: abs.type,
      dateDebut: abs.dateDebut,
      dateFin: abs.dateFin,
      motif: abs.motif || "",
    });
    setTimeout(
      () => demandeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      50,
    );
  };

  // ─── Vérification appareil (null = chargement en cours) ─────────────
  // null : useEffect pas encore exécuté → on bloque le rendu pour éviter
  // que le portail s'affiche une fraction de seconde avant la vérification.
  if (deviceVerified === null) return null;

  if (deviceVerified === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="size-5 text-warning" /> Nouvel appareil détecté
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!otpSent ? (
                <>
                  <p>
                    Votre connexion provient d'un appareil non reconnu.
                    Cliquez sur le bouton ci-dessous pour recevoir un code
                    de vérification par email.
                  </p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                  {otpError && (
                    <p className="text-xs text-destructive">{otpError}</p>
                  )}
                  <Button
                    className="w-full"
                    onClick={sendOtp}
                    disabled={otpSending}
                  >
                    {otpSending ? "Envoi…" : "Envoyer le code par email"}
                  </Button>
                </>
              ) : (
                <>
                  <p>
                    Un code à 6 chiffres a été envoyé à{" "}
                    <strong>{user?.email}</strong>. Il expire dans 10 minutes.
                  </p>
                  <Input
                    placeholder="Code à 6 chiffres"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void verifyOtp();
                    }}
                    className="text-center tracking-widest text-lg font-mono"
                  />
                  {otpError && (
                    <p className="text-xs text-destructive">{otpError}</p>
                  )}
                  <Button
                    className="w-full"
                    onClick={verifyOtp}
                    disabled={otpVerifying || otpCode.length !== 6}
                  >
                    {otpVerifying ? "Vérification…" : "Confirmer"}
                  </Button>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline w-full text-center"
                    onClick={() => { setOtpSent(false); setOtpCode(""); setOtpError(""); }}
                  >
                    Renvoyer le code
                  </button>
                </>
              )}
            </CardContent>
          </Card>
          <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => signOut()}>
            <LogOut className="size-4" /> Déconnexion
          </Button>
        </div>
      </div>
    );
  }

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
        {/* Informations personnelles */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="size-4" /> Mes informations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <User className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Nom</p>
                  <p className="font-medium">{employe.nom}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Briefcase className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Poste</p>
                  <p className="font-medium">{employe.poste || "—"}</p>
                </div>
              </div>
              {employe.matricule && (
                <div className="flex items-start gap-2">
                  <Hash className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Matricule</p>
                    <p className="font-medium">{employe.matricule}</p>
                  </div>
                </div>
              )}
              {employe.email && (
                <div className="flex items-start gap-2">
                  <Mail className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Email</p>
                    <p className="font-medium">{employe.email}</p>
                  </div>
                </div>
              )}
              {employe.telephone && (
                <div className="flex items-start gap-2">
                  <Phone className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Téléphone</p>
                    <p className="font-medium">{employe.telephone}</p>
                  </div>
                </div>
              )}
              {employe.salaire !== undefined && employe.salaire > 0 && (
                <div className="flex items-start gap-2">
                  <CreditCard className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Salaire de base</p>
                    <p className="font-medium">
                      {employe.salaire.toLocaleString("fr-FR")} F CFA
                    </p>
                  </div>
                </div>
              )}
              {employe.categorie && (
                <div className="flex items-start gap-2">
                  <FileText className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Catégorie</p>
                    <p className="font-medium">{employe.categorie}</p>
                  </div>
                </div>
              )}
              {employe.dateEmbauche && (
                <div className="flex items-start gap-2">
                  <Calendar className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Date d'embauche</p>
                    <p className="font-medium">{employe.dateEmbauche}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

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
              <div className="text-3xl font-bold">{bulletinsSupabase.length}</div>
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
              <FileText className="size-4" /> Mes bulletins de paie
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bulletinsSupabase.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun bulletin disponible.</p>
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
                  {bulletinsSupabase.map((b) => (
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
                            className="gap-1.5"
                            onClick={() => {
                              try {
                                generateBulletin(employe, store.getMois(b.annee, b.mois), b.annee, b.mois, societeInfo);
                              } catch (err) {
                                console.error(err);
                                toast.error("Impossible de générer le bulletin");
                              }
                            }}
                          >
                            <Download className="size-4" /> PDF
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

        {/* Demande de congé */}
        <Card ref={demandeRef}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="size-4" />
              {editId != null ? "Modifier ma demande rejetée" : "Demander un congé"}
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
                      <SelectItem key={k} value={k}>{t(`type_absence.${k}`, { defaultValue: v.label })}</SelectItem>
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
              <div className="flex items-center gap-2">
                {editId != null && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditId(null);
                      setDemande({
                        type: "conges_payes",
                        dateDebut: new Date().toISOString().split("T")[0],
                        dateFin: new Date().toISOString().split("T")[0],
                        motif: "",
                      });
                    }}
                  >
                    Annuler
                  </Button>
                )}
                <Button onClick={envoyerDemande} className="gap-1.5">
                  <Send className="size-4" />
                  {editId != null ? "Renvoyer la demande" : "Envoyer la demande"}
                </Button>
              </div>
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
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {absences
                    .slice()
                    .sort((a, b) => (a.abs.dateDebut < b.abs.dateDebut ? 1 : -1))
                    .map(({ abs }) => (
                      <TableRow key={abs.id}>
                        <TableCell>{t(`type_absence.${abs.type}`, { defaultValue: TYPE_ABSENCE_LABELS[abs.type as TypeAbsence]?.label ?? abs.type })}</TableCell>
                        <TableCell>{abs.dateDebut}</TableCell>
                        <TableCell>{abs.dateFin}</TableCell>
                        <TableCell className="text-right">{abs.jours}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {abs.motif || "-"}
                          {abs.statutValidation === "rejete" && abs.motifRejet && (
                            <div className="mt-1 text-destructive italic">
                              Motif du rejet : {abs.motifRejet}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{statutBadge(abs.statutValidation)}</TableCell>
                        <TableCell className="text-right">
                          {abs.statutValidation === "rejete" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => modifierDemande(abs)}
                            >
                              Modifier
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
                        <TableCell>{t(`type_sanction.${s.type}`, { defaultValue: TYPE_SANCTION_LABELS[s.type as keyof typeof TYPE_SANCTION_LABELS] ?? s.type })}</TableCell>
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

        {/* Messagerie avec l'administration */}
        <Card>
          <CardHeader>
            <CardTitle
              className="text-base flex items-center gap-2"
              onClick={() => marquerLus()}
            >
              <MessageSquare className="size-4" /> Messagerie
              {nonLus > 0 && (
                <Badge className="ml-1 bg-destructive text-destructive-foreground">
                  {nonLus} non lu{nonLus > 1 ? "s" : ""}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Thread */}
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
                    <div
                      key={msg.id}
                      className={`flex ${isAdmin ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                          isAdmin
                            ? "bg-card border text-foreground"
                            : "bg-primary text-primary-foreground"
                        }`}
                      >
                        <p>{msg.contenu}</p>
                        <p className={`text-[10px] mt-1 ${isAdmin ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
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
            {/* Input */}
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

        <footer className="text-center text-xs text-muted-foreground py-4">
          Portail self-service — vos données sont strictement personnelles.
        </footer>
      </main>
    </div>
  );
};

export default PortailEmploye;