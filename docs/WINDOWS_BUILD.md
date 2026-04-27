# Build Windows (.exe) — EBENE SERVICES

Guide pour générer l'installateur Windows à partir de la base React + Electron.

## Pré-requis

- **Node.js 18+** et **npm**.
- Idéalement une **machine Windows** (l'installateur NSIS est natif Windows).
  Une cross-compilation Linux→Windows est possible via `wine` mais non garantie.
- Avoir cloné le repo et exécuté `npm install`.

## Build en une commande

```bash
npm run electron:build:win
```

- Compile le bundle Vite dans `dist/`
- Empaquette l'app + Electron via `electron-builder`
- Sortie : `dist-electron/EBENE SERVICES Setup <version>.exe`

Variantes :

```bash
npm run electron:build           # cible par défaut (NSIS sous Windows)
npm run electron:build:portable  # version portable (.exe sans installation)
```

## Mode développement (live reload)

```bash
npm run electron:dev
```

Lance Vite (port 8080) et Electron en parallèle. Toute modification React
est rechargée à chaud dans la fenêtre Electron.

## Icône

L'icône Windows est `public/icons/icon.ico` (multi-résolutions 16→256).
Pour la régénérer à partir d'un PNG carré :

```bash
# Linux / macOS (ImageMagick)
magick public/icons/icon.png -define icon:auto-resize=256,128,64,48,32,16 public/icons/icon.ico
```

## Signature de code (optionnelle)

Pour distribuer l'installateur sans avertissement Windows SmartScreen,
il faut signer le `.exe` avec un certificat Authenticode. Voir la doc
electron-builder : https://www.electron.build/code-signing

## Limitations sandbox Lovable

Le sandbox Lovable **ne peut pas** générer le `.exe` final : NSIS et les
binaires Windows ne sont pas disponibles. Lovable génère uniquement la
**configuration** (Electron + electron-builder + scripts). La compilation
s'exécute sur ton poste local Windows ou via un CI (GitHub Actions
`windows-latest`, par exemple).

## Dépannage

| Symptôme | Cause / Fix |
| --- | --- |
| Fenêtre blanche | `vite.config.ts` doit avoir `base: "./"` (déjà configuré) |
| `__dirname is not defined` | Garder l'extension `.cjs` pour `electron/main.cjs` |
| `electron-builder` échoue sous Linux | Builder sur Windows ou utiliser un runner CI Windows |
| Icône absente | Vérifier `public/icons/icon.ico` |