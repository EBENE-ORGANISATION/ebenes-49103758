/**
 * Connexion Google (OAuth Supabase, flux PKCE).
 *  - Web et Windows : redirection classique, retour sur l'application.
 *  - Android (APK) : Google refuse l'OAuth dans une WebView intégrée. La page
 *    Google s'ouvre donc dans le navigateur du téléphone (Custom Tabs) et
 *    revient dans l'application par le lien com.ebeneservices.app://auth-callback,
 *    où le code est échangé contre une session.
 */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Lien de retour de l'APK (à autoriser dans Supabase : Authentication → URL Configuration). */
export const RETOUR_OAUTH_NATIF = "com.ebeneservices.app://auth-callback";

export const connexionGoogle = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) throw error;
    return;
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: RETOUR_OAUTH_NATIF, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error("Adresse de connexion Google manquante");
  await Browser.open({ url: data.url });
};

/** Retour de Google dans l'APK : échange du code contre une session (une seule écoute). */
export const ecouterRetourOAuth = (): void => {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith(RETOUR_OAUTH_NATIF)) return;
    await Browser.close().catch(() => undefined);
    const params = new URL(url).searchParams;
    const code = params.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) toast.error(`Connexion Google impossible : ${error.message}`);
      return;
    }
    const erreur = params.get("error_description") ?? params.get("error");
    if (erreur) toast.error(`Connexion Google impossible : ${erreur}`);
  });
};
