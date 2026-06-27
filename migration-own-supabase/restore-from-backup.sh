#!/usr/bin/env bash
# ============================================================================
#  EBENE Business Suite — Restauration depuis backup-YYYYMMDD.zip
# ----------------------------------------------------------------------------
#  Usage :
#    export PGHOST=db.<ref>.supabase.co
#    export PGPORT=5432
#    export PGUSER=postgres
#    export PGPASSWORD='votre-mot-de-passe'
#    export PGDATABASE=postgres
#    ./restore-from-backup.sh ./backup-20260627.zip
#
#  Pré-requis sur le nouveau projet :
#    - Toutes les migrations SQL du dossier supabase/migrations/ ont été
#      appliquées (schéma identique).
#    - Les comptes auth.users ont été recréés (mêmes UUID si possible)
#      via l'API Admin Supabase. Sinon, mettez à jour le mapping plus bas.
#
#  Le script :
#    1) décompresse l'archive dans /tmp,
#    2) désactive temporairement les triggers (audit + notify) pour éviter
#       de polluer audit_log et d'envoyer des webhooks pendant l'import,
#    3) importe chaque CSV via COPY ... FROM STDIN dans l'ordre des
#       dépendances FK,
#    4) réactive les triggers,
#    5) recale les séquences (bigserial).
# ============================================================================
set -euo pipefail

ZIP="${1:-}"
if [[ -z "$ZIP" || ! -f "$ZIP" ]]; then
  echo "❌ Usage : $0 chemin/vers/backup-YYYYMMDD.zip" >&2
  exit 1
fi

: "${PGHOST:?PGHOST manquant}"
: "${PGUSER:?PGUSER manquant}"
: "${PGPASSWORD:?PGPASSWORD manquant}"
: "${PGDATABASE:=postgres}"
: "${PGPORT:=5432}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "📦 Décompression de $ZIP → $WORK"
unzip -q "$ZIP" -d "$WORK"
CSV_DIR="$(find "$WORK" -maxdepth 2 -name '*.csv' | head -1 | xargs dirname)"
echo "   CSV trouvés dans : $CSV_DIR"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

# ----------------------------------------------------------------------------
# Ordre d'import (parents → enfants). Respecte les FK définies dans le schéma.
# ----------------------------------------------------------------------------
ORDER=(
  # 1) Identité & rôles (auth.users doit déjà exister)
  profiles
  societes
  societe_config
  user_societes
  user_roles
  services
  service_membres
  custom_services
  custom_postes
  user_custom_postes
  cross_service_grants
  permission_overrides
  user_feature_access

  # 2) Référentiel métier
  params_annuels
  taux_historique
  categories_stock
  articles
  fournisseurs
  fiscal_delegations

  # 3) RH
  employes
  bulletins_paie
  absences
  sanctions
  primes
  retenues
  heures_sup

  # 4) Comptabilité / commerce / stock
  ecritures_comptables
  factures
  devis
  transactions
  immobilisations
  mouvements_stock

  # 5) Portail / messagerie / sécurité
  portail_messages
  alertes_lues
  device_sessions
  device_otps
  mfa_recovery_codes
  email_unsubscribe_tokens
  email_send_state
  email_send_log
  suppressed_emails
  app_state

  # 6) Audit en dernier (peut référencer n'importe quoi)
  audit_log
)

# Tables intentionnellement IGNORÉES (régénérées automatiquement) :
#   - aucune pour l'instant. Ajoutez ici si besoin.
SKIP=()

contains() { local n="$1"; shift; for x in "$@"; do [[ "$x" == "$n" ]] && return 0; done; return 1; }

echo "🛑 Désactivation temporaire des triggers utilisateur"
"${PSQL[@]}" <<'SQL'
SET session_replication_role = replica;
SQL

import_one() {
  local table="$1"
  local file="$CSV_DIR/${table}.csv"
  if [[ ! -f "$file" ]]; then
    echo "   ⏭  $table : aucun CSV, ignoré"
    return
  fi
  local rows
  rows=$(($(wc -l < "$file") - 1))
  if (( rows <= 0 )); then
    echo "   ⏭  $table : vide"
    return
  fi

  # En-tête du CSV → liste des colonnes à importer (gère les colonnes ajoutées/retirées)
  local cols
  cols=$(head -1 "$file")
  echo "   ⬆  $table  ($rows lignes)"

  # session_replication_role doit être positionné dans la MEME session que COPY
  PGOPTIONS='-c session_replication_role=replica' \
    psql -v ON_ERROR_STOP=1 -X -q \
      -c "\\COPY public.${table} (${cols}) FROM '${file}' WITH (FORMAT csv, HEADER true, NULL '')"
}

echo "📥 Import des tables dans l'ordre des dépendances"
for t in "${ORDER[@]}"; do
  if contains "$t" "${SKIP[@]+"${SKIP[@]}"}"; then
    echo "   ⏭  $t (skip explicite)"
    continue
  fi
  import_one "$t"
done

# Tables présentes dans le ZIP mais absentes de ORDER → tentative best-effort
for f in "$CSV_DIR"/*.csv; do
  t="$(basename "$f" .csv)"
  if ! contains "$t" "${ORDER[@]}" && ! contains "$t" "${SKIP[@]+"${SKIP[@]}"}"; then
    echo "   ❓ $t : non listé dans ORDER, import best-effort en dernier"
    import_one "$t" || echo "      ⚠️  $t : import échoué (probablement FK)"
  fi
done

echo "🔄 Recalage des séquences (bigserial)"
"${PSQL[@]}" <<'SQL'
DO $$
DECLARE
  r RECORD;
  v_max BIGINT;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name, c.column_name,
           pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) AS seq
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) IS NOT NULL
  LOOP
    EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I.%I', r.column_name, r.table_schema, r.table_name) INTO v_max;
    EXECUTE format('SELECT setval(%L, GREATEST(%s, 1), %L)', r.seq, v_max, v_max > 0);
    RAISE NOTICE 'seq % → %', r.seq, v_max;
  END LOOP;
END $$;
SQL

echo "✅ Réactivation des triggers"
"${PSQL[@]}" <<'SQL'
SET session_replication_role = origin;
SQL

echo "🎉 Restauration terminée."
echo "   Pensez à :"
echo "     • recréer les comptes auth.users (API Admin) avec les mêmes UUID"
echo "     • réuploader le bucket Storage logos-societes"
echo "     • reconfigurer les Vault secrets (internal_webhook_secret, etc.)"
echo "     • redéployer les Edge Functions"