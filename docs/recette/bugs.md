# Journal des anomalies — recette 2026-10

Gravité : 🔴 bloquant / faux calcul / faille · 🟠 fonction cassée · 🟡 gênant · ⚪ cosmétique

| # | Module | Gravité | Constat | Correction | Statut |
|---|--------|---------|---------|------------|--------|
| 1 | Connexion | 🟠 | « Créer le compte administrateur initial » ne pouvait jamais aboutir : la fonction `bootstrap-admin` exige l'en-tête `X-Bootstrap-Token`, que l'écran n'envoie pas → toujours « Forbidden ». Le mot de passe s'y tapait en clair (`type="text"`). | Formulaire retiré de l'écran de connexion (la première installation se fait côté serveur avec le jeton). Clés de traduction inutilisées supprimées. | corrigé |
| 2 | Connexion | ⚪ | Lien « Mot de passe oublié ? » petit au doigt sur téléphone (≈ 16 px de haut). | — | noté |
