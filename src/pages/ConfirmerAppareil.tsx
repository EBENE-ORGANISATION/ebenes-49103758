// Confirmation d'un nouvel appareil, depuis le lien reçu par e-mail.
// Le lien ouvre cette page ; seul le clic sur « Confirmer » valide l'appareil
// (un antivirus de messagerie qui ouvre le lien tout seul ne confirme rien).
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { EbeneSuiteLogo } from "@/components/brand/EbeneSuiteLogo";

type Etat = "attente" | "envoi" | "confirme" | "erreur";

const ConfirmerAppareil = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [etat, setEtat] = useState<Etat>(token ? "attente" : "erreur");
  const [message, setMessage] = useState(token ? "" : "Ce lien ne contient pas de code de confirmation.");

  const confirmer = async () => {
    setEtat("envoi");
    const { data, error } = await supabase.functions.invoke("confirm-login-device", { body: { token } });
    if (error || !data?.ok) {
      setEtat("erreur");
      setMessage(data?.error ?? "Ce lien n'est plus valable. Reconnectez-vous pour en recevoir un nouveau.");
      return;
    }
    setEtat("confirme");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md p-8 shadow-2xl border-2 text-center space-y-5">
        <EbeneSuiteLogo className="h-20 mx-auto" />
        {etat === "confirme" ? (
          <>
            <ShieldCheck className="size-10 text-success mx-auto" />
            <h1 className="text-xl font-bold">Appareil confirmé</h1>
            <p className="text-sm text-muted-foreground">Retournez sur l'appareil où vous vous connectiez et reconnectez-vous.</p>
            <Button asChild className="w-full"><Link to="/auth?device_confirmed=1">Aller à la connexion</Link></Button>
          </>
        ) : etat === "erreur" ? (
          <>
            <ShieldX className="size-10 text-destructive mx-auto" />
            <h1 className="text-xl font-bold">Confirmation impossible</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button asChild variant="outline" className="w-full"><Link to="/auth">Aller à la connexion</Link></Button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">Confirmer ce nouvel appareil ?</h1>
            <p className="text-sm text-muted-foreground">
              Quelqu'un se connecte à votre compte depuis un autre appareil. Si c'est bien vous, confirmez.
              Sinon, ne faites rien et changez votre mot de passe.
            </p>
            <Button className="w-full" onClick={() => void confirmer()} disabled={etat === "envoi"}>
              {etat === "envoi" ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Confirmer cet appareil
            </Button>
          </>
        )}
      </Card>
    </div>
  );
};

export default ConfirmerAppareil;
