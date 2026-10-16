# Journal des anomalies — recette 2026-10

Gravité : 🔴 bloquant / faux calcul / faille · 🟠 fonction cassée · 🟡 gênant · ⚪ cosmétique

| # | Module | Gravité | Constat | Correction | Statut |
|---|--------|---------|---------|------------|--------|
| 1 | Connexion | 🟠 | « Créer le compte administrateur initial » ne pouvait jamais aboutir : la fonction `bootstrap-admin` exige l'en-tête `X-Bootstrap-Token`, que l'écran n'envoie pas → toujours « Forbidden ». Le mot de passe s'y tapait en clair (`type="text"`). | Formulaire retiré de l'écran de connexion (la première installation se fait côté serveur avec le jeton). Clés de traduction inutilisées supprimées. | corrigé |
| 2 | Connexion | ⚪ | Lien « Mot de passe oublié ? » petit au doigt sur téléphone (≈ 16 px de haut). | — | noté |
| 3 | Connexion | 🔴 | Le 2FA du super-admin n'était exigé que par l'écran. Avec le seul mot de passe (session aal1), l'API laissait déjà lire et modifier toutes les sociétés (politiques RLS via `is_admin_general`) et appeler `super-admin-ops` / `admin-users`. | Migration `20261016120000_super_admin_exige_2fa.sql` : `is_admin_general(auth.uid())` exige `aal2`. `super-admin-ops` refuse sans aal2 ; `admin-users` ne donne les droits super-admin qu'en aal2. Simulé sur la base : aal1 → faux, aal2 → vrai. | corrigé, **à appliquer** |
| 4 | Connexion | 🟠 | `mfa-recovery-generate` décodait le jeton avec `atob` sans convertir le base64url : dès que le jeton contient `-` ou `_`, « Vérification 2FA requise » alors que le code est validé (panne aléatoire). | Décodage partagé `_shared/niveauAuth.ts`, testé. | corrigé, **à déployer** |
| 5 | Connexion | 🟡 | Écran du code 2FA et écran « changer le mot de passe » : aucune sortie. Téléphone perdu sans codes de secours → bloqué. | Bouton « Se déconnecter » sur les deux. | corrigé |
| 6 | Connexion | 🟡 | Mot de passe réinitialisé par l'admin + 2FA : les deux écrans bloquants se superposaient, et le changement échouait (Supabase exige aal2). | Le code 2FA passe d'abord. | corrigé |
| 7 | Connexion | 🟡 | Confirmation d'un nouvel appareil : l'adresse de retour venait du lien et était insérée dans la page sans contrôle ; le repère `device_confirmed` était placé hors du `#`, donc le message « Appareil confirmé » ne s'affichait jamais. Bouton bleu hors charte. | Retour fixe vers `<site>/#/auth?device_confirmed=1`, bouton bordeaux. | corrigé, **à déployer** |
| 8 | Connexion | ⚪ | Le lien de confirmation d'appareil est un simple GET : certains antivirus de messagerie ouvrent les liens tout seuls et confirmeraient l'appareil à la place de l'utilisateur. | — (à décider : page avec bouton « Confirmer ») | noté |
| 9 | Connexion | ⚪ | Un utilisateur peut passer `must_change_password` à faux sur son propre profil sans changer de mot de passe (risque faible, c'est son compte). | — | noté |
