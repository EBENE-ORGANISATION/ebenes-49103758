#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# EBENE SERVICES — Build Windows installer (.exe NSIS)
# ─────────────────────────────────────────────────────────────────────────
#
# À exécuter sur une machine Windows ou un runner CI Windows.
# Sur Linux/macOS, electron-builder peut tenter une cross-compilation
# Windows via wine, mais le résultat n'est pas garanti.
#
# Pré-requis :
#   - Node.js 18+
#   - npm install (toutes les deps, incluant electron-builder)
#   - public/icons/icon.ico présent
#
# Sortie : dist-electron/EBENE SERVICES Setup <version>.exe
# ─────────────────────────────────────────────────────────────────────────

set -euo pipefail

echo "▶ Étape 1/3 : build du front (vite)…"
npm run build

echo "▶ Étape 2/3 : packaging Electron + génération du NSIS…"
npm run electron:build:win

echo "▶ Étape 3/3 : terminé."
echo ""
echo "✔ Installateur disponible dans : dist-electron/"
ls -la dist-electron/ 2>/dev/null || true