## Objectif

À chaque connexion (email/password ou Google) depuis un appareil/navigateur différent d'une session actuellement active, demander une confirmation par email avant d'autoriser la session. Aucun appareil n'est mémorisé : si un autre appareil est actif, le nouveau doit être confirmé.

## Comportement utilisateur

1. Tom est connecté sur son PC (session active).
2. Tom tente de se connecter sur son téléphone.
3. Après saisie correcte du mot de passe, l'app affiche : "Un email de confirmation a été envoyé à tom@…". Pas d'accès à l'app.
4. Tom ouvre l'email sur son téléphone, clique sur "Confirmer cette connexion".
5. Le téléphone est connecté. Le PC reste connecté (les deux sessions coexistent).
6. Si Tom se reconnecte plus tard sur le téléphone alors que le PC est toujours actif → nouvelle confirmation requise (rien n'est mémorisé).
7. Si aucun autre appareil n'est actif → connexion directe sans email.

## Architecture technique

### Base de données

Nouvelle table `device_sessions` :
- `user_id`, `device_id` (uuid généré côté client, stocké en localStorage)
- `status` : `pending` | `active` | `expired`
- `confirmation_token` (random, 64 chars), `token_expires_at` (15 min)
- `user_agent`, `ip`, `last_seen_at`
- RLS : seul l'utilisateur voit ses propres sessions ; insert/update via edge function (service role)

### Edge functions

- `check-login-device` : appelée après login réussi côté client.
  - Compte les sessions `active` du user avec `last_seen_at > now() - 5 min` et `device_id` différent.
  - Si 0 → marque la session courante `active`, retourne `{allowed: true}`.
  - Si ≥1 → crée une entrée `pending` avec token, envoie email via `send-transactional-email`, retourne `{allowed: false, message: "..."}`.
  - Si non autorisé → le client appelle `supabase.auth.signOut()` et affiche l'écran d'attente.

- `confirm-login-device` : GET /functions/v1/confirm-login-device?token=xxx
  - Valide le token (non expiré, non utilisé), passe la ligne à `active`.
  - Redirige vers `/?device_confirmed=1`. Le client reconnaît le flag et affiche un toast "Confirmé — vous pouvez vous reconnecter".

### Frontend

- `src/lib/deviceId.ts` : génère/lit un UUID stable en `localStorage` ("ebene_device_id").
- `src/hooks/useAuth.tsx` : après `signIn` réussi, appel `check-login-device` avec `device_id`. Si refusé → `signOut` + redirect vers `/auth?awaiting_confirmation=1`.
- `src/pages/Auth.tsx` : si `?awaiting_confirmation=1`, affiche une carte "Email envoyé, cliquez sur le lien pour finaliser la connexion".
- Heartbeat léger : toutes les 2 min en app, ping un endpoint qui met à jour `last_seen_at` (ou simplement update direct via supabase client RLS-safe). Permet de "déclasser" les sessions inactives.

### Email

Utilise `send-transactional-email` (Lovable Emails) avec un template simple : "Quelqu'un essaye de se connecter à votre compte depuis [user_agent / IP]. Si c'est vous, cliquez ici pour confirmer." Bouton → URL de la fonction `confirm-login-device`.

Si le domaine email n'est pas encore configuré → on devra le faire en premier (dialog Lovable Emails).

## Limites / points d'attention

- Google OAuth : le check se fait dans `useAuth.onAuthStateChange` (événement `SIGNED_IN`), pas dans le formulaire.
- Si l'utilisateur ferme le navigateur sans se déconnecter, la session reste `active` jusqu'à expiration du `last_seen_at` (5 min). C'est volontaire pour ne pas casser les rechargements.
- L'email DOIT être configuré (Lovable Emails ou Resend déjà présent). Resend est dispo dans les secrets — on peut l'utiliser directement si pas de domaine Lovable.

## Étapes d'implémentation

1. Migration : table `device_sessions` + RLS + grants.
2. Edge function `check-login-device` (utilise Resend déjà configuré).
3. Edge function `confirm-login-device`.
4. `src/lib/deviceId.ts`.
5. Mise à jour `useAuth.tsx` (hook après login, heartbeat).
6. Mise à jour `Auth.tsx` (écran d'attente, gestion `device_confirmed`).
7. Test end-to-end.

Confirmez-vous ce plan ? Une fois validé je l'implémente.