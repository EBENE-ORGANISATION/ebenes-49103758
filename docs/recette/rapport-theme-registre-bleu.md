# Thème « Registre bleu » — 2 novembre 2026

Ajout du troisième thème par société, réservé au super-admin. La composition des pages reste identique. Aucun accès à la base, aucune installation, aucun commit ni push.

## Fichiers et choix

- `src/lib/apparence.ts` et `apparence.test.ts` : troisième valeur, lecture, conservation des réglages et retour au défaut.
- `src/lib/theme.ts`, `theme.test.ts`, `polices-registre-bleu.ts` : aiguillage unique, nettoyage des variables de société, chargement différé des six graisses IBM Plex déjà installées, confort et identité d’onglet communs.
- `src/index.css` : palettes fidèles à `direction-1.html`, angles de 2 px, cartes sans ombre, titres IBM Plex Sans 600, montants IBM Plex Mono, rail bleu à texte blanc et élément actif en bleu encre. Accent vert de succès pour distinguer les séries des graphiques. Aplat d’en-tête, bleu encre pour les zones système Android. Bordures de champ gris-bleu `#7c8da3` ; confort terrain renforcé, sans dérive brune.
- `src/pages/ParametresSociete.tsx` : aperçu, troisième choix et test factorisé des couleurs imposées pour tous les thèmes autres qu’Actuel. Contrôles du super-admin conservés pour le choix et l’enregistrement.
- `src/i18n/locales/fr.ts` et `en.ts` : nom et aide traduits.

## Contrastes

Calcul WCAG sRGB : `(Lmax + 0,05) / (Lmin + 0,05)`. Jetons HSL convertis depuis les hexadécimaux avec cinq décimales ; ratios arrondis à deux décimales.

| Couple | Clair | Sombre |
|---|---|---|
| Texte / fond | `#172b46` / `#e4e8ee` : **11,61:1** | `#edf4ff` / `#101d30` : **15,30:1** |
| Texte / carte | `#172b46` / `#ffffff` : **14,28:1** | `#edf4ff` / `#192c44` : **12,78:1** |
| Secondaire / carte | `#465b73` / `#ffffff` : **6,99:1** | `#b5c9e3` / `#192c44` : **8,37:1** |
| Texte d’action / action | `#ffffff` / `#174a93` : **8,62:1** | `#111111` / `#93bdff` : **9,86:1** |
| Bordure de champ / carte | `#7c8da3` / `#ffffff` : **3,39:1** | `#7c8da3` / `#192c44` : **4,17:1** |
| Texte du menu / menu | `#ffffff` / `#174a93` : **8,62:1** | Même couple : **8,62:1** |

En terrain, champ/carte : **6,99:1** en clair (`#465b73`) et **8,37:1** en sombre (`#b5c9e3`). Les bordures générales terrain utilisent `#7c8da3`, soit **3,39:1** et **4,17:1**. Warning clair `#765313` sur blanc : **6,96:1** ; info clair `#174a93` sur blanc : **8,62:1**.

## Vérifications et points ouverts

- `npx.cmd tsc --noEmit -p tsconfig.app.json` : réussi.
- Vitest ciblé : **2 fichiers, 10 tests réussis**. Le lancement standard est bloqué par l’accès d’esbuild au répertoire parent ; lancement via `startVitest`, `configLoader: "runner"` et `globalThis.__dirname = process.cwd()`, sans modifier la configuration du dépôt.
- Compilation PostCSS/Tailwind : réussie, aucun avertissement. Contrôle des sélecteurs et de la cascade des jetons pour les quatre combinaisons clair/sombre × normal/terrain. Présence des six fichiers de fontes vérifiée.
- Aucun test existant de `ParametresSociete` ; aucun test de cette page ajouté. Validation visuelle interactive et essai réel Android/soleil restent à faire.
- Recherche dans `src/` : aucun autre aiguillage sur le thème à étendre. `Dashboard.tsx` et `SuperAdminPanel.tsx` utilisent les jetons CSS pour les graphiques, donc héritent de la palette. Les formes propres aux graphiques restent inchangées.
- `components/impression/styleDocument.tsx` conserve sa charte A4 autonome (Source Sans/Serif, couleurs fixes et couleur de société passée explicitement). La faire suivre du thème demanderait de traiter tous les exports ensemble ; laissé ouvert pour préserver PDF et Word. Les montants imprimés gardent leur alignement existant.
- `components/AndroidUpdateChecker.tsx` conserve ses deux couleurs bordeaux de la fenêtre de mise à jour ; les barres système de `index.css` sont corrigées pour Registre bleu.
- Modifications préexistantes de `package.json`, `package-lock.json`, `docs/design/propositions-2026-11/comparatif.md` conservées. Fichiers non suivis interdits laissés intacts. Fichiers ajoutés et modifiés en UTF-8 sans BOM.

## Relecture (Claude)

- `--accent` passait au vert « faite ». L'application s'en sert pour les survols et les mises en avant (`bg-accent` dans 36 composants) : il prend désormais le bleu de l'action, `#174a93` en clair et `#93bdff` en sombre. Le vert reste réservé à `--success`.
- Les valeurs HSL sont arrondies à une décimale, comme dans les autres thèmes.
- Rendu vérifié sur la page de connexion, en clair et en sombre : IBM Plex chargée en local, angles de 2 px, pas d'ombre.
