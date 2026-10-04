# EBENE SERVICES

Système de gestion d'entreprise (ERP léger) pour les PME de l'espace OHADA, avec une comptabilité conforme au référentiel **SYSCOHADA**.

Disponible en application web, en application de bureau Windows (Electron) et en application Android (Capacitor).

## Fonctionnalités

| Module | Contenu |
| --- | --- |
| Tableau de bord | Indicateurs clés, trésorerie, alertes |
| Comptabilité | Plan comptable SYSCOHADA, écritures, exports comptables |
| Factures & devis | Création, aperçu, numérotation automatique, export PDF / Word, saisie de factures par OCR |
| Fiscalité | Taux d'impôts et leur historique, calculs fiscaux |
| Immobilisations | Amortissements, cessions |
| Stock | Suivi des stocks |
| GRH & paie | Employés, bulletins de paie PDF, récapitulatif annuel, délégations |
| Portail employé | Espace personnel de chaque salarié (bulletins, informations) |

### Administration et sécurité

- Gestion des utilisateurs et des rôles, journal d'audit
- Multi-sociétés et multi-activités
- Espace super-admin pour la plateforme
- Double authentification (MFA) avec codes de secours, validation des nouveaux appareils, changement de mot de passe forcé
- Corbeille (suppression réversible)
- Sauvegarde vers Google Drive, notifications par e-mail
- Interface en français et en anglais

## Stack technique

- **Frontend** : React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, i18next
- **Backend** : [Supabase](https://supabase.com) (Postgres, Auth, Edge Functions)
- **Bureau** : Electron + electron-builder, mises à jour automatiques via GitHub Releases
- **Mobile** : Capacitor (Android)
- **Tests** : Vitest, Testing Library

## Structure du projet

```
src/
  pages/            Pages routées (accueil, bulletins, admin, super-admin, corbeille…)
  components/ebene/ Modules métier (comptabilité, factures, GRH, stock…)
  components/       Auth, admin, portail employé, composants UI
  lib/              Logique métier (amortissements, exports SYSCOHADA, PDF, permissions…)
  i18n/             Traductions (fr, en)
supabase/
  migrations/       Schéma de la base de données
  functions/        Edge Functions (utilisateurs, MFA, e-mails, OCR, sauvegarde…)
electron/           Processus principal Electron
android/            Projet Android (Capacitor)
docs/               Guides de build Windows et Android
```

## Démarrage

Prérequis : Node.js 18+ et npm.

```bash
npm install
```

Créez un fichier `.env` à la racine avec les informations de votre projet Supabase :

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_PROJECT_ID=...
```

Lancez le serveur de développement (http://localhost:8080) :

```bash
npm run dev
```

## Scripts

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur de développement Vite |
| `npm run build` | Build de production web (`dist/`) |
| `npm run lint` | Analyse ESLint |
| `npm test` | Tests Vitest |
| `npm run electron:dev` | Application de bureau en mode développement |
| `npm run electron:build:win` | Installeur Windows (`dist-electron/`) |
| `npm run electron:build:portable` | Version portable Windows |

## Builds

- Windows : voir [docs/WINDOWS_BUILD.md](docs/WINDOWS_BUILD.md)
- Android : voir [docs/ANDROID_BUILD.md](docs/ANDROID_BUILD.md)

## Publier une version

La version web est republiée automatiquement par Cloudflare Pages (connecté au dépôt) à chaque push sur `main`.

Windows et Android sont construits et publiés par GitHub Actions :

| Workflow | Déclencheur | Résultat |
| --- | --- | --- |
| `release.yml` | tag `vX.Y.Z` | Release GitHub avec le Setup Windows (+ `latest.yml` pour la mise à jour automatique) et l'APK signé |

Pour publier la version `2.3.0` :

```bash
npm version 2.3.0 --no-git-tag-version
git commit -am "Release v2.3.0"
git tag v2.3.0
git push origin main v2.3.0
```

La release reste en brouillon tant que les builds Windows et Android n'ont pas tous deux réussi.

Secrets requis pour signer l'APK (Settings → Secrets and variables → Actions) :

- Android : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`

---

© EBENE SERVICES
