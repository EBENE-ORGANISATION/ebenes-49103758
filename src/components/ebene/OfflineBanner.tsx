import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WifiOff, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * OfflineBanner — Affiche une bannière discrète en bas de page
 * quand la connexion à Supabase est indisponible.
 * Se masque automatiquement quand la connexion revient.
 */
export const OfflineBanner = () => {
  const [offline, setOffline]           = useState(false);
  const [dismissed, setDismissed]       = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    // Vérification initiale
    const checkConnection = async () => {
      try {
        const { error } = await supabase.from("societes").select("id").limit(1);
        setOffline(!!error);
      } catch {
        setOffline(true);
      }
    };

    void checkConnection();

    // Écoute les événements navigateur
    const onOffline = () => {
      setOffline(true);
      setDismissed(false);
    };

    const onOnline = async () => {
      setReconnecting(true);
      try {
        const { error } = await supabase.from("societes").select("id").limit(1);
        setOffline(!!error);
      } catch {
        setOffline(true);
      } finally {
        setReconnecting(false);
      }
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", () => void onOnline());

    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", () => void onOnline());
    };
  }, []);

  // Se remet à zéro si on revient en ligne
  useEffect(() => {
    if (!offline) setDismissed(false);
  }, [offline]);

  if (!offline || dismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 no-print">
      <div className="max-w-7xl mx-auto px-4 pb-4">
        <div className="flex items-center justify-between gap-3 bg-destructive text-destructive-foreground px-4 py-3 rounded-xl shadow-lg border border-destructive/80">
          <div className="flex items-center gap-3">
            {reconnecting
              ? <Wifi className="size-5 shrink-0 animate-pulse" />
              : <WifiOff className="size-5 shrink-0" />}
            <div>
              <p className="font-semibold text-sm">
                {reconnecting ? "Reconnexion en cours…" : "Connexion au serveur indisponible"}
              </p>
              <p className="text-xs opacity-80">
                {reconnecting
                  ? "Vérification de la connexion à Supabase…"
                  : "Les modifications sont enregistrées localement et seront synchronisées à la reconnexion."}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive-foreground hover:bg-destructive-foreground/10 shrink-0"
            onClick={() => setDismissed(true)}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
