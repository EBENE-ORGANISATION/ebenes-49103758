import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export const SupabaseStatus = () => {
  const [status, setStatus] = useState("checking");
  const [lastSync, setLastSync] = useState(null);

  const check = async () => {
    try {
      const { error } = await supabase.from("societes").select("id").limit(1);
      if (error) throw error;
      setStatus("online");
      setLastSync(new Date());
    } catch (e) {
      setStatus("offline");
    }
  };

  useEffect(() => {
    check();
    const i = setInterval(check, 60000);
    return () => clearInterval(i);
  }, []);

  const ago = () => {
    if (!lastSync) return "";
    const d = Math.floor((Date.now() - lastSync.getTime()) / 60000);
    if (d === 0) return "a l instant";
    return "il y a " + d + " min";
  };

  if (status === "checking") return (
    <span className="flex items-center justify-center gap-1">
      <RefreshCw className="h-3 w-3 animate-spin" /> Verification...
    </span>
  );
  if (status === "offline") return (
    <span className="flex items-center justify-center gap-1 text-red-500">
      <WifiOff className="h-3 w-3" /> Hors ligne
    </span>
  );
  return (
    <span className="flex items-center justify-center gap-1 text-green-600">
      <Wifi className="h-3 w-3" /> Synchronise {ago()}
    </span>
  );
};