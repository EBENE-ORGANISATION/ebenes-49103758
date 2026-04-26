import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, LogIn, ShieldPlus, Mail } from "lucide-react";
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
  const [googleBusy, setGoogleBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

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

  const onGoogleSignIn = async () => {
    setGoogleBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
      // redirection automatique
    } catch (err) {
      toast.error("Connexion Google impossible : " + (err as Error).message);
      setGoogleBusy(false);
    }
  };

  const onResetPassword = async () => {
    if (!email.trim()) {
      toast.error("Saisissez d'abord votre email pour réinitialiser le mot de passe.");
      return;
    }
    setResetBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast.success("Email de réinitialisation envoyé. Vérifiez votre boîte.");
    } catch (err) {
      toast.error("Envoi impossible : " + (err as Error).message);
    } finally {
      setResetBusy(false);
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

        {/* SECTION A — Google */}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onGoogleSignIn}
          disabled={googleBusy}
        >
          {googleBusy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
              />
            </svg>
          )}
          Se connecter avec Google
        </Button>

        {/* Séparateur */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Ou par email</span>
          </div>
        </div>

        {/* SECTION B — Email / mot de passe */}
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
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Mot de passe</Label>
              <button
                type="button"
                onClick={onResetPassword}
                disabled={resetBusy}
                className="text-xs text-primary hover:underline disabled:opacity-50"
              >
                {resetBusy ? "Envoi..." : "Mot de passe oublié ?"}
              </button>
            </div>
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