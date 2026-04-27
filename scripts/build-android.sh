#!/usr/bin/env bash
# ============================================================================
# build-android.sh — Build APK release for EBENE SERVICES
# ----------------------------------------------------------------------------
# Prérequis (poste local, pas Lovable) :
#   - Node 18+, npm/bun
#   - Android Studio + Android SDK (API 34)
#   - JDK 17 (Gradle 8.x)
#   - android/key.properties configuré (voir docs/ANDROID_BUILD.md)
#
# Usage : bash scripts/build-android.sh
# Output: android/app/build/outputs/apk/release/app-release.apk
# ============================================================================
set -euo pipefail

echo "▶ 1/3  Build web (vite) → dist/"
npm run build

echo "▶ 2/3  Sync Capacitor → android/"
npx cap sync android

echo "▶ 3/3  Gradle assembleRelease"
cd android
./gradlew assembleRelease

APK="app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK" ]; then
  echo "✅ APK généré : android/$APK"
  ls -lh "$APK"
else
  echo "❌ APK introuvable — vérifier la signature (key.properties)" >&2
  exit 1
fi