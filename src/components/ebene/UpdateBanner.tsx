import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";

interface UpdateSignal {
  version: string;
  message: string;
  delai_secondes: number;
  ts: number;
  by: string;
}

export const UpdateBanner = () => {
  const [signal, setSignal] = useState<UpdateSignal | null>(null);
  const [countdown, setCountdown] = useState(30);
  const [dismissed, setDismissed] = useState(false);
  // Stocker le timestamp du dernier signal ignoré pour ne pas re-notifier
  const [lastSeenTs, setLastSeenTs] = useState<number>(() => {
    try { return Number(localStorage.getItem("ebene:last_update_seen") ?? "0"); } catch { return 0; }
  });

  useEffect(() => {
    // Vérifier s'il y a un signal actif au chargement
    supabase
      .from("app_state")
      .select("value")
      .eq("key", "global:update_signal")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          const s = data.value as UpdateSignal;
          // Ignorer les signaux déjà vus (plus vieux de 10 minutes)
          if (s.ts > lastSeenTs && Date.now() - s.ts < 10 * 60 * 1000) {
            setSignal(s);
            setCountdown(s.delai_secondes);
          }
        }
      });

    // Écouter les nouveaux signaux en temps réel
    const channel = supabase
      .channel("update_signal_listener")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_state",
          filter: "key=eq.global:update_signal",
        },
        (payload) => {
          const row = payload.new as { value?: UpdateSignal };
          if (row?.value && row.value.ts > lastSeenTs) {
            setSignal(row.value);
            setCountdown(row.value.delai_secondes);
            setDismissed(false);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [lastSeenTs]);

  // Countdown et rechargement automatique
  useEffect(() => {
    if (!signal || dismissed) return;
    if (countdown <= 0) {
      window.location.reload();
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [signal, dismissed, countdown]);

  if (!signal || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem("ebene:last_update_seen", String(signal.ts)); } catch { /* ignore */ }
    setLastSeenTs(signal.ts);
  };

  const reloadNow = () => window.location.reload();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-primary text-primary-foreground shadow-lg no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <RefreshCw className="size-5 shrink-0 animate-spin" />
          <div className="min-w-0">
            <p className="font-semibold text-sm">
              🔄 {signal.message}
            </p>
            <p className="text-xs text-primary-foreground/80">
              Rechargement automatique dans <strong>{countdown}s</strong> — v{signal.version}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            onClick={reloadNow}
            className="gap-1.5"
          >
            <RefreshCw className="size-4" /> Recharger maintenant
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={dismiss}
            className="size-8 text-primary-foreground hover:bg-primary-foreground/10"
            title="Ignorer"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      {/* Barre de progression */}
      <div
        className="h-1 bg-primary-foreground/30 transition-all duration-1000"
        style={{ width: `${(countdown / signal.delai_secondes) * 100}%` }}
      />
    </div>
  );
};
