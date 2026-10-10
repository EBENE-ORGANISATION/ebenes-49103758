# Thèmes par société — spécification

Date : 10/10/2026
Statut : **non retenue en entier.** Le 10/10/2026, le propriétaire a choisi la version allégée :
verrou super-admin (lot 1, section 5) + réglage « confort terrain » par société (`theme_custom.confort`)
+ une seule refonte visuelle pour toute l'application (direction à choisir). Le reste de ce document
(10 thèmes, mélange des 5 réglages, écran Apparence) reste en réserve.
Maquettes de référence : canevas « Ébène Suite — Directions de design » (10 directions).

## 1. Objectif

Permettre au super-admin de donner à chaque société une apparence choisie parmi les
10 directions de design, avec la possibilité de mélanger des réglages issus de
directions différentes. Seul le super-admin décide de l'apparence.

### Ce que le propriétaire a demandé

- Garder toutes les directions et pouvoir les choisir au cas par cas.
- Choix **par société**, avec **mélange** possible (couleurs d'une direction, police d'une autre…).
- **Seul le super-admin** décide.

### Hypothèses (non dites, à confirmer à la relecture)

- Les sociétés existantes ne changent pas d'apparence tant que le super-admin n'a rien choisi.
- La console Ébène Suite (super-admin sans société ouverte) garde l'apparence d'origine.
- Les PDF (factures, devis, bulletins) ne changent pas dans cette étape.

### Critères de réussite

1. Le super-admin choisit et enregistre l'apparence d'une société en moins d'une minute, avec aperçu.
2. Tout utilisateur de cette société voit l'apparence dès l'ouverture, sur web, Windows et Android, y compris hors connexion.
3. Un administrateur de société ne peut pas modifier l'apparence, ni par l'écran ni par un appel direct à la base.
4. Aucune combinaison proposée ne descend sous le contraste AA (4,5:1 texte, 3:1 composants).
5. Pas de hausse mesurable du temps d'ouverture : le chunk principal ne grossit pas de plus de 15 Ko.

## 2. Existant

- `src/lib/theme.ts` applique déjà par société 3 couleurs (`couleur_primaire`, `couleur_secondaire`,
  `couleur_accent`) et une police (`police`) issues de `societe_config`, via les variables CSS de `src/index.css`.
- `useTenant` appelle `applyTheme` à l'ouverture d'une société, `resetTheme` sinon.
- `ParametresSociete.tsx` permet à l'**administrateur de société** de modifier ces couleurs.
- La politique RLS « Update societe_config » autorise l'admin général **et** l'admin de la société.
- La colonne `societe_config.theme_custom jsonb` existe et n'est utilisée nulle part.
- Les polices viennent de Google Fonts (Poppins, IBM Plex Mono), donc indisponibles hors connexion.

## 3. Modèle d'apparence

Une apparence est composée de **5 réglages indépendants** :

| Réglage | Valeurs | Variables touchées |
|---|---|---|
| `palette` | `ebene`, `grand-livre`, `kente`, `plein-soleil`, `sceau`, `bordeaux`, `calendrier`, `phrase`, `machines`, `tontine`, `personnalise` | toutes les couleurs de `index.css` (fond, cartes, primaire, accent, bordures, états, barre latérale, dégradé d'en-tête) |
| `typo` | une paire titre/texte par direction (10 paires) | `--font-base`, nouvelle `--font-titre`, nouvelle `--font-chiffres` |
| `forme` | `doux` (arrondis 12 px, ombres), `net` (arrondis 6 px, filets, sans ombre), `franc` (angles droits, bordures 2 px) | `--radius`, `--shadow-card`, `--shadow-elevated`, nouvelle `--bordure` |
| `densite` | `compacte`, `normale`, `terrain` (cibles 56 px, texte 18 px) | nouvelles `--hauteur-controle`, `--taille-texte`, `--espacement` |
| `mode` | `clair`, `sombre` (seulement si la palette fournit les deux) | classe `dark` sur `<html>` |

Une **direction** est un préréglage des 5 valeurs. Le super-admin part d'une direction puis
remplace un ou plusieurs réglages.

Valeur stockée dans `societe_config.theme_custom` :

```json
{ "version": 1, "direction": "bordeaux", "palette": "bordeaux", "typo": "plein-soleil",
  "forme": "net", "densite": "terrain", "mode": "clair" }
```

Objet vide `{}` = apparence actuelle de la société (couleurs existantes, police existante), donc aucun changement
pour les sociétés existantes.

## 4. Composants

### 4.1 `src/lib/apparence/` (nouveau)

- `catalogue.ts` : définition des 10 palettes (clair et, si prévu, sombre), 10 paires typographiques,
  3 formes, 3 densités, 10 directions. Données pures, aucune dépendance.
- `resoudre.ts` : `resoudreApparence(themeCustom, configSociete) → JeuDeVariables`. Valide le JSON
  (valeur inconnue → valeur de la direction, puis valeur par défaut), gère `personnalise` à partir des
  3 couleurs existantes. Fonction pure, testée.
- `appliquer.ts` : écrit le jeu de variables sur `<html>`, pose `dark` si besoin, charge la police
  à la demande. Remplace l'appel actuel à `applyTheme` ; `theme.ts` garde titre d'onglet et favicon.
- `polices.ts` : correspondance typo → `import()` dynamique des fichiers `@fontsource/*` (woff2, latin,
  graisses utilisées seulement). Rien n'est chargé tant qu'aucun thème ne l'utilise.

### 4.2 Logo

Le composant d'en-tête affiche le logo en SVG inline coloré par `currentColor` (cernes et nom) et
`--accent` (« SUITE »), au lieu d'une image fixe. Il suit donc la palette.

### 4.3 Écran « Apparence » (super-admin)

Dans `SuperAdminPanel`, nouvel onglet :

1. liste des sociétés avec l'apparence actuelle de chacune (nom de direction ou « Mélange ») ;
2. pour la société choisie : sélecteur de direction (vignettes du canevas), puis les 5 réglages ;
3. aperçu en direct dans un cadre (tableau de bord réduit + téléphone) ; l'application elle-même ne change pas tant que rien n'est enregistré ;
4. boutons « Enregistrer l'apparence » et « Revenir à l'apparence actuelle ».

Les combinaisons dont le contraste échoue (vérifié par `resoudre.ts`) sont désactivées avec la raison affichée.

### 4.4 `ParametresSociete.tsx`

La section couleurs/police devient en lecture seule pour l'admin de société, avec la mention
« L'apparence est choisie par le super-administrateur. »

## 5. Sécurité — super-admin seul

Migration `2026101xxxxxxx_apparence_super_admin.sql` :

- déclencheur `BEFORE UPDATE` sur `societe_config` : si `theme_custom`, `couleur_primaire`,
  `couleur_secondaire`, `couleur_accent` ou `police` changent et que `public.is_admin_general(auth.uid())`
  est faux, l'opération est refusée (`raise exception 'Apparence réservée au super-administrateur'`) ;
- la politique RLS existante reste inchangée pour les autres colonnes ;
- `GRANT` vérifiés (rappel : une colonne ou table sans GRANT renvoie 403).

## 6. Flux

1. Ouverture d'une société → `useTenant` lit `societe_config` → `resoudreApparence` → `appliquer`.
2. Hors connexion (Android) : la dernière apparence résolue est gardée en `localStorage` par société et
   appliquée avant la réponse réseau, ce qui évite un changement d'apparence à l'écran au démarrage.
3. Enregistrement par le super-admin → mise à jour `theme_custom` → les sessions ouvertes de la société
   appliquent le nouveau thème à la prochaine ouverture (pas de temps réel dans cette étape).

## 7. Erreurs

- JSON invalide ou valeur inconnue : repli silencieux sur la direction, puis sur l'apparence actuelle ; journal console.
- Police non chargée (fichier manquant) : repli sur la pile système, l'interface reste utilisable.
- Refus de la base : message « Apparence réservée au super-administrateur. » côté écran.

## 8. Tests

- Unitaires (`vitest`) : `resoudreApparence` sur chaque direction, sur 20 mélanges, sur JSON invalide,
  sur `{}` ; contraste calculé de chaque palette (clair et sombre) contre ses fonds.
- Base : essai SQL sur la société « EBENE SERVICES - TEST » : admin de société refusé, super-admin accepté.
- Visuel : captures des écrans principaux (tableau de bord, journal, facture, paie, menu téléphone)
  sous les 10 directions, en ordinateur et téléphone.
- Poids : comparaison de la taille du chunk principal avant/après.

## 9. Lots de livraison

1. **Verrou super-admin** (déclencheur + lecture seule) — utile seul, indépendant du reste.
2. **Moteur** (`catalogue`, `resoudre`, `appliquer`, polices locales) avec 3 directions complètes, sans mélange.
3. **Écran Apparence** avec aperçu.
4. **Les 7 autres directions** et le **mélange** des 5 réglages.

Chaque lot est livrable et versionné séparément.

## 10. Hors périmètre

- Écrans propres à une direction (accueil calendrier, mois en phrases, console multi-sociétés,
  circuit de validation) : spécifications séparées.
- Couleurs des PDF.
- Choix de l'apparence par l'utilisateur final.
- Application en temps réel aux sessions déjà ouvertes.
