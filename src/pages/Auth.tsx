import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, LogIn, ShieldPlus } from "lucide-react";
import logoEbene from "@/assets/ebene-logo.png";
import { supabase } from "@/integrations/supabase/client";

const Auth = () => {
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [bEmail, setBEmail] = useState("");
  const [bNom, setBNom] = useState("");
  const [bPwd, setBPwd] = useState("");
  const [bBusy, setBBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate("/", { replace: true });
  }, [user, authLoading, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) {
      toast.error("Connexion impossible : " + error);
    } else {
      toast.success("Bienvenue !");
      navigate("/", { replace: true });
    }
  };

  const onBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setBBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("bootstrap-admin", {
        body: { email: bEmail.trim(), password: bPwd, nom: bNom.trim() },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success("Compte admin créé. Vous pouvez maintenant vous connecter.");
      setShowBootstrap(false);
      setEmail(bEmail);
      setBPwd("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md p-8 shadow-2xl border-2">
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="bg-card rounded-2xl p-4 ring-2 ring-primary/20 shadow-lg">
            <img src={logoEbene} alt="EBENE SERVICES" className="h-24 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-center">EBENE SERVICES</h1>
          <p className="text-sm text-muted-foreground text-center">
            Connectez-vous pour accéder à votre espace
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@ebene-services.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Connexion...
              </>
            ) : (
              <>
                <LogIn className="size-4" /> Se connecter
              </>
            )}
          </Button>
        </form>

        <p className="text-xs text-center text-muted-foreground mt-6">
          Les comptes sont créés par l'administrateur. Contactez-le pour obtenir un accès.
        </p>

        <div className="mt-4 pt-4 border-t">
          {!showBootstrap ? (
            <button
              type="button"
              onClick={() => setShowBootstrap(true)}
              className="text-xs text-muted-foreground hover:text-primary mx-auto block"
            >
              Première installation ? Créer le compte administrateur initial
            </button>
          ) : (
            <form onSubmit={onBootstrap} className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <ShieldPlus className="size-4" /> Création du premier administrateur
              </div>
              <p className="text-xs text-muted-foreground">
                Cette option n'est disponible qu'une seule fois, tant qu'aucun admin n'existe.
              </p>
              <Input placeholder="Nom complet" value={bNom} onChange={(e) => setBNom(e.target.value)} />
              <Input type="email" placeholder="Email" required value={bEmail} onChange={(e) => setBEmail(e.target.value)} />
              <Input type="text" placeholder="Mot de passe (≥ 8 car.)" required value={bPwd} onChange={(e) => setBPwd(e.target.value)} />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowBootstrap(false)} className="flex-1">
                  Annuler
                </Button>
                <Button type="submit" size="sm" disabled={bBusy} className="flex-1">
                  {bBusy ? <Loader2 className="size-4 animate-spin" /> : "Créer l'admin"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Auth;