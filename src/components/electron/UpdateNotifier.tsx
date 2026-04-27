/**
 * UpdateNotifier — bannière discrète pour les mises à jour Electron.
 *
 * Ne s'affiche QUE dans le shell Electron (window.electronAPI présent).
 * Jamais en web ni en Android. Ne bloque jamais l'UI.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, RefreshCw, AlertCircle, X } from "lucide-react";

type Phase = "idle" | "available" | "downloading" | "ready" | "error";

const DISMISS_KEY = "ebene.updateNotifier.dismissedThisSession";

export function UpdateNotifier() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [version, setVersion] = useState<string | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState<string | undefined>(undefined);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!api) return;

    const offAvail = api.onUpdateAvailable((p) => {
      setVersion(p?.version);
      setPhase((prev) => (prev === "ready" ? prev : "downloading"));
    });
    const offProg = api.onDownloadProgress((p) => {
      if (typeof p?.percent === "number") setPercent(Math.round(p.percent));
      setPhase((prev) => (prev === "ready" ? prev : "downloading"));
    });
    const offDone = api.onUpdateDownloaded((p) => {
      setVersion(p?.version);
      setPercent(100);
      setPhase("ready");
    });
    const offErr = api.onUpdateError((p) => {
      setErrorMsg(p?.message);
      setPhase("error");
    });

    return () => {
      offAvail?.();
      offProg?.();
      offDone?.();
      offErr?.();
    };
  }, []);

  // Pas dans Electron → on ne rend rien.
  if (typeof window === "undefined" || !window.electronAPI) return null;
  if (phase === "idle") return null;
  if (dismissed && phase !== "ready") return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  };

  const handleInstall = () => {
    window.electronAPI?.installUpdate();
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border bg-card text-card-foreground shadow-lg">
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5">
          {phase === "ready" ? (
            <RefreshCw className="h-5 w-5 text-primary" />
          ) : phase === "error" ? (
            <AlertCircle className="h-5 w-5 text-destructive" />
          ) : (
            <Download className="h-5 w-5 text-primary" />
          )}
        </div>
        <div className="flex-1 space-y-2">
          {phase === "downloading" || phase === "available" ? (
            <>
              <p className="text-sm font-medium">
                Une mise à jour est disponible — Téléchargement en cours…
              </p>
              <Progress value={percent} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {percent}%{version ? ` — v${version}` : ""}
              </p>
            </>
          ) : phase === "ready" ? (
            <>
              <p className="text-sm font-medium">
                Mise à jour prête{version ? ` (v${version})` : ""} — Redémarrer maintenant ?
              </p>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleInstall}>
                  Redémarrer
                </Button>
                <Button size="sm" variant="outline" onClick={handleDismiss}>
                  Plus tard
                </Button>
              </div>
            </>
          ) : phase === "error" ? (
            <>
              <p className="text-sm font-medium">Erreur de mise à jour</p>
              <p className="text-xs text-muted-foreground break-words">
                {errorMsg || "Une erreur est survenue."}
              </p>
            </>
          ) : null}
        </div>
        {phase !== "ready" && (
          <button
            type="button"
            aria-label="Fermer"
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default UpdateNotifier;