import { Button } from "@/components/ui/button";
import {
  Download, Upload, Archive, BarChart3, Check, LogOut, Users, History,
  Shield, Cloud, CloudUpload, CloudOff, Loader2, RefreshCw, FolderOpen,
  Bell, AlertTriangle, AlertCircle, Info, Smartphone, Settings2, Trash2,
  Menu,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, ROLE_LABELS } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SocieteSwitcher } from "@/components/SocieteSwitcher";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { listDriveBackups, restoreFromDrive, type DriveFileInfo, type EbeneStoreLike } from "@/lib/googleDrive";
import { toast } from "sonner";
import type { Alerte } from "@/lib/alertes";


interface HeaderProps {
  onExport: () => void;
  onImport: (file: File) => void;
  onShowRecap: () => void;
  onShowArchives: () => void;
  lastSaved?: Date;
  driveStatus?: "idle" | "syncing" | "success" | "error";
  driveLastBackup?: Date | null;
  driveLastError?: string | null;
  onDriveBackup?: () => Promise<void> | void;
  store?: EbeneStoreLike;
  alertes?: Alerte[];
}

export const Header = ({
  onExport, onImport, onShowRecap, onShowArchives,
  lastSaved, driveStatus = "idle", driveLastBackup = null,
  driveLastError = null, onDriveBackup, store, alertes = [],
}: HeaderProps) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [savedAgo, setSavedAgo] = useState("à l'instant");
  const { user, roles, isAdmin, isSuperAdmin, isChefCompta, isChefGrh, signOut } = useAuth();
  const { canFeature } = useAuth();
  const { currentSociete, societeConfig } = useTenant();

  const inMasterMode = !currentSociete;
  const logoSrc = inMasterMode ? null : (societeConfig?.logo_url || null);
  const nomSociete = inMasterMode ? "EBENE Business Suite" : (currentSociete?.nom || "EBENE Business Suite");
  const sousTitre = currentSociete
    ? (societeConfig?.rccm || societeConfig?.nif || "Système de Gestion")
    : "Console de gestion globale";

  const showAlertes = canFeature("alertes");
  const showRecap = canFeature("recap_annuel");
  const showArchives = canFeature("archives");
  const showJsonIO = canFeature("json_io");
  const showUsersAdmin = isAdmin && canFeature("users_admin");
  const showAuditLog = isAdmin && canFeature("audit_log");
  const showCorbeille = isAdmin || isChefCompta || isChefGrh;
  const showParamSociete = isAdmin;

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFiles, setHistoryFiles] = useState<DriveFileInfo[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Statut sauvegarde
  const saveStatus = (() => {
    if (driveStatus === "syncing") return {
      icon: <Loader2 className="size-3 animate-spin text-primary" />,
      label: "Synchronisation…",
      color: "text-primary",
    };
    if (driveStatus === "error") return {
      icon: <CloudOff className="size-3 text-destructive" />,
      label: "Erreur Drive",
      color: "text-destructive",
    };
    if (driveStatus === "success") return {
      icon: <Cloud className="size-3 text-success" />,
      label: "Drive ✓",
      color: "text-success",
    };
    return {
      icon: <Check className="size-3 text-success" />,
      label: `Sauvegardé ${savedAgo}`,
      color: "text-success",
    };
  })();

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const files = await listDriveBackups();
      setHistoryFiles(files);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRestore = async (fileId: string) => {
    if (!store) { toast.error("Restauration impossible : store indisponible"); return; }
    if (!confirm("Restaurer cette sauvegarde ? Les données actuelles seront remplacées.")) return;
    setRestoringId(fileId);
    try {
      const ok = await restoreFromDrive(fileId, store);
      if (ok) setHistoryOpen(false);
    } finally {
      setRestoringId(null);
    }
  };

  useEffect(() => {
    if (!lastSaved) return;
    const tick = () => {
      const sec = Math.floor((Date.now() - lastSaved.getTime()) / 1000);
      if (sec < 5) setSavedAgo("à l'instant");
      else if (sec < 60) setSavedAgo(`il y a ${sec}s`);
      else if (sec < 3600) setSavedAgo(`il y a ${Math.floor(sec / 60)} min`);
      else setSavedAgo(`il y a ${Math.floor(sec / 3600)} h`);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [lastSaved]);

  // Actions secondaires regroupées dans le menu dropdown
  const actionsSecondaires = (
    <>
      {showRecap && (
        <DropdownMenuItem onClick={onShowRecap}>
          <BarChart3 className="size-4 mr-2" /> Récap Annuel
        </DropdownMenuItem>
      )}
      {showArchives && (
        <DropdownMenuItem onClick={onShowArchives}>
          <Archive className="size-4 mr-2" /> Archives
        </DropdownMenuItem>
      )}
      {showJsonIO && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onExport}>
            <Download className="size-4 mr-2" /> Exporter JSON
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileRef.current?.click()}>
            <Upload className="size-4 mr-2" /> Importer JSON
          </DropdownMenuItem>
        </>
      )}
      {onDriveBackup && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void onDriveBackup()}>
            <CloudUpload className="size-4 mr-2" /> Sauvegarder Drive
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void openHistory()}>
            <FolderOpen className="size-4 mr-2" /> Historique Drive
          </DropdownMenuItem>
        </>
      )}
      {showCorbeille && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to={`/corbeille${currentSociete ? `?sid=${currentSociete.id}` : ""}`}>
              <Trash2 className="size-4 mr-2" /> Corbeille
            </Link>
          </DropdownMenuItem>
        </>
      )}
      {showUsersAdmin && (
        <DropdownMenuItem asChild>
          <Link to={`/admin/users${currentSociete ? `?sid=${currentSociete.id}` : ""}`}>
            <Users className="size-4 mr-2" /> Utilisateurs
          </Link>
        </DropdownMenuItem>
      )}
      {showAuditLog && (
        <DropdownMenuItem asChild>
          <Link to={`/admin/audit${currentSociete ? `?sid=${currentSociete.id}` : ""}`}>
            <History className="size-4 mr-2" /> Audit
          </Link>
        </DropdownMenuItem>
      )}
      {showParamSociete && (
        <DropdownMenuItem asChild>
          <Link to={`/admin/societe${currentSociete ? `?sid=${currentSociete.id}` : ""}`}>
            <Settings2 className="size-4 mr-2" /> Paramètres société
          </Link>
        </DropdownMenuItem>
      )}
    </>
  );

  return (
    <TooltipProvider>
      <header className="header-gradient text-primary-foreground shadow-lg no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 sm:h-20 gap-3">

            {/* ── ZONE GAUCHE : Logo + Identité ──────────────────────────── */}
            <div className="flex items-center gap-3 min-w-0">
              {/* Logo */}
              <div className="shrink-0">
                {logoSrc ? (
                  <div className="bg-primary-foreground/95 rounded-xl p-1.5 shadow-lg ring-1 ring-primary-foreground/30">
                    <img
                      src={logoSrc}
                      alt={nomSociete}
                      className="h-10 sm:h-12 w-auto object-contain"
                    />
                  </div>
                ) : (
                  <div className="bg-primary-foreground/15 border border-primary-foreground/30 rounded-xl h-10 sm:h-12 w-10 sm:w-12 flex items-center justify-center shadow-inner">
                    <span className="text-primary-foreground font-black text-lg sm:text-xl tracking-tighter select-none">
                      E
                    </span>
                  </div>
                )}
              </div>

              {/* Nom + sous-titre */}
              <div className="min-w-0">
                <h1 className="font-bold text-base sm:text-lg leading-tight truncate tracking-tight">
                  {nomSociete}
                </h1>
                <p className="text-[11px] text-primary-foreground/70 truncate hidden sm:block">
                  {sousTitre}
                </p>
              </div>
            </div>

            {/* ── ZONE CENTRE : Statut + Rôles (desktop uniquement) ──────── */}
            <div className="hidden lg:flex items-center gap-2 shrink-0">
              {/* Indicateur sauvegarde avec tooltip */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-primary-foreground/10 border border-primary-foreground/20 cursor-default ${saveStatus.color}`}>
                    {saveStatus.icon}
                    <span className="font-medium">{saveStatus.label}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {driveStatus === "error" && driveLastError
                    ? `Erreur Drive : ${driveLastError}`
                    : driveLastBackup
                    ? `Dernière sauvegarde Drive : ${driveLastBackup.toLocaleTimeString("fr-FR")}`
                    : lastSaved
                    ? `Dernière sauvegarde : ${lastSaved.toLocaleTimeString("fr-FR")}`
                    : "Aucune sauvegarde récente"}
                </TooltipContent>
              </Tooltip>

              {/* Rôles (2 max) */}
              {roles.slice(0, 2).map((r) => (
                <Badge
                  key={r}
                  variant="secondary"
                  className="text-[10px] bg-primary-foreground/15 text-primary-foreground border-primary-foreground/20"
                >
                  {ROLE_LABELS[r]}
                </Badge>
              ))}
            </div>

            {/* ── ZONE DROITE : Actions ───────────────────────────────────── */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Alertes */}
              {showAlertes && <AlertesBell alertes={alertes} />}

              {/* Sélecteur société */}
              <div className="hidden sm:block">
                <SocieteSwitcher />
              </div>

              {/* Langue */}
              <div className="hidden md:block">
                <LanguageSwitcher />
              </div>

              {/* PWA */}
              <InstallPWAButton />

              {/* Super Admin */}
              {isSuperAdmin && (
                <Button
                  asChild
                  variant="default"
                  size="sm"
                  className="hidden sm:flex gap-1.5 bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border border-primary-foreground/30"
                >
                  <Link to="/super-admin">
                    <Shield className="size-3.5" />
                    <span className="hidden lg:inline">Super Admin</span>
                  </Link>
                </Button>
              )}

              {/* Menu actions secondaires */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground border border-primary-foreground/20"
                  >
                    <Menu className="size-4" />
                    <span className="hidden sm:inline text-xs">Menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal truncate">
                    {user?.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {/* Société sur mobile */}
                  <div className="sm:hidden px-2 py-1.5">
                    <SocieteSwitcher />
                  </div>
                  <DropdownMenuSeparator className="sm:hidden" />
                  {actionsSecondaires}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => signOut()}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="size-4 mr-2" /> Déconnexion
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Input fichier caché */}
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = "";
          }}
        />

        {/* Modal historique Drive */}
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderOpen className="size-5" /> Historique Google Drive
              </DialogTitle>
              <DialogDescription>
                Les 10 dernières sauvegardes. Cliquez sur Restaurer pour remplacer les données actuelles.
              </DialogDescription>
            </DialogHeader>
            {historyLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="size-5 animate-spin mr-2" /> Chargement…
              </div>
            ) : historyFiles.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                Aucune sauvegarde trouvée.
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y">
                {historyFiles.map((f) => (
                  <div key={f.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{f.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(f.modifiedTime).toLocaleString("fr-FR", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                        {f.size && ` · ${(parseInt(f.size, 10) / 1024).toFixed(1)} Ko`}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={restoringId === f.id || !store}
                      onClick={() => void handleRestore(f.id)}
                    >
                      {restoringId === f.id
                        ? <Loader2 className="size-4 animate-spin" />
                        : <RefreshCw className="size-4" />}
                      <span className="ml-1.5">Restaurer</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setHistoryOpen(false)}>Fermer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>
    </TooltipProvider>
  );
};

// ── Cloche alertes ────────────────────────────────────────────────────────────
const AlertesBell = ({ alertes }: { alertes: Alerte[] }) => {
  const count = alertes.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
          aria-label={`${count} alerte${count > 1 ? "s" : ""}`}
        >
          <Bell className="size-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center ring-2 ring-background">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Alertes</span>
          <span className="text-xs text-muted-foreground font-normal">{count} active{count > 1 ? "s" : ""}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {count === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">✓ Aucune alerte</div>
        ) : (
          alertes.map((a) => {
            const Icon = a.severite === "danger" ? AlertCircle : a.severite === "warning" ? AlertTriangle : Info;
            const tone = a.severite === "danger" ? "text-destructive" : a.severite === "warning" ? "text-warning" : "text-primary";
            return (
              <DropdownMenuItem
                key={a.id}
                className="flex items-start gap-2 py-2 cursor-default focus:bg-muted"
                onSelect={(e) => e.preventDefault()}
              >
                <Icon className={`size-4 mt-0.5 shrink-0 ${tone}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{a.titre}</div>
                  <div className="text-xs text-muted-foreground whitespace-normal">{a.description}</div>
                </div>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// ── Bouton PWA ────────────────────────────────────────────────────────────────
type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const InstallPWAButton = () => {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as unknown as { Capacitor?: unknown }).Capacitor) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !deferred) return null;

  const handleInstall = async () => {
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") toast.success("Application installée");
      setDeferred(null);
    } catch { /* ignore */ }
  };

  return (
    <Button
      onClick={handleInstall}
      variant="ghost"
      size="icon"
      className="size-9 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
      title="Installer l'application"
    >
      <Smartphone className="size-4" />
    </Button>
  );
};
