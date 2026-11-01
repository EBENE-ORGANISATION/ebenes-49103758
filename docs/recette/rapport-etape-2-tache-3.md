# Espace cabinet — étape 2, tâche 3

Onglet « Tableau de bord » ajouté en premier et ouvert par défaut dans « Mon cabinet ».

## Fichiers

- Créés : `src/lib/tableauCabinet.ts`, `src/hooks/data/useTableauCabinet.ts`, `src/components/cabinet/TableauCabinet.tsx`.
- Tests créés : `src/lib/tableauCabinet.test.ts`, `src/components/cabinet/TableauCabinet.test.tsx`, `src/hooks/data/useTableauCabinet.test.tsx`.
- Modifiés : `src/pages/Cabinet.tsx`, `src/pages/Cabinet.test.tsx`, `src/i18n/locales/fr.ts`, `src/i18n/locales/en.ts`.
- Présent rapport : `docs/recette/rapport-etape-2-tache-3.md`.

## Choix

- Une structure de tableau, présentée en cartes sur téléphone, conserve une seule occurrence des contenus et actions. Détail des pièces en petit texte ; dates formatées selon la langue, sans conversion UTC.
- Types conformes au JSON SQL, notamment `charge`, `marquee`, `echeance`, `dernier_mois` et `marquee.par_nom` qui peuvent être nuls.
- `permissionsMission` renvoie des niveaux textuels : `write` et `validate` correspondent au niveau fiscalité ≥ 2. Aucun bouton pour la mission paie/social, la lecture ou un dossier en départ. Le rôle vient de `useCabinet`.
- Marquage par upsert sur la clé unique prévue, sans `par`, puis invalidation de toutes les périodes et toast. Actions désactivées pendant l’enregistrement. Les tests des hooks vérifient deux marquages successifs et le refus d’écriture.
- Rafraîchissement toutes les 30 secondes, comme `useCabinet`. Aucune règle métier fiscale recalculée dans l’interface.
- Tests de page adaptés au nouvel onglet par défaut ; tests de composant en français couvrant toutes les assertions de l’étape 1, plus les cas de lecture, départ, retard, valeurs nulles et états de requête.

## Vérification et points ouverts

- `npx.cmd tsc --noEmit -p tsconfig.app.json` : succès après ajout des composants et tests.
- Vitest ciblé tenté : démarrage bloqué par esbuild (`Cannot read directory "../..": Accès refusé`, configuration non résolue). Aucun test exécuté ici ; tests relus. À exécuter par le mainteneur : les quatre fichiers de tests cités ci-dessus, puis la suite complète.
- Recette visuelle ordinateur/téléphone et recette sur TEST à réaliser par le mainteneur. Aucun accès à la base effectué.
- Aucune dépendance, migration ou test SQL modifié ; aucun commit ni push. La modification préexistante du plan et les fichiers non suivis signalés ont été laissés intacts.

## Relecture (Claude)

- Le droit de marquer se calculait avec la mission du dossier. Pour un collaborateur ou un stagiaire, la base applique la mission de son attribution (`mes_dossiers_cabinet`). Le composant lit désormais `useDossiersCabinet` : mission, rôle et état du lien du membre connecté. Sans lien, aucun bouton. Deux tests ajoutés : attribution « Lecture » sur un dossier en tenue complète, et société sans lien.
- Rafraîchissement automatique toutes les 30 s retiré : la fonction est lourde, et le tableau se recharge déjà à l'ouverture et après chaque marquage.
