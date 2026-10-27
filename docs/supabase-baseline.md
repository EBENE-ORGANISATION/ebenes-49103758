# Schéma de référence Supabase (baseline du 2026-10-27)

## Pourquoi

Le 2026-10-27, une branche Supabase créée depuis la production a échoué
(`MIGRATIONS_FAILED`) après 28 migrations sur 90 : des migrations recréaient des
règles déjà créées, et l'historique de la production (`supabase_migrations.schema_migrations`)
ne correspondait plus aux fichiers du dépôt (19 migrations d'octobre enregistrées
sous d'autres numéros, 2 versions sans fichier, 6 fichiers appliqués à la main sans
être enregistrés). Rejouer les fichiers ne redonnait donc pas la production.

## Ce qui a été fait

- `supabase/migrations/20261027000000_baseline.sql` : schéma `public` tiré de la
  production (`pg_dump 17.11 --schema-only --schema=public --quote-all-identifiers`).
  Seules retouches : méta-commandes `\restrict`, `CREATE SCHEMA "public"`,
  `search_path` limité à la transaction, `RESET ALL` final.
- `supabase/migrations/20261027000001_baseline_complements.sql` : ce qui est hors
  de `public` (extensions, déclencheur `on_auth_user_created` sur `auth.users`,
  compartiment `backups`, règles `storage` des logos, publication temps réel de
  `app_state`). Idempotent.
- Les 94 anciens fichiers sont dans `supabase/migrations_archive/`, pour l'historique
  seulement : ils ne sont plus rejoués.
- `supabase/maintenance/realigner-historique-baseline.sql` : remplace l'historique
  de la production par les deux versions ci-dessus. Le SQL complet y est recopié,
  car **les branches Supabase rejouent la colonne `statements` de l'historique de
  la production, pas les fichiers du dépôt**.

## Étapes restantes (par l'utilisateur)

1. Fusionner la branche dans `main`.
2. Lancer `supabase/maintenance/realigner-historique-baseline.sql` dans l'éditeur SQL
   de la production. Il refuse de s'exécuter si l'historique n'est pas celui relevé
   le 2026-10-27 (90 versions, dernière `20261024142446`) et garde l'ancien dans
   `supabase_migrations.schema_migrations_avant_baseline`.
3. Créer une branche de test pour vérifier qu'une base neuve se construit.

## Sur une base neuve, à refaire à la main

- Le secret du coffre `internal_webhook_secret` (valeur secrète, jamais dans le dépôt).
- La tâche cron quotidienne des alertes, si on la veut. Celle de la production
  (`notification-alertes-daily`) appelle l'ancien projet `nmeyylvltlvvcvbhvxpz` :
  elle n'est pas reprise telle quelle.
- Le compartiment `logos-societes`, utilisé par l'application mais absent de la
  production au 2026-10-27 (les règles d'accès, elles, existent).

## Règles pour la suite

- Toute nouvelle migration a un numéro postérieur à `20261027000001`.
- Appliquer une migration sous **le même numéro que son fichier** (nom compris),
  sinon l'historique diverge à nouveau.
- Pour refaire un schéma de référence : même commande `pg_dump`, via le pooler
  `aws-0-eu-west-1.pooler.supabase.com:5432`, utilisateur `postgres.yblucgmxofyelziwlvxu`.
