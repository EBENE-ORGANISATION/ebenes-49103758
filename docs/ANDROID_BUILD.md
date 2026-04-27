# Build APK Android — EBENE SERVICES

> ⚠️ **Lovable ne peut pas builder l'APK.** Lovable génère uniquement la
> config et les gabarits. La compilation Android se fait sur **ta machine
> locale** avec **Android Studio**.

## Prérequis

- **Android Studio** (Hedgehog ou plus récent) → installe automatiquement Android SDK + emulateur
- **JDK 17** (recommandé pour Gradle 8.x)
- **Node 18+** + npm (ou bun)
- Variables d'env : `ANDROID_HOME` et `JAVA_HOME` correctement définies

## 1 — Première installation (une seule fois)

```bash
git pull                        # récupérer la config Capacitor
npm install                     # installe @capacitor/android etc.
npm run build                   # génère dist/
npx cap add android             # crée le dossier android/ (~150 fichiers)
npx cap sync android            # copie dist/ dans android/app/src/main/assets/
```

## 2 — Fusionner les gabarits

Après `npx cap add android`, ouvre les fichiers générés et reporte les
sections marquées dans :

| Fichier généré                                  | Gabarit à fusionner                       |
|-------------------------------------------------|-------------------------------------------|
| `android/app/src/main/AndroidManifest.xml`     | `docs/android/AndroidManifest.template.xml` |
| `android/app/build.gradle`                      | `docs/android/build.gradle.template`      |

Points clés à vérifier :
- `applicationId = "com.ebeneservices.app"`
- `minSdkVersion = 22`, `targetSdkVersion = 34`, `compileSdk = 34`
- `versionCode = 1`, `versionName = "1.0.0"`
- `android:label = "EBENE SERVICES"`
- Permissions : `INTERNET`, `ACCESS_NETWORK_STATE`, `WRITE_EXTERNAL_STORAGE` (≤ API 29)

## 3 — Générer le keystore (signature release)

Le **keystore** est ta clé privée d'éditeur — sans lui tu ne peux pas
publier de mise à jour signée par la même identité. **Garde-le en sûreté
et hors du dépôt git.**

```bash
keytool -genkey -v \
  -keystore ebene-release-key.jks \
  -alias ebene-release \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "CHANGE_ME_STORE_PASSWORD" \
  -keypass  "CHANGE_ME_KEY_PASSWORD" \
  -dname "CN=EBENE SERVICES, OU=IT, O=Ebene Services, L=Ville, ST=Region, C=FR"
```

Place le `.jks` à la racine `android/` (ou ailleurs hors repo) puis :

```bash
cp docs/android/key.properties.example android/key.properties
# édite android/key.properties avec tes vrais mots de passe
```

Vérifie que `android/key.properties` et `*.jks` sont bien dans
`.gitignore` (Capacitor les ajoute par défaut).

## 4 — Build APK release

```bash
bash scripts/build-android.sh
```

APK signé : `android/app/build/outputs/apk/release/app-release.apk`

## 5 — Tester sur appareil

```bash
# Émulateur ou téléphone branché en USB (debug activé)
npx cap run android

# Ou installer l'APK release directement :
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

## 6 — À chaque update du code

```bash
git pull
npm run build
npx cap sync android
bash scripts/build-android.sh
```

## ⚠️ Sauvegarde du keystore

Si tu perds `ebene-release-key.jks`, **tu ne pourras plus jamais publier
une mise à jour de la même app sur le Play Store**. Sauvegarde-le dans
un coffre-fort (1Password, KeePass, USB chiffré…).