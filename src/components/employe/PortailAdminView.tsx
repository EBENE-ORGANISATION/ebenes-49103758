import { useState, useEffect } from "react";
import { useEbeneStoreRemote as useEbeneStore } from "@/hooks/useEbeneStoreRemote";
import { usePortailEmploye } from "@/hooks/usePortailEmploye";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { MessageSquare, UserCheck, UserX, Send, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { Employe } from "@/types/ebene";

export const PortailAdminView = () => {
  const { currentSociete } = useTenant();
  const sid = currentSociete?.id ?? null;
  const store = useEbeneStore(sid);
  const { envoyerMessageAdmin, loadMessagesAdmin, messages, inviterEmploye } =
    usePortailEmploye(sid);

  const [selectedEmploye, setSelectedEmploye] = useState<Employe | null>(null);
  const [msgTexte, setMsgTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [inviting, setInviting] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (selectedEmploye?.userId) {
      void loadMessagesAdmin(selectedEmploye.userId);
    }
  }, [selectedEmploye, loadMessagesAdmin]);

  const employes = store.employes.filter(
    (e) => !e.statutValidation || e.statutValidation === "valide"
  );

  const filtered = employes.filter((e) =>
    [e.nom, e.poste, e.matricule].some((v) =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const avecPortail = filtered.filter((e) => !!e.userId);
  const sansPortail = filtered.filter((e) => !e.userId && !!e.email);

  const handleInviter = async (e: Employe) => {
    if (!e.email || !sid) return;
    setInviting(e.id);
    const res = await inviterEmploye(e.email, e.nom, sid);
    if (res?.ok) {
      if (res.already_existed) {
        toast.info(`${e.nom} : compte existant — lié à la fiche.`);
      } else {
        toast.success(`Invitation envoyée à ${e.email}`);
        if (res.temp_password) {
          toast.info(`Mot de passe temporaire : ${res.temp_password}`, {
            duration: 12000,
          });
        }
      }
      store.updateEmploye(e.id, { userId: res.user_id });
    } else {
      toast.error(res?.error ?? "Erreur d'invitation");
    }
    setInviting(null);
  };

  const handleEnvoyer = async () => {
    if (!selectedEmploye?.userId || !msgTexte.trim() || envoi) return;
    setEnvoi(true);
    const ok = await envoyerMessageAdmin(selectedEmploye.userId, msgTexte.trim());
    if (ok) {
      setMsgTexte("");
      void loadMessagesAdmin(selectedEmploye.userId);
    } else {
      toast.error("Erreur lors de l'envoi");
    }
    setEnvoi(false);
  };

  return (
    <div className="space-y-5">
      {/* Barre de recherche */}
      <div className="flex gap-2">
        <Input
          placeholder="Rechercher un employé…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Badge variant="outline" className="self-center">
          {avecPortail.length} portail actif{avecPortail.length > 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Colonne gauche : liste employés ── */}
        <div className="space-y-3">
          {/* Employés avec portail */}
          {avecPortail.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserCheck className="size-4 text-success" /> Portail actif
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 p-3 pt-0">
                {avecPortail.map((e) => (
                  <button
                    key={e.id}
                    onClick={() =>
                      setSelectedEmploye(selectedEmploye?.id === e.id ? null : e)
                    }
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      selectedEmploye?.id === e.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span className="font-medium">{e.nom}</span>
                    <span className="text-xs ml-2 opacity-70">{e.poste}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Employés sans portail */}
          {sansPortail.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserX className="size-4 text-muted-foreground" /> Sans portail (email disponible)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 p-3 pt-0">
                {sansPortail.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted"
                  >
                    <div>
                      <span className="text-sm font-medium">{e.nom}</span>
                      <span className="text-xs text-muted-foreground ml-2">{e.email}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-7 text-xs"
                      disabled={inviting === e.id}
                      onClick={() => handleInviter(e)}
                    >
                      {inviting === e.id ? (
                        <RefreshCw className="size-3 animate-spin" />
                      ) : (
                        <Mail className="size-3" />
                      )}
                      Inviter
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {avecPortail.length === 0 && sansPortail.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {search
                  ? "Aucun résultat pour cette recherche."
                  : "Aucun employé avec un email enregistré."}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Colonne droite : messagerie ── */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="size-4" />
              {selectedEmploye
                ? `Messagerie — ${selectedEmploye.nom}`
                : "Sélectionnez un employé"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 flex-1">
            {!selectedEmploye ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Cliquez sur un employé (portail actif) pour consulter et envoyer des messages.
              </p>
            ) : (
              <>
                {/* Thread */}
                <div className="rounded border bg-muted/40 p-3 space-y-2 max-h-64 overflow-y-auto flex-1">
                  {messages.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Aucun message.
                    </p>
                  ) : (
                    messages.map((msg) => {
                      const isAdmin = msg.auteur === "admin";
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                              isAdmin
                                ? "bg-primary text-primary-foreground"
                                : "bg-card border text-foreground"
                            }`}
                          >
                            <p>{msg.contenu}</p>
                            <p
                              className={`text-[10px] mt-1 ${
                                isAdmin
                                  ? "text-primary-foreground/70"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {isAdmin ? "Vous" : selectedEmploye.nom} ·{" "}
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
                        void handleEnvoyer();
                      }
                    }}
                    className="resize-none"
                  />
                  <Button
                    size="sm"
                    disabled={!msgTexte.trim() || envoi}
                    onClick={handleEnvoyer}
                    className="gap-1.5 self-end"
                  >
                    <Send className="size-4" />
                    {envoi ? "…" : "Envoyer"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PortailAdminView;
