import { Button } from "@/components/ui/button";
import {
  Download,
  Upload,
  Archive,
  BarChart3,
  Check,
  LogOut,
  Users,
  History,
  Shield,
  Cloud,
  CloudUpload,
  CloudOff,
  Loader2,
  RefreshCw,
  FolderOpen,
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  Smartphone,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import logoEbene from "@/assets/ebene-logo.png";
import { useAuth, ROLE_LABELS } from "@/hooks/useAuth";
import { useSociete, useSocieteActive } from "@/hooks/useSocieteContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { listDriveBackups, restoreFromDrive, type DriveFileInfo, type EbeneStoreLike } from "@/lib/googleDrive";
import { toast } from "sonner";
import type { Alerte } from "@/lib/alertes";

interface HeaderProps {
  onExport: () => void;
  onImport: (file: File) => void;
  onShowRecap: () => void;
  onShowArchives: () => void;
  lastSaved?: Date;
  /** Statut de la sauvegarde Google Drive (optionnel, fourni par useEbeneStoreRemote). */
  driveStatus?: "idle" | "syncing" | "success" | "error";
  driveLastBackup?: Date | null;
  driveLastError?: string | null;
  /** Déclenche un backup Drive immédiat. */
  onDriveBackup?: () => Promise<void> | void;
  /** Store complet pour la restauration (importerDonnees est appelé par restoreFromDrive). */
  store?: EbeneStoreLike;
  /** Liste des alertes actives à afficher dans la cloche. */
  alertes?: Alerte[];
}

export const Header = ({
  onExport,
  onImport,
  onShowRecap,
  onShowArchives,
  lastSaved,
  driveStatus = "idle",
  driveLastBackup = null,
  driveLastError = null,
  onDriveBackup,
  store,
  alertes = [],
}: HeaderProps) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [savedAgo, setSavedAgo] = useState("à l'instant");
  const { user, roles, isAdmin, signOut } = useAuth();
  const {
    societes,
    societeId,
    setSocieteId,
    consolide,
  } = useSociete();
  const societeActive = useSocieteActive();
  const headerLogo = societeActive?.logoUrl || logoEbene;
  const headerNom = societeActive?.nom || "EBENE SERVICES";
  const headerSlogan = societeActive?.slogan || "Commerce Général — Système de Gestion";
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFiles, setHistoryFiles] = useState<DriveFileInfo[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Indicateur Drive : libellé + couleur
  const driveBadge = (() => {
    if (driveStatus === "syncing") {
      return {
        icon: <Loader2 className="size-3 animate-spin" />,
        label: "Sauvegarde Drive en cours…",
        cls: "bg-primary-foreground/15 text-primary-foreground",
      };
    }
    if (driveStatus === "error") {
      return {
        icon: <CloudOff className="size-3" />,
        label: `Drive : échec${driveLastError ? ` (${driveLastError.slice(0, 40)})` : ""}`,
        cls: "bg-destructive/30 text-destructive-foreground",
      };
    }
    if (driveStatus === "success" && driveLastBackup) {
      const t = driveLastBackup.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      return {
        icon: <Cloud className="size-3" />,
        label: `Drive ✓ ${t}`,
        cls: "bg-success/20 text-success-foreground",
      };
    }
    return null;
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
    if (!store) {
      toast.error("Restauration impossible : store indisponible");
      return;
    }
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

  return (
    <header className="header-gradient text-primary-foreground shadow-lg no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-primary-foreground/95 rounded-2xl p-3 shadow-xl ring-2 ring-primary-foreground/40">
              <img src={headerLogo} alt={headerNom} className="h-20 sm:h-24 w-auto object-contain" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{headerNom}</h1>
              <p className="text-sm text-primary-foreground/80 font-medium">{headerSlogan}</p>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                <span className="badge-soft bg-success/20 text-success-foreground inline-flex items-center gap-1">
                  <Check className="size-3" /> Sauvegardé {savedAgo}
                </span>
                {driveBadge && (
                  <span className={`badge-soft inline-flex items-center gap-1 ${driveBadge.cls}`}>
                    {driveBadge.icon} {driveBadge.label}
                    {driveStatus === "error" && onDriveBackup && (
                      <button
                        type="button"
                        onClick={() => void onDriveBackup()}
                        className="ml-1 underline hover:opacity-80"
                        title="Réessayer"
                      >
                        Réessayer
                      </button>
                    )}
                  </span>
                )}
                {user && (
                  <span className="badge-soft bg-primary-foreground/15 text-primary-foreground inline-flex items-center gap-1">
                    <Shield className="size-3" /> {user.email}
                  </span>
                )}
                {roles.map((r) => (
                  <Badge key={r} variant="secondary" className="text-[10px]">{ROLE_LABELS[r]}</Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {societes.length > 0 && (
              <div className="flex items-center gap-1.5 bg-primary-foreground/10 rounded-md px-2 py-1">
                <Building2 className="size-4 text-primary-foreground" />
                <Select
                  value={consolide ? "__consolide__" : (societeId ?? "")}
                  onValueChange={(v) => {
                    if (v === "__consolide__") return; // toggle Dashboard gère le consolidé
                    setSocieteId(v);
                  }}
                  disabled={consolide}
                >
                  <SelectTrigger className="h-8 min-w-[180px] bg-transparent border-primary-foreground/30 text-primary-foreground text-xs">
                    <SelectValue placeholder="Sélectionner une société" />
                  </SelectTrigger>
                  <SelectContent>
                    {consolide && (
                      <SelectItem value="__consolide__" disabled>
                        Vue consolidée (toutes)
                      </SelectItem>
                    )}
                    {societes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <AlertesBell alertes={alertes} />
            <InstallPWAButton />
            <Button onClick={onShowRecap} variant="secondary" size="sm" className="gap-1.5">
              <BarChart3 className="size-4" /> Récap Annuel
            </Button>
            <Button onClick={onShowArchives} variant="secondary" size="sm" className="gap-1.5">
              <Archive className="size-4" /> Archives
            </Button>
            <Button onClick={onExport} variant="secondary" size="sm" className="gap-1.5">
              <Download className="size-4" /> Exporter JSON
            </Button>
            <Button onClick={() => fileRef.current?.click()} variant="secondary" size="sm" className="gap-1.5">
              <Upload className="size-4" /> Importer JSON
            </Button>
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
            {onDriveBackup && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" className="gap-1.5">
                    <Cloud className="size-4" /> Google Drive
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Sauvegarde cloud</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => void onDriveBackup()}
                    disabled={driveStatus === "syncing"}
                  >
                    <CloudUpload className="size-4 mr-2" />
                    ☁️ Sauvegarder sur Drive
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void openHistory()}>
                    <FolderOpen className="size-4 mr-2" />
                    📂 Historique des sauvegardes
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void openHistory()}>
                    <RefreshCw className="size-4 mr-2" />
                    🔄 Restaurer depuis Drive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {isAdmin && (
              <>
                <Button asChild variant="secondary" size="sm" className="gap-1.5">
                  <Link to="/admin/users"><Users className="size-4" /> Utilisateurs</Link>
                </Button>
                <Button asChild variant="secondary" size="sm" className="gap-1.5">
                  <Link to="/admin/audit"><History className="size-4" /> Audit</Link>
                </Button>
              </>
            )}
            {user && (
              <Button onClick={() => signOut()} variant="secondary" size="sm" className="gap-1.5">
                <LogOut className="size-4" /> Déconnexion
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Modal historique des sauvegardes Drive */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="size-5" /> Historique des sauvegardes Google Drive
            </DialogTitle>
            <DialogDescription>
              Les 10 dernières sauvegardes du dossier <code>EBENE_BACKUPS</code>. Cliquez
              sur « Restaurer » pour remplacer les données actuelles par celles de la
              sauvegarde sélectionnée.
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
                      Modifié le{" "}
                      {new Date(f.modifiedTime).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {f.size && ` · ${(parseInt(f.size, 10) / 1024).toFixed(1)} Ko`}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    disabled={restoringId === f.id || !store}
                    onClick={() => void handleRestore(f.id)}
                  >
                    {restoringId === f.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    <span className="ml-1.5">Restaurer</span>
                  </Button>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
};

// ─── Cloche d'alertes ────────────────────────────────────────────────────
const AlertesBell = ({ alertes }: { alertes: Alerte[] }) => {
  const count = alertes.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="relative gap-1.5"
          aria-label={`${count} alerte${count > 1 ? "s" : ""}`}
        >
          <Bell className="size-4" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Alertes</span>
          <span className="text-xs text-muted-foreground font-normal">
            {count} active{count > 1 ? "s" : ""}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {count === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            ✓ Aucune alerte
          </div>
        ) : (
          alertes.map((a) => {
            const Icon =
              a.severite === "danger"
                ? AlertCircle
                : a.severite === "warning"
                ? AlertTriangle
                : Info;
            const tone =
              a.severite === "danger"
                ? "text-destructive"
                : a.severite === "warning"
                ? "text-warning"
                : "text-primary";
            return (
              <DropdownMenuItem
                key={a.id}
                className="flex items-start gap-2 py-2 cursor-default focus:bg-muted"
                onSelect={(e) => e.preventDefault()}
              >
                <Icon className={`size-4 mt-0.5 shrink-0 ${tone}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{a.titre}</div>
                  <div className="text-xs text-muted-foreground whitespace-normal">
                    {a.description}
                  </div>
                </div>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
// ─── Bouton "Installer l'app" (PWA) ──────────────────────────────────────
// Visible uniquement si :
//  - l'app n'est PAS dans Capacitor (window.Capacitor absent)
//  - le navigateur a déclenché beforeinstallprompt (Chrome/Edge/Android)
type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const InstallPWAButton = () => {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Si on tourne dans Capacitor, on ne montre jamais ce bouton
    if (typeof window !== "undefined" && (window as unknown as { Capacitor?: unknown }).Capacitor) {
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

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
      if (outcome === "accepted") {
        toast.success("Application installée");
      }
      setDeferred(null);
    } catch {
      // ignore
    }
  };

  return (
    <Button onClick={handleInstall} variant="secondary" size="sm" className="gap-1.5">
      <Smartphone className="size-4" /> Installer l'app
    </Button>
  );
};
