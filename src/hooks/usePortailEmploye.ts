import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export interface PortailMessage {
  id: string;
  societe_id: string;
  employe_user_id: string;
  contenu: string;
  auteur: "admin" | "employe";
  lu: boolean;
  created_at: string;
}

interface InviteResult {
  ok: boolean;
  user_id: string;
  temp_password?: string;
  already_existed?: boolean;
  error?: string;
}

export const usePortailEmploye = (societeId: string | null = null) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<PortailMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [nonLus, setNonLus] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ─── Chargement des messages ───────────────────────────────────────────
  const loadMessages = useCallback(async (targetUserId?: string) => {
    if (!societeId) return;
    const uid = targetUserId ?? user?.id;
    if (!uid) return;
    setLoadingMessages(true);
    try {
      const { data } = await supabase
        .from("portail_messages")
        .select("*")
        .eq("societe_id", societeId)
        .eq("employe_user_id", uid)
        .order("created_at", { ascending: true });
      const msgs = (data ?? []) as PortailMessage[];
      setMessages(msgs);
      setNonLus(msgs.filter((m) => !m.lu && m.auteur === "admin").length);
    } finally {
      setLoadingMessages(false);
    }
  }, [societeId, user?.id]);

  // ─── Marquer les messages admin comme lus ─────────────────────────────
  const marquerLus = useCallback(async () => {
    if (!user || !societeId) return;
    await supabase
      .from("portail_messages")
      .update({ lu: true })
      .eq("societe_id", societeId)
      .eq("employe_user_id", user.id)
      .eq("auteur", "admin")
      .eq("lu", false);
    setNonLus(0);
  }, [user, societeId]);

  // ─── Envoyer un message (côté employé) ────────────────────────────────
  const envoyerMessage = useCallback(async (contenu: string): Promise<boolean> => {
    if (!user || !societeId || !contenu.trim()) return false;
    const { error } = await supabase.from("portail_messages").insert({
      employe_user_id: user.id,
      societe_id: societeId,
      contenu: contenu.trim(),
      auteur: "employe",
      lu: false,
    });
    if (!error) await loadMessages();
    return !error;
  }, [user, societeId, loadMessages]);

  // ─── Envoyer un message (côté admin) ──────────────────────────────────
  const envoyerMessageAdmin = useCallback(
    async (employeUserId: string, contenu: string): Promise<boolean> => {
      if (!societeId || !contenu.trim()) return false;
      const { error } = await supabase.from("portail_messages").insert({
        employe_user_id: employeUserId,
        societe_id: societeId,
        contenu: contenu.trim(),
        auteur: "admin",
        lu: false,
      });
      return !error;
    },
    [societeId]
  );

  // ─── Charger les messages d'un employé (côté admin) ───────────────────
  const loadMessagesAdmin = useCallback(
    async (employeUserId: string) => loadMessages(employeUserId),
    [loadMessages]
  );

  // ─── Inviter un employé à créer son compte portail ────────────────────
  const inviterEmploye = useCallback(
    async (
      email: string,
      nom: string,
      sid: string
    ): Promise<InviteResult | null> => {
      try {
        const { data, error } = await supabase.functions.invoke("admin-users", {
          body: {
            action: "create_employe_account",
            email,
            employe_nom: nom,
            societe_id: sid,
          },
        });
        if (error) return { ok: false, user_id: "", error: error.message };
        return data as InviteResult;
      } catch (e) {
        return { ok: false, user_id: "", error: String(e) };
      }
    },
    []
  );

  // ─── Realtime : nouveaux messages ─────────────────────────────────────
  useEffect(() => {
    if (!user || !societeId) return;
    void loadMessages();

    channelRef.current = supabase
      .channel(`portail_msgs_${societeId}_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "portail_messages",
          filter: `employe_user_id=eq.${user.id}`,
        },
        () => void loadMessages()
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user, societeId, loadMessages]);

  return {
    messages,
    loadingMessages,
    nonLus,
    envoyerMessage,
    envoyerMessageAdmin,
    loadMessagesAdmin,
    marquerLus,
    inviterEmploye,
  };
};

export default usePortailEmploye;
