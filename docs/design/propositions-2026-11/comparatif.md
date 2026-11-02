# Ébène Suite — cinq visions, seconde passe

Les cinq directions changent la composition de la société **et** du cabinet. Une seule est bleue ; le poste de coordination est sombre par défaut, les flux du port sont chauds, le carnet est prévu pour la forte lumière.

| Direction | Société / cabinet | Texte / chiffres | Lumière et forme | Lisibilité terrain | Densité | Personnalité | Coût et compatibilité avec Actuel et Ébène bordeaux |
|---|---|---|---|---|---|---|---|
| Le registre bleu | Rail et journal / matrice dossiers × échéances | IBM Plex Sans / IBM Plex Mono | Blanc, bleu encre ; 2 px, sans ombre | Bonne, confort terrain nécessaire | Très forte | Rigueur du registre SYSCOHADA | Moyen ; tableaux et calculs réutilisables, rail et matrice à construire |
| Le poste de coordination | Liste d’attention / files par collaborateur | Space Grotesk / Space Mono | Sombre, ambre ; panneaux de 10 px | Moyenne par défaut, mode clair au soleil | Forte, par tâche | Responsabilité et supervision | Fort ; regroupement par attribution et priorités, données conservées |
| Le carnet de terrain | Grandes actions et agenda / fiches empilées | Atkinson Hyperlegible / Roboto Mono | Blanc pur, noir, jaune ; contours de 2 px | Priorité maximale, essai au soleil nécessaire | Modérée | Saisie franche et robuste | Moyen ; compositions nouvelles, composants et permissions conservés |
| Les dossiers prune | Maître-détail / portefeuille à languettes | Manrope / Fira Mono | Blanc, prune ; 20 px, ombre décalée | Bonne, un dossier à la fois | Modérée à bonne | Relation client et continuité | Fort ; navigation de contexte à construire, avancement réutilisé |
| Les flux du port | Balance entrées-sorties / frise datée | Barlow / Barlow Condensed | Pêche, orange brûlé ; rails et angles de 4 px | Bonne, frise verticale mobile | Bonne, temporelle | Commerce et anticipation | Fort ; balance et frise nouvelles, flux et échéances conservés |

## Compromis assumés

- **Registre :** moins de respiration pour gagner en comparaison simultanée.
- **Coordination :** pas de matrice exhaustive ; le responsable organise la lecture.
- **Terrain :** davantage de défilement et moins de chiffres visibles.
- **Dossiers :** moins de transversalité fiscale ; le client reste l’unité de travail.
- **Flux :** moins adapté au rapprochement d’écritures ; le temps devient l’axe principal.

## Fondement et limites

Le tableau actuel fournit dossiers, TVA, CNSS, IRPP, patente, pièces à traiter et avancement. Les cinq vues gardent ces informations et les quatre états français. La charge reste un nombre de dossiers et de pièces, sans heures ni capacité inventée. Les files demandent un regroupement par attribution, pas un moteur de planification. Les commandes sont des spécimens statiques sans action métier ni sauvegarde hors ligne.

Chaque direction comprend saisie de dépense et cabinet en cadres de 360 px, boutons principal et secondaire, champ, quatre états nommés et symbolisés, ligne comptable et alerte. Les sept rôles de couleur sont documentés en clair et sombre, avec un spécimen visible de chaque mode. Les ratios sRGB calculés pour texte/fond, texte/surface, secondaire/fond, secondaire/surface, états/surface et texte/bouton dépassent 4,5:1. Le contraste numérique ne garantit pas à lui seul l’usage au soleil.

Chaque vision possède deux familles Google Fonts distinctes, avec chiffres tabulaires. Internet est nécessaire au premier chargement ; des replis assurent la lecture locale. En production Electron/Capacitor, embarquer les fontes évitera cette dépendance. Les pages n’utilisent ni dépendance npm ni JavaScript.

Données fictives au 1er novembre 2026 : IRPP en retard pour septembre ; TVA et CNSS pour octobre. Patente sans objet pour la mission illustrée. Les dates ne constituent pas un calendrier fiscal validé. Les montants fiscaux répétés servent à comparer les traitements visuels. La balance distingue chiffre d’affaires et encaissements : 3 300 000 + 14 250 000 − 9 100 000 = 8 450 000 FCFA.

## Mise en œuvre

Calculs, traductions, permissions et types existants restent réutilisables. Chaque vision nécessite une composition dédiée ; aucune ne se déploie par simple substitution de couleurs. Actuel et Ébène bordeaux peuvent rester disponibles.

Adapter les jetons de src/index.css, les familles, rayons, ombres, sidebar, états et focus ; garder les correspondances de tailwind.config.ts. Revoir les badges à couleurs fixes, graphiques et barre Android. Les surcharges du confort terrain (+12,5 % de taille de base et couleurs spécifiques) doivent suivre le mode. Aucun fichier produit n’est modifié ici.

## V?rification de cette passe

Les six pages ont ?t? ouvertes dans Edge ? 360, 768 et 1?440 px : aucun d?bordement horizontal de page d?tect?. Les 70 couples de contraste document?s ont ?t? recalcul?s avec un seuil de 4,5:1 ; les mini-maquettes ont ?t? relues visuellement. Le r?seau de cet environnement ne permet pas de charger Google Fonts : le contr?le visuel porte sur les replis. Les liens des familles sont pr?sents ; le rendu typographique distant reste ? confirmer avec une connexion autoris?e.

## Recommandation

**Retenir le registre bleu pour le cœur du produit.** Sa matrice rapproche les quatre obligations de chaque client et son journal donne une forte densité utile à la comptabilité SYSCOHADA. Sa structure reste la plus proche des tableaux existants, limitant le risque face aux files et au portefeuille. Tester un grand-livre chargé et des noms longs ; conserver un véritable confort terrain à grandes cibles.

**Seconde option : le carnet de terrain**, si les PME et les saisies Android passent avant le poste comptable. Son blanc/noir/jaune, sa police hyperlisible et ses grandes actions donnent le parti pris le plus net. Il assume moins de densité et convient donc moins à la révision simultanée de nombreux dossiers.
