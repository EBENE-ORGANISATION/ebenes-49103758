/**
 * Wrapper réexportant le client Supabase officiel de Lovable Cloud.
 *
 * NOTE : le client réel est auto-généré dans `src/integrations/supabase/client.ts`
 * (à NE PAS modifier). Ce fichier sert de point d'import demandé par le hook
 * `useEbeneStoreRemote.ts` et expose les variables d'environnement attendues.
 *
 * Variables d'environnement (gérées automatiquement par Lovable Cloud) :
 *   - VITE_SUPABASE_URL
 *   - VITE_SUPABASE_ANON_KEY  (alias historique de VITE_SUPABASE_PUBLISHABLE_KEY)
 */
import { supabase as officialClient } from "@/integrations/supabase/client";

export const SUPABASE_URL: string =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";

export const SUPABASE_ANON_KEY: string =
  ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)) ??
  "";

export const supabase = officialClient;
export default supabase;